# AI Reliability — fallback + circuit breaker + graceful degrade

When the AI provider is down (Anthropic 503 burst, OpenAI 429 storm, network
flake), the runtime should not return 500s. It should try the fallback model,
short-circuit while the provider is broken, and surface a clean "AI
temporarily unavailable" message instead of leaking SDK errors into the UI.

This doc covers the three pieces that make that work and the trade-offs we
made.

## Files

- `lib/ai/circuit-breaker.ts` — per-provider state machine. closed → open →
  half-open. Module-level Map; resets on cold start.
- `lib/ai/model-fallback.ts` — primary-then-fallback wrapper. Calls the
  breaker, picks the right attempt, falls over on retryable failures, throws
  `AllProvidersUnavailableError` if both are out.
- `lib/ai/availability.ts` — `isAIAvailable()` boolean for UIs + banners.
- Wired into `lib/agent/runtime/executor.ts`,
  `lib/agent/runtime/orchestrator.ts`, and `app/api/chat/stream/route.ts`.

## Circuit-breaker thresholds

Defaults (see `DEFAULT_CIRCUIT_CONFIG`):

| Setting          | Value | Why                                         |
| ---------------- | ----- | ------------------------------------------- |
| failureThreshold | 5     | Tolerates a few transient 5xx before tripping |
| windowMs         | 60000 | 60-second rolling failure window            |
| cooldownMs       | 30000 | 30 seconds open before half-open probe      |

The state machine:

```
closed ── 5 failures in 60s ──▶ open
   ▲                              │
   │                              │ 30s cooldown
   │ probe success                ▼
   └────────────────────────── half-open
                                  │
                                  └ probe failure ──▶ open (cooldown resets)
```

In half-open, exactly one call is admitted as a probe. Concurrent callers
during half-open see `allow: false` until the probe records its outcome.

## Fallback chain in use

Set per-call-site via the `runtime_model_assignments.fallback_model_id`
column (admin-editable, no code change required). When unset, no fallback —
a retryable failure on the primary throws `AllProvidersUnavailableError`,
which the call site catches and returns friendly degrade copy.

| Primary call_kind | Default primary           | Typical fallback         | Same provider? |
| ----------------- | ------------------------- | ------------------------ | -------------- |
| executor          | claude-haiku-4-5          | claude-haiku-4-5 (none)  | yes            |
| orchestrator      | claude-sonnet-4-5-20250929 | claude-haiku-4-5         | yes            |
| formatter         | claude-haiku-4-5          | claude-haiku-4-5         | yes            |
| classifier        | gpt-4o-mini               | (none — JSON-strict)     | yes            |
| chat-stream       | claude-haiku-4-5          | none (streaming)         | yes            |
| embeddings        | text-embedding-3-small    | none (no good substitute) | yes            |

The executor/orchestrator use **same-provider** fallbacks (e.g. Sonnet →
Haiku, both Anthropic) because tool-use messages are not portable between
provider APIs without a non-trivial conversion layer. Cross-provider
fallback (Anthropic → OpenAI) is useful for tool-less calls; the
`suggestFallback()` helper in `model-fallback.ts` exposes the chain for
callers that want it (`claude-haiku-*` → `gpt-4o-mini`, `gpt-4o*` →
`claude-haiku-4-5`, etc.).

When the whole provider is down (circuit fully open) the call sites
return the friendly outage message via `AI_UNAVAILABLE_MESSAGE` from
`availability.ts` instead of bubbling a 500 to the user.

## Graceful degrade behaviour per surface

- **Executor / orchestrator** — on full outage, the dispatcher returns
  `{ text: AI_UNAVAILABLE_MESSAGE, usage: [] }`. No tool calls are made;
  no half-completed actions land in the workspace.
- **Chat stream** — pre-stream gate via `isAIAvailable()`. On full
  outage, the user's turn is still persisted (so it'll be answered when
  the provider recovers) and the SSE stream emits one delta with the
  outage text + `done`. If the breaker opens mid-stream, the in-flight
  reader catches the SDK error, records a failure, and yields the
  outage text as the final delta — the client UI doesn't see an error
  event.
- **Pending-approval phrasing turn** — on outage the call sites return
  the pre-built `I'd like to <summary>. Reply YES to confirm.` text
  instead of the LLM-phrased version. The action still pauses correctly.

## Cost ledger interaction

The `recordAttempt` callback in `model-fallback.ts` is wired to write a
`recordAiCall(status: "error")` row for every failed or skipped attempt.
Successful attempts are logged from the call site with full token counts
(the wrapper sees only the model response, not the SDK usage struct, so
the success row goes through the existing per-site `recordAiCall`).
Net effect: one ledger row per attempt, just like before, plus a clear
audit trail for fallback events.

## Trade-offs

**State is per-Vercel-node and resets on cold start.** A truly shared
breaker needs Redis (or a server we control). For our traffic profile a
single hot serverless instance handles most calls, so the per-instance
counters trip quickly when a provider is genuinely down. The downside is
that a freshly-deployed node will let through the first 5 failures
before tripping — acceptable for now, but if outage UX gets fancier
we'll want to centralise this.

**Same-provider fallback only on tool paths.** Cross-provider tool-use
conversion (Anthropic ↔ OpenAI tool-call schemas) is doable but not
worth doing until we hit a real outage that lasts longer than Anthropic's
self-healing. When that happens, swap the executor/orchestrator's
`fallback` thunk for a no-tool plain-text Claude → GPT path that
returns a "this would have done X" summary.

**Aborts don't poison the breaker.** A user clicking stop is not a
provider-health signal, so `APIUserAbortError` / `AbortError` skip the
failure counter (see `isRetryableError`).

**Embeddings have no fallback.** OpenAI is the only sane provider for
`text-embedding-3-*`; the breaker still runs (so callers can short-
circuit on outage) but `callWithFallback({ fallback: null })` throws
`AllProvidersUnavailableError` and the caller has to decide what to do.
For search-index population we let the job retry later; for hot-path
search we return cached / SQL-fulltext results.

## Admin observability

`allSnapshots()` from `circuit-breaker.ts` returns the live state of
every provider this instance has seen. Hook it into the `/admin/status`
checklist (under "AI infrastructure") to see at a glance which
providers are open and how long until the next probe.
