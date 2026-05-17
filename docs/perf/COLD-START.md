# Cold-Start Measurement

Vercel serverless functions are billed (and felt by users) two ways:

1. **Warm**: an existing lambda instance picks up the request — TTFB is
   dominated by our own handler work + Supabase round-trip. Typically
   60–180ms p95 for `/api/health` from a nearby region.
2. **Cold**: no warm instance exists, so Vercel boots a fresh Node
   container, loads the Next.js server bundle, and runs module init
   before the handler executes. This adds ~150–800ms depending on
   bundle size and region.

We don't want to optimise blindly — every node_module we tree-shake or
every prebuilt route costs developer time. This doc describes how we
measure cold-start so an optimisation has a number attached to it.

## Local measurement (developer laptop)

```sh
pnpm tsx scripts/measure-cold-start.ts
pnpm tsx scripts/measure-cold-start.ts --url https://staging.spacefield.co --runs 20
pnpm tsx scripts/measure-cold-start.ts --url https://spacefield.co/api/health --warm 6
```

What the script does:

- Hits `/api/health` `iterations` times. Each iteration:
  - One **cold** probe (unique `?_cs=<nonce>` so Vercel's warm pool
    can't reuse an instance for the very first hit).
  - `warmRuns` follow-up probes on the same URL — these will hit the
    instance the cold probe just booted.
- Uses `curl -w` so we get `time_starttransfer` (TTFB) split out from
  `time_total`. `fetch()` can't split those phases cleanly.
- Reports p50 / p95 / max TTFB per bucket, plus the cold-warm delta.

Sample output:

```
results:
  cold   n=10  errors=0  ttfb p50=420ms  p95=680ms  max=812ms  total p95=720ms
  warm   n=40  errors=0  ttfb p50=110ms  p95=180ms  max=290ms  total p95=210ms

cold-start penalty (p95 ttfb): 500ms  (cold 680ms − warm 180ms)
```

A "good" cold-start penalty for our shape is < 600ms p95. > 1s p95
means a new dependency was pulled into the request path (most often a
heavy SDK imported at module scope).

## Regional measurement (the real picture)

The local script measures cold start from **your** laptop's location —
useful for relative comparisons before/after a change, but it's not
the user-facing number. The user-facing number depends on:

- The Vercel region serving the request (we deploy to `fra1` + `dub1`
  — see `vercel.json`).
- The user's distance to that region.
- Whether a warm instance exists in that region for that exact route.

For true regional cold-start, run the script from multiple geographic
locations:

| Region        | Method                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| EU (FRA)      | GitHub Actions `ubuntu-latest` (eu-west). Free, recurring schedule ok. |
| GCC (DXB)     | Hetzner Falkenstein box → SSH probe (closest we own to Dubai egress).  |
| US East (IAD) | GitHub Actions matrix with `runs-on: ubuntu-latest` + `region: east`.   |
| US West       | Not currently measured; <3% of MAU.                                     |
| APAC          | Not currently measured; <1% of MAU.                                     |

The script exits non-zero if any probe errors, so CI can surface
regressions without bespoke parsing.

## What to investigate when cold-start regresses

1. **Bundle size**: `pnpm build` output, look at the route's size
   column. > 300 KB usually means a heavy import landed at module
   scope. Fix with `await import()` inside the handler.
2. **Edge vs Node runtime**: `/api/health` is `runtime = "nodejs"` —
   if we moved it to Edge, cold start would drop ~200ms but we'd lose
   `createAdminClient` (service-role uses pg-protocol-bound Node SDK).
   Don't flip without checking.
3. **Region misses**: if Vercel cold-boots a US-east instance for an
   EU user (unusual), the network RTT dominates the cold-boot delta.
   Check `region` in `?deep=1&Authorization: Bearer $HEALTH_DEEP_TOKEN`.
4. **Supabase reach**: warm probes that are slower than usual point at
   the DB, not the lambda. Cross-check `api_latency_summary(30)` from
   `/admin/insights`.

## Budget

We commit to:

- p95 warm TTFB on `/api/health` < 250 ms (from fra1 to fra1 user).
- p95 cold TTFB on `/api/health` < 800 ms.
- Cold-warm delta < 600 ms p95.

These are tracked by the anomaly-check cron (`/api/cron/anomaly-check`)
which fires every 30 min. If `/api/health` p95 jumps 3× over the 7-day
baseline, every admin gets an in-app notification within 30 min.
