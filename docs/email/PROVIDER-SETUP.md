# Email provider setup

Space Field sends transactional email through a provider-agnostic helper
in `lib/email/send.ts`. The helper picks a provider at request time based
on environment variables — there is no code change needed to flip the
switch when an account is provisioned.

## Fallthrough order

`sendEmail()` evaluates env vars in order on every call:

| Order | Env var              | Provider | What happens                              |
|-------|----------------------|----------|--------------------------------------------|
| 1     | `RESEND_API_KEY`     | Resend   | `POST https://api.resend.com/emails`      |
| 2     | `POSTMARK_API_KEY`   | Postmark | `POST https://api.postmarkapp.com/email`  |
| 3     | _(neither set)_      | Outbox   | Row inserted into `public.email_outbox`   |

Order is fixed: Resend wins if both are set. To force Postmark in a
preview env where Resend leaks in via global config, simply omit
`RESEND_API_KEY` on that env.

If the provider call fails (network, 4xx, 5xx) we still write a row to
`email_outbox` with `status='failed'` and the error message — so no
message is ever silently lost.

## Required env vars

### Always

- `EMAIL_FROM_NOREPLY` — full "Name <addr>" string used as the From
  header. Defaults to `Space Field <noreply@spacefield.co>` if unset.
- `NEXT_PUBLIC_SITE_URL` — absolute origin used to build links in
  emails (e.g. `https://spacefield.co`). Falls back to the production
  domain.

### Provider-specific

#### Resend

- `RESEND_API_KEY` — server-side API key (starts with `re_`). Create at
  https://resend.com/api-keys.
- Verify the sending domain (DKIM/SPF/DMARC) before sending production
  traffic — Resend bounces unverified domains with a 422.

#### Postmark

- `POSTMARK_API_KEY` — Postmark Server Token (one per server in
  Postmark's terminology). Create at
  https://account.postmarkapp.com/servers.
- `POSTMARK_MESSAGE_STREAM` (optional) — the message stream slug.
  Defaults to `outbound`. Set to a custom stream slug if you've
  configured separate streams for e.g. transactional vs broadcasts.

## Flipping the switch (production)

1. Decide which provider to use. Recommend Resend first — simpler,
   newer, friendlier developer experience.
2. Verify your sending domain inside the provider dashboard. Add the
   DKIM/SPF/DMARC records to your DNS. Wait until status is "verified".
3. Add the `RESEND_API_KEY` (or `POSTMARK_API_KEY`) to the appropriate
   Vercel environment (Production, Preview, Development as desired).
4. Trigger a redeploy so the env var takes effect, OR just wait — the
   next cron tick (every 15 min for suspicious-login) will pick it up
   on the next invocation.
5. Replay the outbox: any queued rows in `email_outbox` from when no
   provider was configured will need a relay run. (Relay job lives in
   `app/api/cron/outbox-relay/route.ts`; an email-specific relay is
   on the backlog.)

## Replaying the outbox

Until a dedicated email-outbox relay ships, run this manual replay
from a one-shot script (service-role only):

```sql
-- Find rows that were queued because no provider was configured.
select id, to, kind, created_at
  from public.email_outbox
 where status = 'queued' and provider is null
 order by created_at asc
 limit 100;
```

A future `outbox-email-relay` cron will pick these up automatically
once it lands. For now treat them as a recovery tool — the in-app
notification path already fired, so emails missed during the
no-provider window are nice-to-have, not critical.

## Failure modes & how to debug

| Symptom                                          | Likely cause                                | Fix                                       |
|--------------------------------------------------|---------------------------------------------|-------------------------------------------|
| `sendEmail()` returns `provider: 'outbox'`      | Neither env var set                         | Add `RESEND_API_KEY` or `POSTMARK_API_KEY` |
| Returns `ok: false, provider: 'resend'`, 422    | Sending domain not verified                 | Verify domain in Resend dashboard         |
| Returns `ok: false, provider: 'postmark'`, 422 | Recipient blocked / spam-trapped            | Check Postmark Activity for the address   |
| Outbox row with `status='failed'`, error=`fetch_failed` | Outbound network blocked from runtime      | Check Vercel region egress / no proxy     |

## Templates

Each kind in `lib/email/templates/` exports a builder that returns
`{ subject, html, text }`. Always import the builder, never copy/paste
markup into call sites — that way layout & footer stay consistent and
preference-center links update everywhere when we change the URL.

Available kinds (May 2026):

- `welcome` — post-signup
- `suspicious-login` — new device sign-in
- `task-assigned` — task assigned to user
- `weekly-digest` — Monday summary
- `account-deletion-confirm` — 30-day grace + final purge notice

When adding a new template:

1. Drop a file in `lib/email/templates/<kind>.ts` exporting a
   `{ subject, html, text }` builder.
2. Add the kind to the `EmailKind` union in `lib/email/send.ts`.
3. Add an email-channel toggle to `notification_prefs` (alter table
   migration) and the `/account/email` page so users can opt out.
4. Wire the call site behind the toggle check.
