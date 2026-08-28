# Disaster Recovery Playbook

Step-by-step for the four outage shapes most likely to hit us. Read
this first when you're paged. Don't improvise — the steps below were
written with a clear head; in an incident, follow them.

Each scenario has the same structure:

1. **How you know** — the signal that triggered the page.
2. **First 5 minutes** — what to confirm before doing anything destructive.
3. **Mitigate** — what to flip / restore.
4. **Communicate** — what to post and where.
5. **Resolve** — close the loop.

If anything below contradicts `docs/ops/RTO-RPO.md`, this file wins —
the playbook is the operational truth.

---

## Common steps (do these first, every time)

1. Open `/admin/status` — does it load? If yes, our app server is fine
   and this is upstream/data. If no, this is app server.
2. Open `/api/health` — does it return 200? Includes a deep-mode
   probe via `?deep=1` + `Authorization: Bearer $HEALTH_DEEP_TOKEN`.
3. Open the relevant provider status page (links at the bottom).
4. Decide which scenario below this is. Don't run two playbooks at
   once; pick one and follow it.

---

## Scenario 1 — Supabase region (eu-central-1) is down

**How you know:**
- `/api/health` returns 503 with `probes.supabase.ok = false`.
- Multiple admin notifications with `kind = 'ops.anomaly.latency'` and
  `current_err_rate > 0.5`.
- Supabase status page shows incident in eu-central-1.

**First 5 minutes:**
- Confirm it's eu-central-1 specifically (Supabase status). If it's
  *our* project only (not the whole region), this is a different
  problem — skip to Scenario 5 (project-level corruption).
- Check whether reads work but writes fail (read replica is up but
  primary is down). Useful — see "degraded mode" below.

**Mitigate:**
- **Kill-switch the AI assistant** (it's read-heavy and the slowest
  to recover): GET `/api/admin/kill-switch?feature=ai-chat&on=1` with
  `Authorization: Bearer $ADMIN_KILL_TOKEN`. This sets a `runtime_config`
  row so SSR pages render a degraded banner instead of failing.
- **Show maintenance banner**: GET
  `/api/admin/kill-switch?feature=maintenance-banner&on=1` (also via
  `/admin/runtime-config` UI). Banner copy lives in `admin_banners`
  table — pre-seeded "We're aware. Investigating." entry.
- **Don't restore PITR** unless data is corrupted. A regional outage
  is not a data loss — Supabase will recover its own region. Restoring
  PITR while the region is down won't make the new project come up
  any faster; in fact it can't (the dashboard depends on the same
  region).
- If the outage exceeds 2 hours, consider failing over to a fresh
  Supabase project in eu-west-2 from the latest daily logical backup
  (`s3://spacefield-db-backups/`). RPO degrades to last-night-04:00-UTC
  in that path — communicate the data loss honestly.

**Communicate:**
- Post on `status.spacefield.co` (Better Stack-managed page) within
  10 minutes of confirming the outage.
- Pin a `/admin/banners` entry with link to the status page.
- For paying customers (Paddle subscriptions), draft an email via
  `lib/email.ts` template `incident-notification` — DO NOT auto-send;
  the maintainer sends after reading.

**Resolve:**
- Wait for Supabase to confirm region restored, then verify with
  `pnpm tsx scripts/verify-runtime.mjs`.
- Flip kill-switches back: `?on=0` for each.
- Post resolution on status page.
- File a post-incident note in `memory/YYYY-MM-DD.md`.

---

## Scenario 2 — Vercel region (fra1 or dub1) is down

**How you know:**
- Vercel status page shows incident.
- `vercel.json` deploys to two regions; if only one is down, Vercel
  routes around automatically — users in that region see degraded
  latency, not failure.

**First 5 minutes:**
- Confirm which region. If `dub1` only, GCC users see fra1 latency
  (~80ms extra). If `fra1` only, everyone sees worse latency but the
  service works.
- Check `/api/health` from both regions if possible (the deep probe
  reports the `region` it ran on).

**Mitigate:**
- If both regions are down, this is a Vercel platform outage —
  there is no in-band mitigation. Communicate honestly.
- If one region is down for > 1 hour, edit `vercel.json` to remove
  the dead region and `vercel deploy --prod`. This forces traffic to
  the surviving region instead of waiting on Vercel's edge routing.
  Revert after the outage clears.

**Communicate:**
- Status page update within 10 minutes.
- Reference Vercel's incident URL in our post so users can verify.

**Resolve:**
- Restore `vercel.json` if edited. Redeploy. Smoke test from each
  region using `scripts/measure-cold-start.ts --url $DEPLOY_URL`.

---

## Scenario 3 — Anthropic API outage

**How you know:**
- Sudden spike in `kind = 'ops.anomaly.latency'` notifications for
  `source` starting with `ai.*`.
- Anthropic status page shows incident.
- Customer support tickets mentioning "AI not responding".

**First 5 minutes:**
- Confirm it's Anthropic and not us: check `anthropic-api-status`
  header in failed responses (the SDK forwards it).
- Verify we still have AI key + quota — check Anthropic console.

**Mitigate:**
- **Kill-switch AI chat**: GET `/api/admin/kill-switch?feature=ai-chat&on=1`.
  The chat UI then shows "AI is temporarily unavailable" instead of
  spinning forever.
- **Kill-switch AI batch jobs**: GET `/api/admin/kill-switch?feature=ai-batch&on=1`
  — pauses the `ai-batch-runner` cron until resolved.
- **DO NOT fail over to a different model provider** mid-incident. Our
  prompts, tool-calling schemas, and skill definitions are
  Anthropic-shaped. A mid-incident swap to OpenAI causes a second
  incident.

