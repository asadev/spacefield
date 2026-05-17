# Skill registration audit

Snapshot of the AI runtime's skill catalog and the `recordAiCall` wiring
sweep that landed alongside it. Generated 2026-05-17 (Wave-3 Y5).

The runtime's single source of truth for skills is
`lib/agent/skills/index.ts` — specifically the `ALL_SKILLS` array. Each
entry is a `SkillDefinition` with a stable `id`, label, system fragment,
and a tool list. The pre-classifier (GPT-4o mini) only sees the `id`s
through the `SKILL_SUMMARY` string at the top of
`lib/agent/runtime/classifier.ts` — anything missing from that string
will not be picked by the classifier even if the runtime exports the
skill, so the two must stay in sync.

---

## 1. `ALL_SKILLS` export → classifier coverage

| Skill id          | Tools | Source                              | In `SKILL_SUMMARY`? | Notes                                                                                          |
| ----------------- | ----: | ----------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `workspace`       |     4 | `lib/agent/skills/workspace`        | yes                 | list/switch workspaces, members, invites.                                                      |
| `crm.contacts`    |     6 | `lib/agent/skills/crm-contacts`     | yes                 |                                                                                                |
| `crm.companies`   |     6 | `lib/agent/skills/crm-companies`    | yes                 |                                                                                                |
| `crm.deals`       |     8 | `lib/agent/skills/crm-deals`        | yes                 |                                                                                                |
| `crm.leads`       |     5 | `lib/agent/skills/crm-leads`        | yes                 |                                                                                                |
| `crm.activities`  |     4 | `lib/agent/skills/crm-activities`   | yes                 |                                                                                                |
| `files`           |     6 | `lib/agent/skills/files`            | yes                 | search/meta + star + create_folder + rename + delete.                                          |
| `boards`          |     4 | `lib/agent/skills/boards`           | yes                 |                                                                                                |
| `apps`            |     4 | `lib/agent/skills/apps`             | yes                 | Tool Store + Market Pulse hints.                                                               |
| `meta`            |     3 | `lib/agent/skills/meta`             | yes                 | always included via `getSkillsByIds` fallback.                                                 |
| `tasks`           |     5 | `lib/ai-tools/tasks.ts`             | yes                 | overnight 2026-05-14 batch.                                                                    |
| `people`          |     9 | `lib/ai-tools/people.ts`            | yes                 | overnight 2026-05-14 batch.                                                                    |
| `collab`          |     6 | `lib/ai-tools/collab.ts`            | yes                 | `ask_about_thread` reuses `summarize_thread`'s `input_schema` via object spread. See §2 below. |
| `search`          |     3 | `lib/ai-tools/search.ts`            | yes                 | overnight 2026-05-14 batch.                                                                    |
| `extras`          |     6 | `lib/ai-tools/extras.ts`            | yes                 | tags, favourites, recycle bin, demo seed.                                                      |
| **Total**         | **79** |                                    |                     |                                                                                                |

Every skill exported from `ALL_SKILLS` appears in `SKILL_SUMMARY` and is
reachable by the classifier. No orphaned skills, no orphaned summary
lines.

---

## 2. `input_schema` audit

Every tool exported under `ALL_SKILLS` has a non-empty `input_schema`.
The static count from `grep -c "input_schema:"` is one less than the
tool count for `collab` only — that's because `ask_about_thread` is
deliberately a thin alias of `summarize_thread`:

```ts
const ask_about_thread: ToolDefinition = {
  ...summarize_thread,
  name: "ask_about_thread",
  description: "Same as summarize_thread — kept as a separate name…",
};
```

The spread copies `summarize_thread.input_schema` by reference, so the
schema reaches the Anthropic API correctly. Both tool names appear in
the runtime catalog; the LLM sees identical schemas under different
names.

No other skill has a tool that ships without `input_schema`.

---

## 3. `executeToolGuarded` unhappy-path

`executeToolGuarded` in `lib/agent/skills/index.ts` wraps every tool
call. The contract: **it never throws** — it returns
`ToolExecuteResult` either way.

Defences:

1. **Role guard** — `checkRole` returns `requires_<role>` and the
   wrapper short-circuits to `{ ok: false, error: … }`.
2. **Free-tier guard** — non-readonly tools called by a free-tier
   workspace return a friendly upgrade message.
3. **Try / catch around the tool body** — any `throw` from
   `tool.execute()` is converted to `{ ok: false, error: e.message }`.

