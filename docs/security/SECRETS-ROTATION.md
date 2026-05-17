# Secrets — rotation policy

Every long-lived secret in the system, where it lives, who rotates it,
and how often. Default cadence is **90 days**. Ad-hoc rotations (a
laptop is lost, a contractor offboards, a public leak is found) take
precedence over the calendar.

## Inventory

| Env var                          | What it is                          | Stored in                         | Cadence | Owner |
| -------------------------------- | ----------------------------------- | --------------------------------- | ------- | ----- |
| `SUPABASE_SERVICE_ROLE_KEY`      | Bypasses RLS — full DB read/write   | Supabase dashboard + Vercel env   | 90 d    | Asad  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Client-side anon key, RLS-gated     | Supabase dashboard + Vercel env   | 90 d    | Asad  |
| `RESEND_API_KEY`                 | Outbound transactional email        | Resend dashboard + Vercel env     | 90 d    | Asad  |
| `POSTMARK_API_KEY`               | Fallback transactional email        | Postmark dashboard + Vercel env   | 90 d    | Asad  |
| `PADDLE_API_KEY`                 | Paddle billing API (subscriptions)  | Paddle dashboard + Vercel env     | 180 d   | Asad  |
| `PADDLE_WEBHOOK_SECRET`          | Verifies incoming Paddle webhooks   | Paddle dashboard + Vercel env     | 180 d   | Asad  |
| `CRON_SECRET`                    | Auth for `/api/cron/*` endpoints    | Vercel env (auto-rotated by Vercel on regen) | 90 d | Asad |
| `AUTH_FINGERPRINT_SECRET`        | HMAC for lockout fingerprints       | Vercel env                        | 365 d   | Asad  |
| `UNSUBSCRIBE_TOKEN_SECRET`       | HMAC for one-click unsub tokens     | Vercel env                        | 365 d   | Asad  |
| `SKILLS_HTTP_HANDLER_SECRET`     | Outbound HMAC to user-defined skill webhooks | Vercel env               | 90 d    | Asad  |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | AI provider keys              | Vercel env                        | 90 d    | Asad  |
| GitHub PAT (`SPACEFIELD_DEPLOY_TOKEN`) | CI deploys + repo writes       | GitHub repo secrets               | 90 d    | Asad  |
| GoDaddy API key                  | Custom-domain DNS automation        | Vercel env                        | 180 d   | Asad  |

"Cadence" is **target** rotation. We schedule the work on a Monday
morning; we accept up to a 14-day grace before flagging the row in
`docs/security/OWASP-ASVS-L1.md` as out-of-policy.

## When to rotate immediately (out of cadence)

- A laptop with `.env.local` or `~/.config/spacefield/credentials` is
  lost, stolen, or sold.
- A contractor or collaborator who had access offboards.
- A secret appears in a public commit, a Slack message screenshot, a
  bug report, or a support email.
- `git log` shows a secret was committed at any point — even if it was
  deleted later, treat it as compromised. Commit history is global.
- An incident response identifies an unexpected actor in audit logs.

## Procedure

The flow is the same for every secret: **generate the new one, set it
alongside the old one for a brief overlap, swap, then revoke the old
one.**

### Generic procedure

1. **Generate** a new secret in the provider's dashboard.
2. **Set** it in Vercel as a NEW env var (e.g. `RESEND_API_KEY_NEW`)
   or alongside the existing one if the provider supports two active
   keys. Deploy. Both keys are valid.
3. **Switch** the code/env var name back to the canonical one
   (`RESEND_API_KEY`) pointing at the new value. Redeploy.
4. **Wait 24 h** for any cached deploys to roll over and for in-flight
   webhook signatures to drain.
5. **Revoke** the old secret in the provider's dashboard.
6. **Record** the rotation in `memory/secrets-rotation-log.md`
   (date, secret name, who rotated it).

### Per-secret notes

- **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase only allows one
  service-role key per project. Rotation is destructive: regenerate
  in the dashboard, then immediately update Vercel env and redeploy.
  Background workers (cron) may briefly see 401s during the swap —
  acceptable, they retry. Plan for a 2-minute window.

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — Public by design. Rotation
  invalidates all live browser sessions for clients still holding the
  old key; users see a soft "session expired" prompt. Schedule for a
  low-traffic hour.

- **`PADDLE_WEBHOOK_SECRET`** — Paddle supports rotating with no
  overlap window. Update in their dashboard, copy the new value,
  update Vercel env, redeploy. Any webhooks sent in the swap window
  will retry — Paddle retries failed webhooks for 3 days.

- **`CRON_SECRET`** — Vercel itself regenerates this when you click
  "Regenerate" in Project Settings → Cron Jobs. The redeploy is
  automatic.

- **`UNSUBSCRIBE_TOKEN_SECRET`** — Rotating invalidates every
  previously-issued one-click unsub token in the wild. Acceptable —
  the user can still unsub from `/account/notifications`. The page
  shows "Link expired" for old tokens.

- **`AUTH_FINGERPRINT_SECRET`** — Rotating changes the HMAC output for
  account-lockout fingerprints. Existing lockouts persist but new
  attempts compute fresh fingerprints. No user-visible effect.

## Audit

A quarterly review (90-day cycle) walks this table and verifies:

1. Every listed secret was actually rotated within the cadence.
2. No secret-bearing env var on Vercel is missing from this table.
3. `git log -p` for the period contains no secret-shaped strings
   (matched against `gh secret-scanning` and a local
   `gitleaks` pass).

The review goes in `memory/secrets-rotation-log.md` with a date and
"all-green" or a list of exceptions.