**Communicate:**
- Status page update — but lean less on "we're down" and more on "AI
  features paused, app remains usable". Most of the app works without
  the assistant.
- In-app banner via `admin_banners` table — keep it confined to
  AI-feature pages where possible (the banner system supports
  per-route targeting).

**Resolve:**
- Flip kill-switches back when Anthropic resolves.
- Spot-check AI chat with a test workspace before flipping off the
  user-facing banner.

---

## Scenario 4 — Paddle outage (billing)

**How you know:**
- Paddle webhook deliveries failing (visible in
  `webhook_deliveries_v2` with status >= 500 and retry count climbing).
- Users on `/billing` see "Could not load subscription".
- Paddle status page incident.

**First 5 minutes:**
- This is **rarely** customer-facing in a real-time way — Paddle
  outages mostly affect subscription changes (sign-up, upgrade,
  cancel). Existing paying users keep their access because we cache
  subscription state in `subscriptions` table.
- Confirm: do existing paid users still get paid features? Open a
  test workspace as a paying user — does the gate hold?

**Mitigate:**
- **Disable the upgrade CTA**: GET
  `/api/admin/kill-switch?feature=paddle-checkout&on=1`. The upgrade
  buttons render a "Billing temporarily paused" banner instead of
  opening the Paddle modal.
- **Webhooks queue**: `webhook_deliveries_v2` has retry-with-backoff
  built in (see 20260518d_job_reliability.sql). Paddle redelivers
  events on its side anyway — we don't need to fetch missed events
  manually unless the outage > 24 hours.
- **Existing subscriptions unaffected**: do not flip any kill-switches
  on the app itself.

**Communicate:**
- Status page footnote — most users won't notice this one. Keep it
  low-key but document.
- If a user explicitly mentions billing in support, hand-confirm their
  subscription state from Paddle dashboard (or admin notes).

**Resolve:**
- Flip the checkout kill-switch off when Paddle clears.
- Spot-check the `paddle-retention` cron ran successfully overnight.

---

## Scenario 5 — Spacefield app (us) deployed a bad release

**How you know:**
- Errors spike immediately after a deploy.
- Anomaly cron pages within 30 min.
- Synthetic monitor reports failure.

**First 5 minutes:**
- Open `vercel.app/spacefield/deployments` — confirm latest deploy
  timestamp matches the start of the spike.
- Check the last commit's diff. If it's obviously bad, roll back.

**Mitigate:**
- **Roll back via Vercel**: `vercel rollback <previous-deployment-url>`.
  Faster than reverting a commit and rebuilding — < 30 seconds.
- Open a follow-up branch from the bad commit to investigate. Do not
  fix-forward unless the fix is genuinely a one-line obvious thing.

**Communicate:**
- Status page within 15 minutes if user-impacting.
- Internal note in `memory/YYYY-MM-DD.md`.

**Resolve:**
- Tag the bad commit `bad/<short-sha>` for future reference.
- File a post-mortem in `docs/postmortems/<date>-<slug>.md`.

---

## Kill-switch URL paths reference

All kill switches require `Authorization: Bearer $ADMIN_KILL_TOKEN`.
The toggle persists in `runtime_config` and is read by SSR pages on
every render (no caching). 30-second TTL on the lookup so flipping
takes effect within 30 seconds globally.

| Feature             | Path                                                       |
| ------------------- | ---------------------------------------------------------- |
| AI chat             | `/api/admin/kill-switch?feature=ai-chat&on=1`              |
| AI batch jobs       | `/api/admin/kill-switch?feature=ai-batch&on=1`             |
| Paddle checkout     | `/api/admin/kill-switch?feature=paddle-checkout&on=1`      |
| Maintenance banner  | `/api/admin/kill-switch?feature=maintenance-banner&on=1`   |
| Anomaly cron        | `/api/admin/kill-switch?feature=anomaly-check&on=1`        |
| Sign-ups            | `/api/admin/kill-switch?feature=signup&on=1`               |

Switch off by passing `&on=0`. The UI equivalent lives at
`/admin/runtime-config` (same effect, RBAC-gated to admins).

---

## Communication templates

### Initial — investigating

> We're aware of an issue affecting [AI assistant / billing / app
> access] starting around HH:MM UTC. We're investigating and will
> post the next update within 30 minutes. Track at
> status.spacefield.co.

### Initial — identified, mitigating

> The issue is caused by [provider/region] currently experiencing an
> outage (their status: [URL]). We've [kill-switched X / shown
> banner Y / etc] to keep the rest of the app usable. Next update
> within 30 minutes.

### Update — still ongoing

> [Provider] is still working on the underlying issue. The app
> remains [available / partially available]. Next update within 30
> minutes.

### Resolved

> Resolved at HH:MM UTC. [Brief summary of what failed and what we
> did]. Full post-mortem at docs/postmortems/[slug].md within 48
> hours.

---

## Provider status pages (bookmark)

- Supabase: https://status.supabase.com
- Vercel: https://www.vercel-status.com
- Anthropic: https://status.anthropic.com
- Paddle: https://status.paddle.com
- GoDaddy (DNS): https://godaddystatus.com
- Cloudflare (upstream we depend on transitively): https://www.cloudflarestatus.com

## Internal tools

- `/admin/status` — our own dashboard with `api_latency_summary`,
  error counts, cron health, last deploy SHA.
- `/admin/runtime-config` — kill-switch UI.
- `/admin/banners` — user-facing banner manager.
- `pnpm tsx scripts/verify-runtime.mjs` — smoke test after a restore.
- `pnpm tsx scripts/measure-cold-start.ts` — verify performance after
  a region change.
