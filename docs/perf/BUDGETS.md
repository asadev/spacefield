# Latency budgets

This doc is the canonical reference for the per-route latency budgets
shipped in `lib/perf/budgets.ts`. The budgets are starting estimates,
not contractual SLOs — when production p95 drifts, edit the constants
and re-deploy. The dashboard at `/admin/insights/latency` is the
source-of-truth for actuals; this doc is the source-of-truth for the
line we drew.

A budget breach **does not fail the request**. It emits a structured
`log.warn("perf.budget.breach", …)` line containing:

| field      | meaning                                           |
| ---------- | ------------------------------------------------- |
| `source`   | the route tag (matches `withApiHandler` source)   |
| `elapsed_ms` | actual wall time in milliseconds                |
| `budget_ms`  | what the budget says                            |
| `over_pct`   | percent over budget                             |

Pipe those warns to whatever alert sink you use (Datadog, Better Stack,
Sentry Breadcrumbs) — they're regular JSON log lines.

## Budget table

| Source                          | Budget (ms) | Notes                                                      |
| ------------------------------- | ----------: | ---------------------------------------------------------- |
| `admin.insights.latency`        |         800 | One RPC + table scan; p95 sits around 350 ms in production |
| `admin.insights.ai-costs`       |         800 | Two `ai_cost_summary` RPC calls in parallel                 |
| `admin.insights.health`         |         800 | Six concurrent reads + an internal `/api/health` probe     |
| `admin.insights.slow-queries`   |         800 | One RPC                                                    |
| `admin.status.checklist`        |         600 | Markdown render of static checklist                        |
| `admin.alerts.list`             |         500 | One `select` from `alert_definitions`                      |
| `admin.audit.list`              |         600 | One `select` from `audit_events`                           |
| `admin.users.list`              |         600 | Auth-server-side admin listing                             |
| `admin.workspaces.list`         |         600 | One `select` + count                                       |
| `public.pricing`                |         400 | Static-ish, mostly cached                                  |
| `public.compare`                |         400 | Static-ish                                                 |
| `public.developers`             |         400 | Static-ish                                                 |
| `public.landing`                |         400 | Static-ish                                                 |
| `auth.signin`                   |         800 | Supabase Auth round-trip + cookie write                    |
| `auth.signout`                  |         400 | Cookie clear                                               |
| `auth.callback`                 |        1000 | OAuth handshake + cookie write                             |
| `ai.chat.start`                 |        1200 | Provider handshake; not the full stream                    |
| `ai.skill.invoke`               |        1200 | Same — first byte from the model                           |
| `ai.embed`                      |        1000 | Single embedding call                                      |
| `webhook.paddle`                |         500 | HMAC verify + one `insert`                                 |
| `webhook.resend`                |         400 | Signature verify + one `insert`                            |
| `webhook.supabase-auth`         |         400 | Header verify + sync                                       |
| `files.presign`                 |         600 | R2 signed URL minting                                      |
| `files.metadata`                |         600 | DB read of file row                                        |
| `cron.anomaly-check`            |        5000 | Long-running scan + RPC fan-out                            |
| `cron.stuck-jobs-detect`        |        5000 | Long-running scan + RPC fan-out                            |

Anything not in the table defaults to **300 ms** via
`DEFAULT_BUDGET_MS`.

## TTFB target

Server-Timing's `ttfb;dur=<ms>` header reports middleware-only elapsed
time, not the full network TTFB. Target is **< 100 ms** for the
middleware path in production. The vast majority of that time is the
Supabase session-refresh round trip (single REST call). When you see
it climbing past 200 ms, the cause is usually a cold connection from a
Vercel region that doesn't yet have a warmed pool — let it bake for
30s and try again.

## How to instrument a new route

### Option 1 — wrap a server component / route handler

```ts
import { withLatencyBudget } from "@/lib/perf/budgets";

export default async function Page() {
  return withLatencyBudget("admin.insights.health", () => renderPage());
}
```

If your route already goes through `withApiHandler` (the standard
wrap in `lib/api-wrap.ts`), you can still add this around the inner
body of the handler — the wraps stack cleanly. `withApiHandler` already
writes latency to the `api_latency` table; `withLatencyBudget` adds the
**proactive** log line that fires the moment a request crosses the
threshold, so on-call doesn't have to wait for the dashboard.

### Option 2 — measure yourself and check explicitly

When wrapping a single function isn't useful (e.g. streaming responses
that finish work after the first byte), call `checkLatencyBudget`
directly:

```ts
import { checkLatencyBudget } from "@/lib/perf/budgets";

const started = Date.now();
// ... do work ...
checkLatencyBudget("ai.chat.start", Date.now() - started);
```

## Vary + Server-Timing in middleware

`middleware.ts` sets two response headers globally:

- `Vary: Authorization, Accept-Language, Cookie` — tells shared caches
  to key on auth state and locale. Without this, a CDN could serve a
  logged-in user's render to an anonymous visitor.
- `Server-Timing: ttfb;dur=<ms>` — middleware-only elapsed time so RUM
  tools (Vercel Speed Insights, SpeedCurve, web-vitals.js) can capture
  it without extra instrumentation.

Downstream handlers can append more `Server-Timing` marks — the spec
allows comma-separated values, and middleware-set `Vary` is
preserved-then-extended rather than overwritten.

## Lighthouse CI thresholds

`.github/workflows/lighthouse.yml` runs `@lhci/cli` against `/`,
`/pricing`, `/compare`, `/developers` on every PR. Thresholds live in
`lighthouserc.json`:

| Category        | Min score | Severity (initial rollout) |
| --------------- | --------: | -------------------------- |
| performance     |      0.80 | `warn`                     |
| accessibility   |      0.90 | `warn`                     |
| best-practices  |      0.90 | `warn`                     |
| seo             |      0.90 | `warn`                     |

After two clean PR cycles, flip the severity to `error` to start
blocking regressions.
