# Production database access

Who can read or write the production Supabase project, how access is
granted, how it's revoked, and what is logged. The short version:
**only the maintainer has Studio access; everyone else operates via the
application's RLS-gated paths.**

## Access tiers

| Tier               | Who                                  | What they can do                                        |
| ------------------ | ------------------------------------ | ------------------------------------------------------- |
| **Owner**          | Owner | Supabase Studio (full DDL + DML), service-role key      |
| **Service role**   | Vercel (server-side code)            | Bypasses RLS — used by `lib/supabase/admin.ts` only     |
| **Authenticated**  | Signed-in users                      | RLS-gated read/write per policy                         |
| **Anon**           | Public web visitors                  | RLS-gated, mostly SELECT on public-content tables       |

There is no per-engineer Supabase login other than the maintainer's. When we hire
a second engineer, the choice is either (a) add them as a Supabase
project owner with their own login + 2FA, or (b) keep Studio access to
the maintainer and have them use the application's admin panel. We default to
(b) for the first 30 days — fewer humans with break-glass access is
easier to reason about — and revisit only if it becomes a bottleneck.

## Service-role key handling

The service-role key bypasses Row Level Security. Treat it like a
root password.

- **Never** in client code. `lib/supabase/admin.ts` is `import "server-only"`
  and hard-fails at import time if loaded from a non-server context.
- **Never** in browser DevTools, `git`, screenshots, logs, or
  client-readable URLs.
- Stored ONLY in Vercel env vars under `SUPABASE_SERVICE_ROLE_KEY`,
  scoped to Production. Preview and Development have a separate
  preview-project key.
- Rotated on the cadence in `docs/security/SECRETS-ROTATION.md`.
- Every code path that uses it calls through `createAdminClient()`,
  which logs at INFO when first instantiated per process so we can
  audit who's using it.

`createAdminClient()` deliberately throws if the key is missing
(SC-001) — it previously fell back to the anon key, which silently
degraded admin reads to "rows that anon happens to see". A loud crash
is the right failure mode.

## Studio access procedure

To grant a new human Supabase Studio access (today, this is theoretical
— it's just the maintainer):

1. They must have a personal Supabase account with TOTP 2FA enabled.
2. the maintainer sends a project invite from Supabase Dashboard → Team.
3. Their role is `developer` (read-only Studio) or `owner` depending
   on the engagement. Default: `developer`.
4. The grant is logged in `memory/db-access-log.md`: date, name,
   role, justification, expected revocation date.
5. On revocation, the maintainer removes from Supabase Team AND from Vercel
   (if they had Vercel env-var access). Both removals go in the
   same log row.

## Direct DB access from a laptop

Two paths exist:

- **Supabase Studio** (web UI): the default. Audit log lives in
  Supabase's account-activity feed.
- **`psql` via Supabase connection string**: the connection string is
  in `~/ClaudeAsad/credentials/spacefield-env.sh` (gitignored). Used
  for ad-hoc queries that don't fit in Studio (large `EXPLAIN
  ANALYZE`, multi-statement reports, etc.). Anyone with shell on
  the maintainer's MacBook can read this file — that's why the laptop is the
  bottleneck.

Server-side scripts (`scripts/*.mjs`) connect via the same env vars as
production. Run them with `source ~/ClaudeAsad/credentials/spacefield-env.sh`
then `pnpm tsx scripts/<name>.mjs` so the credentials never enter
shell history.

## What gets logged

Two layers:

1. **Supabase account activity** (managed): Studio sign-ins, key
   regenerations, project setting changes. Visible at
   `Account → Activity` in Supabase.
2. **Application audit log** (`public.audit_log`): every write that
   goes through `withApiHandler` + an `audit(...)` call. Append-only
   (restrictive RLS blocks UPDATE/DELETE). Retention: 365 days.

We do NOT log every SELECT — too noisy, and most reads go through the
authenticated client where RLS already gates the rows. SELECTs from
the service-role admin client are logged at the application call site
(`audit('admin.<verb>', ...)`).

## Break-glass

When the application's admin panel can't do what's needed (rare —
schema-level changes, recovering a corrupted row, etc.), the maintainer uses
Supabase Studio directly. Every break-glass session:

- Is announced in `memory/YYYY-MM-DD.md` BEFORE the session ("about to
  run X queries against table Y to fix Z").
- Captures the queries run + outcome AFTER ("ran the 3 updates, 47
  rows affected, verified count from `crm_contacts`").
- Triggers a service-role-key rotation if it involved writing a
  user-supplied SQL string anywhere (see secrets rotation).

Break-glass is not a crime; the rule is just "leave a paper trail."
