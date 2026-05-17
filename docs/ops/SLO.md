# Service Level Objectives

Three things we measure, the targets we hold ourselves to, and what
we do when we miss them. SLOs are stated in user-visible terms — the
question is "did our users have a working product?", not "did our
servers respond?".

## The three SLIs

| SLI | What it measures | How |
| --- | --- | --- |
| **Uptime** | Fraction of 1-minute buckets in which a synthetic homepage probe + signed-in admin probe both succeeded | External Better Uptime monitors, 1-min interval, US-east + EU |
| **Latency** | p95 server response time for the top-10 path patterns, signed-in | Vercel Analytics → `vercel-otel` exporter |
| **Error rate** | Fraction of requests returning 5xx OR throwing in a route handler | `lib/log.ts` error events / total request count |

We deliberately do NOT make "p95 latency for /api/*" a single number —
the homepage and an AI-streaming endpoint have wildly different
acceptable latencies. The top-10 path-pattern split is the compromise
that captures user experience without being a wall of micro-SLOs.

## Targets (SLOs)

| SLI | Target (30-day rolling) | Error budget |
| --- | --- | --- |
| Uptime | **99.9 %** | 43 m 12 s / month |
| Latency (homepage) | **p95 < 600 ms** | 5 % of homepage requests can exceed |
| Latency (CRM list pages) | **p95 < 800 ms** | 5 % can exceed |
| Latency (AI chat first-token) | **p95 < 1.5 s** | 5 % can exceed |
| Error rate (all requests) | **< 0.5 %** | ~ 1 error per 200 requests |
| Error rate (5xx only) | **< 0.1 %** | ~ 1 in 1000 |

99.9 % is a deliberate choice. 99.95 would force us into multi-region
write paths that don't make sense for our scale, and 99.5 doesn't
match the expectation users have of a SaaS product. 99.9 says "down
for at most one work-day per year, in pieces no longer than the time
it takes to do a Supabase PITR restore."

## Error budgets

Error budget = the amount of downtime / latency excess we can spend
without violating the SLO. Used to make trade-offs:

- **Budget healthy (< 50 % spent)** → ship features. Roll out
  experiments. Push to main without a maintenance window.
- **Budget at risk (50 – 90 % spent)** → freeze non-critical
  migrations. Slow down on risky deploys. Schedule a reliability
  sprint.
- **Budget exhausted (≥ 100 %)** → freeze all feature deploys until
  the rolling window recovers. Only bug-fixes and reliability work
  ship.

The budget refills as the 30-day window slides forward — old
incidents drop off after 30 days. We don't reset the budget after an
incident; the only way out of "budget exhausted" is to stop having
incidents.

## How we measure

### Uptime

Better Uptime monitors live at `monitors.spacefield.co` (placeholder —
to be wired). Two endpoints checked every minute:

1. `GET https://spacefield.co/` — must return 200 with the homepage
   `<title>` in the body.
2. `GET https://spacefield.co/api/health/auth` with a long-lived
   monitor token — must return 200 + `{ "ok": true, "auth": true }`.

A "down minute" is a minute in which EITHER monitor failed twice in
a row. Single-probe blips don't count (avoids transient DNS noise).

### Latency

Vercel Analytics' p95 panel is the source of truth. We export to
S3 weekly via `scripts/export-vercel-analytics.mjs` so the historical
record outlives Vercel's 30-day retention.

The "top 10 paths" are the 10 patterns with the most signed-in
traffic over the last 7 days. We re-compute the list weekly.

### Error rate

The error count comes from `error_log` (server-thrown errors
captured by `withApiHandler`) + middleware 5xx counts. The total
request count comes from middleware-emitted INFO-level logs.

Errors that are client-fault (4xx) do NOT count toward the SLO —
those represent users doing things wrong, not us being broken.

## Reporting cadence

Weekly: a 1-line update in `memory/YYYY-MM-DD.md` —
"Uptime 99.97 % / latency budget 38 % spent / error budget 12 % spent."

Monthly: a paragraph in `memory/` capturing the trend, top incidents,
and any decisions made (budget freezes, target changes).

Quarterly: revisit the targets themselves. Are we systematically
beating them by 10×? They're too loose — tighten. Are we
systematically missing? They're too tight — either invest in
reliability or relax the target with a public note.

## Incident → postmortem

Any user-visible incident that consumes > 10 % of any month's error
budget triggers a postmortem at `/incidents/YYYY-MM-DD-<slug>.md`.
Format: timeline, root cause, fix, what-we'd-do-differently,
prevention. No blame. Public-facing post-mortems are linked from the
public status page.
