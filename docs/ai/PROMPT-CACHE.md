# Prompt caching in the agent runtime

Anthropic's prompt caching lets us mark a stable prefix of an API request as cacheable for a 5-minute rolling window. The cached prefix is billed at ~10% of normal input cost on read, with a one-off 25% write premium on the call that populates the cache. The runtime's executor and orchestrator both replay the same large prefix (persona + system rules + skill catalogue + tool definitions) on every turn — that's precisely the workload caching is designed for.

## What's cached

Render order at the SDK level is `tools` → `system` → `messages`. Anthropic caches the prefix up to and including the latest `cache_control: { type: "ephemeral" }` marker, so we place breakpoints in two spots:

1. **Last tool in the `tools` array** — annotated by `cachedTools()` in `lib/agent/runtime/cache.ts`. This caches every tool definition AND the `system` field together as a single unit, because they sit before the breakpoint in render order.
2. **System block** — `cachedSystem()` wraps the whole system string as a single `TextBlockParam` with `cache_control` set. Belt-and-braces with (1); ensures we still get a cache hit when the tool list is empty (e.g. a meta-only chat).
3. **Most recent user turn** — `cachedMessages()` annotates the latest user message so multi-turn replay (turn N reading what turn N-1 cached) hits warm.

The persona prefix is concatenated into the system string before `cachedSystem()` wraps it, so persona text lives inside the cached block already. `personaCachedSystemBlock()` in `lib/agent/runtime/persona.ts` exposes the persona as its own `TextBlockParam` with `cache_control` for future call sites that want a persona-specific breakpoint (e.g. workspaces with rotating tail rules).

## Token threshold

Anthropic caches a block only if its content is ≥1024 tokens for Sonnet / Opus, ≥2048 for Haiku. Our system prompt (executor: ~600 chars persona + 1.5k chars rules) plus the full tool catalogue across 15 skills runs comfortably past 4k tokens — we clear both thresholds with margin.

If a future change shrinks the tool catalogue dramatically (e.g. a per-app chat with one skill in scope), the breakpoint becomes a no-op rather than a problem. Anthropic just charges full price on the smaller payload.

## Cache hit-rate target

Workload assumption: in-app chat panels sustain ~1 message per minute during active use; WhatsApp inbound averages ~1 per 90s in a busy workspace.

| Channel  | Inter-turn gap | Expected hit rate |
| -------- | -------------- | ----------------- |
| in-app   | < 5 min        | ≥ 90%             |
| WhatsApp | 1–10 min       | ≥ 60%             |
| Telegram | 1–10 min       | ≥ 60%             |

The 5-minute ephemeral TTL is the binding constraint. A user who pauses for 7 minutes between messages will eat a cache write on their next turn; that's fine — the cost of the write is paid back within ~2 cached reads.

We track hit rate via the Anthropic response's `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`. `totalInputTokens()` in `cache.ts` is the canonical sum.

## When to invalidate

Caching is byte-identical match on the prefix. Anything that drifts breaks the cache silently:

- **Persona row updates** — workspace admin changes `bot_name` or `voice_tone`. Next call eats a cache write.
- **Skill catalogue changes** — adding/removing tools, renaming, or even reordering `ALL_SKILLS`. We never sort tools at runtime, so deploys are the only source of drift here.
- **Per-user fields in the system prompt** — `ctx.user.email`, `ctx.role`, `ctx.tier`, and `ctx.workspaceId` are all in the system prompt today. This means each user pays their own cache write on their first call, but reads stay shared across that user's session.

If we ever want to share cache across users in the same workspace, we'd need to move the user-identity fields out of the cached `system` block and into the (uncached) user turn. Not worth it today — workspace admins are typically the only heavy users.

## PII redaction interaction

`redact()` in `lib/agent/runtime/redact.ts` swaps real PII for stable placeholders (`__PII_EMAIL_1__`, etc.) before the request goes out. Placeholders are stable WITHIN a single dispatch but NOT across dispatches — each call gets a fresh counter. That means a redacted history is cache-unfriendly across cache windows.

If cache hit rate dips below the targets above, this is the first thing to investigate. Mitigation: hash PII to deterministic placeholders by category+value (e.g. `__PII_EMAIL_a1b2c3__`) so the same email always maps to the same token across requests. We didn't ship that yet because we don't have hit-rate telemetry to know whether the regression is real.

## Long-context summarisation interaction

`summariseIfNeeded()` rolls older turns into a single synthetic summary message when the conversation exceeds ~80k tokens. The summary is generated fresh per dispatch (Haiku call). This is intentional: the summary changes when the recent N turns change, so caching a stale summary would be wrong.

The cached system + tool block is unaffected — summarisation only touches the `messages` array, which sits AFTER the breakpoint. We pay full price on the (small) summarised payload and still read the (large) prefix from cache. That's the design.

## Verifying the cache is hot

```bash
# In the Next.js dev server, after a few in-app chats, query
# agent_credit_events for the most recent dispatch and inspect the
# response logs (when enabled). Look for non-zero
# usage.cache_read_input_tokens — that's a cache hit.
```

Or in unit/integration testing, mock the Anthropic client and assert the request payload contains `cache_control: { type: "ephemeral" }` on the expected blocks.

## Future breakpoints

We use 2 of the 4 allowed `cache_control` markers per request. The remaining two are reserved for:

- A per-workspace "session digest" block that summarises the user's last 100 turns and rotates daily — caches across all turns of a single day.
- A per-tool "expensive output" block that caches a long tool result (e.g. a 20k-token CSV import preview) so the orchestrator can reason about it on subsequent turns without re-paying input cost.

Both are speculative. Add them only when we see specific calls bottlenecked on input cost.
