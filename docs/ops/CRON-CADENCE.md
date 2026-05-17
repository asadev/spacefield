# Cron cadence — Hobby (current) vs Pro (target)

## Why this doc exists

Vercel Hobby plan caps cron jobs at **once-daily maximum**. Five of our
crons were originally written to run sub-daily (every minute through
twice-hourly). On 2026-05-21 every Vercel deploy started failing because
of this — schema validation rejected the sub-daily schedules.

We downgraded all of them to daily slots so the product stays deployed
on the free tier. The infra (queue tables, retry logic, alert payloads)
all still works — it just drains once a day instead of in real time.

## When to revert (the "upgrade-to-Pro" step)

The moment you have a single real-time-ish requirement that bites:
- A user complains an AI batch is "stuck" for hours (it's not — it's
  just waiting for the daily drain).
- A workspace admin doesn't get a suspicious-login alert quickly enough.
- An admin needs to see latency anomalies within the hour, not the day.

Upgrade Vercel to Pro ($20/mo on the team plan, $20/mo on personal Pro).
After upgrading, replace the cron block in `vercel.json` with the
schedules in the next section and push. No code change required —
every cron route is already written for the higher cadence.

## Drop-in replacement (post-Pro)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1", "dub1"],
  "crons": [
    { "path": "/api/cron/paddle-retention",       "schedule": "3 5 * * *" },
    { "path": "/api/cron/audit-purge",            "schedule": "21 6 * * 1" },
    { "path": "/api/cron/refresh-matviews",       "schedule": "30 6 * * *" },
    { "path": "/api/cron/slow-queries-snapshot",  "schedule": "43 6 * * 1" },
    { "path": "/api/cron/partition-rotator",      "schedule": "50 6 * * *" },
    { "path": "/api/cron/account-purge",          "schedule": "8 7 * * *" },
    { "path": "/api/cron/workspace-purge",        "schedule": "33 7 * * *" },
    { "path": "/api/cron/social-publish",         "schedule": "11 9 * * *" },
    { "path": "/api/cron/suspicious-login-scan",  "schedule": "4,19,34,49 * * * *" },
    { "path": "/api/cron/stuck-jobs-detect",      "schedule": "2,7,12,17,22,27,32,37,42,47,52,57 * * * *" },
    { "path": "/api/cron/ai-batch-runner",        "schedule": "* * * * *" },
    { "path": "/api/cron/outbox-relay",           "schedule": "0,5,10,15,20,25,30,35,40,45,50,55 * * * *" },
    { "path": "/api/cron/anomaly-check",          "schedule": "13,43 * * * *" },
    { "path": "/api/cron/log-retention",          "schedule": "0 4 * * *" },
    { "path": "/api/cron/api-token-reminder",     "schedule": "27 8 * * *" }
  ]
}
```

Note: the `regions: ["fra1", "dub1"]` is also Pro-only — multi-region
serverless functions are a Pro feature. Restoring it gives Dubai users
sub-20ms function latency (vs ~80ms from Frankfurt-only).

## Current state (Hobby) for the record

| Cron | Hobby cadence | Pro cadence | Real-world cost of daily |
|---|---|---|---|
| ai-batch-runner | daily 06:14 | every minute | Queued AI batch jobs can wait up to 24h. Fine while 0 users are using them. |
| outbox-relay | daily 06:19 | every 5 min | Email/webhook/notification fanout for events emitted between drains is delayed up to 24h. Same logic — fine at zero traffic. |
| stuck-jobs-detect | daily 06:09 | every 5 min | Workflow / AI batch runs stuck in "running" state are detected once a day. Stuck jobs eat one Vercel function slot until detected; cheap at zero scale. |
| suspicious-login-scan | daily 06:04 | every 15 min | New-device login alerts go out daily. Attacker has 24h of unflagged access in theory; in practice we still rate-limit + lock out on brute-force inside the auth path. |
| anomaly-check | daily 06:24 | twice an hour | API anomaly detection (p95, error-rate spikes) once a day. Fine while there's no traffic to anomalise. |

Already-daily crons that don't change between tiers:
- `paddle-retention` (PII purge — daily 05:03)
- `audit-purge` (90d log purge — Monday 06:21)
- `refresh-matviews` (06:30)
- `slow-queries-snapshot` (Monday 06:43)
- `partition-rotator` (06:50)
- `account-purge` (30d-grace hard-delete — 07:08)
- `workspace-purge` (30d-grace hard-delete — 07:33)
- `social-publish` (09:11)
- `log-retention` (04:00)
- `api-token-reminder` (08:27)
