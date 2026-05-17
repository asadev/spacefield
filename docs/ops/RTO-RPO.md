# RTO / RPO

Recovery objectives for Spacefield. Two numbers and what they mean:

- **RTO (Recovery Time Objective)** = how long we'll be down in the
  worst case before service is restored.
- **RPO (Recovery Point Objective)** = how much data we'll lose in the
  worst case (measured back from the time of the incident).

These are commitments, not aspirations. If we can't hit them, we owe
the user a status update.

## Stated objectives

| Service             | RTO    | RPO     |
| ------------------- | ------ | ------- |
| Web app + APIs      | **1 h** | **5 min** |
| AI assistant        | 2 h    | best-effort (stateless) |
| Background jobs     | 2 h    | 5 min   |
| Email / WhatsApp    | 4 h    | best-effort (provider-side) |
| Custom-domain DNS   | 24 h   | n/a (config, no data) |

"1 hour RTO" is for a single-region or single-provider failure. A
multi-provider compound outage (Supabase eu-central-1 + Vercel fra1
both down) is explicitly out of scope; we don't run hot-standby
infrastructure, and the cost of doing so isn't justified at our
current scale.

## How the numbers are achieved

### RPO = 5 minutes

Supabase Pro has **point-in-time recovery (PITR)** with a 2-minute
granularity rolling window across the last 7 days. Restores can pick
any moment in that window. We use PITR — not nightly logical backups
— as the primary recovery mechanism.

In addition:

- **Daily logical backup** (`pg_dump`) runs at 04:00 UTC via Supabase's
  automated backup. Retention: 7 days inside Supabase + 30 days mirrored
  to S3 (`spacefield-db-backups`, bucket lifecycle prunes after 30 d).
- **Critical-table snapshots**: `workspaces`, `members`, `profiles`,
  `subscriptions`, `paddle_*`, and `audit_log` are dumped weekly to
  the same S3 bucket as CSV for offline review.

A 5-minute RPO means: in the worst case (e.g., we caught the incident
3 minutes after it happened, and the most recent PITR commit is from
2 minutes before), we lose 5 minutes of writes. Real-world expectation
is < 1 minute because PITR's actual granularity is finer than 2 min.

### RTO = 1 hour

The dominant time costs in a recovery are:

1. **Decide a restore is needed** (10–20 min): on-call paged, runs the
   triage checklist in `docs/ops/DR-PLAYBOOK.md`, escalates if needed.
2. **Initiate restore** (5 min): Supabase dashboard → PITR → pick
   timestamp → confirm. The restore itself runs in the background.
3. **Wait for restore** (15–30 min depending on DB size): Supabase
   provisions a new project from the PITR snapshot. Current DB is
   ~30 GB → expect ~20 min.
4. **Cutover** (5–10 min): update `NEXT_PUBLIC_SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel env → redeploy → smoke test.

Hard ceiling: 1 hour. If we're approaching 50 minutes without a
cutover, the on-call escalates and the user-facing maintenance banner
becomes "extended" rather than "brief".

## Backup cadence summary

| Backup           | Frequency | Retention | Location                  |
| ---------------- | --------- | --------- | ------------------------- |
| PITR (Supabase)  | continuous | 7 days   | Supabase managed          |
| Logical backup   | daily (04:00 UTC) | 7 days | Supabase managed |
| S3 mirror        | daily     | 30 days   | `s3://spacefield-db-backups/` |
| Critical-table CSV | weekly  | 90 days   | `s3://spacefield-db-backups/csv/` |
| Storage (file uploads) | continuous (Supabase Storage) | indefinite | Supabase managed |
| Vercel deploy history | per-deploy | 30 days (Hobby) / 90 days (Pro) | Vercel managed |

## Restore procedure

See `docs/ops/DR-PLAYBOOK.md` for the step-by-step. In short:

1. Decide the target timestamp (just before the bad event).
2. Supabase Dashboard → Database → Backups → PITR → pick timestamp.
3. Wait for restore to complete (status shows green).
4. Update env vars in Vercel project settings:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` (only if Supabase generated a new project)
5. Redeploy (`vercel deploy --prod`) — Vercel re-pulls env on each deploy.
6. Run smoke test (`pnpm tsx scripts/verify-runtime.mjs`).
7. Clear maintenance banner.

## On-call rotation

Solo founder + on-call as of 2026-05. Pager via Apple Push (Spacefield
admin app) — admin notifications with `kind = 'ops.*'` fire a push by
default. Backups owner: Asad.

When we hire a second engineer, the rotation becomes weekly with a
documented handover at the start of each rotation. Until then,
"on-call" = "Asad, with a 1-hour SLA from being paged on his iPhone
during waking hours, and best-effort overnight".

Outside this SLA window, the maintenance banner auto-shows
"We're aware. Updates within 1 hour." and the kill-switch (see DR
playbook) drops the affected feature instead of taking the whole site
down.