I scanned every skill's `execute` for raw `throw` statements outside
the helpers — none rethrows past the guard. The implementations all
funnel errors through `toolError(...)` or the Supabase `error` object.

Result: the executor / orchestrator never observe a thrown promise
from `executeToolGuarded` — they receive a `ToolExecuteResult` whose
`ok` field they can branch on, which is exactly what the
`tool_result` block expects.

---

## 4. `recordAiCall` wiring sweep

Before this wave, only `lib/ai/embeddings.ts` and `lib/ai/batch.ts`
called `recordAiCall`. Everything else (executor, orchestrator,
formatter, summariser, classifier, /chat stream) was silently spending
without writing to `ai_calls`. The Wave-3 Y5 pass closes the gap:

| Site                                                     | LLM call          | `recordAiCall` wired?                                              |
| -------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| `lib/agent/runtime/executor.ts` (main loop)              | `messages.create` | yes — try/catch records both ok and error rows                     |
| `lib/agent/runtime/executor.ts` (pending-approval follow) | `messages.create` | yes                                                                |
| `lib/agent/runtime/orchestrator.ts` (main loop)           | `messages.create` | yes                                                                |
| `lib/agent/runtime/orchestrator.ts` (pending-approval follow) | `messages.create` | yes                                                                |
| `lib/agent/runtime/formatter.ts`                          | `messages.create` | yes — new `FormatReplyContext` plumbs workspace_id / user_id through |
| `lib/agent/runtime/summarise.ts`                          | `messages.create` | yes — anonymous attribution (runs as a background helper)          |
| `lib/agent/runtime/classifier.ts`                         | `chat.completions.create` | yes — anonymous attribution (no workspace at this layer)          |
| `app/api/chat/stream/route.ts`                            | `messages.stream` | yes — usage read from `stream.finalMessage()` after iterator ends  |
| `lib/ai/embeddings.ts`                                    | OpenAI embeddings | already wired (N5)                                                 |
| `lib/ai/batch.ts`                                         | `messages.create` | already wired                                                      |

Counts: **9 LLM call sites in the runtime, 9 wired.** Test-only script
`scripts/test-tool-calling.ts` is intentionally left unwired (it
shouldn't pollute the ledger).

The `dispatcher` does NOT call `messages.create` directly — it
delegates to the executor/orchestrator/formatter, all of which are now
wired. Its `debit()` ledger is independent (token-bucket per workspace
per month, see `lib/agent/runtime/budget.ts`) and continues to live
alongside the per-call `ai_calls` table.

---

## 5. Tier budget enforcement

New helper: `lib/ai/budget-check.ts` — `isWorkspaceOverBudget(workspaceId)`
and `getWorkspaceBudgetStatus(workspaceId)`. Wired into:

- `lib/agent/runtime/executor.ts` — pre-flight before model call;
  returns the upgrade message as the assistant reply.
- `lib/agent/runtime/orchestrator.ts` — same.
- `app/api/chat/stream/route.ts` — pre-flight before opening the
  Anthropic stream; emits a single SSE delta with the upgrade message
  and `done`s the stream.

The check reads the workspace owner's tier (via `workspaces.user_id`
→ `subscriptions`) and the last-30-day `ai_cost_summary`. Over budget
when `used >= TIER_AI_BUDGET_USD[tier]` and the tier has a finite
budget. Failures degrade open — we'd rather let a paying customer
through than swallow their dispatch.

---

## 6. Audit follow-ups (non-blocking)

These are minor inconsistencies surfaced by the sweep that don't
warrant fixing in this branch:

1. `lib/agent/runtime/orchestrator.ts` previously skipped
   `wrapAsUntrustedData()` on tool results — only the executor used
   it. This branch fixes that for parity (search the orchestrator for
   `wrapAsUntrustedData` to confirm).
2. `TIER_AI_BUDGET_USD` is duplicated between `components/AICostBudget.tsx`
   and `lib/ai/budget-check.ts`. The component file is a server
   component; importing its export from a non-React module pulls JSX
   transitively. Duplicating is the smaller evil until we extract a
   shared `lib/billing/tier-budgets.ts`.
3. `summarise.ts` and `classifier.ts` log to `ai_calls` with
   workspace_id / user_id = null because neither has the context. A
   later pass could thread the caller's identity through both APIs;
   the current ledger admin view already shows "Anonymous calls"
   under that filter.
