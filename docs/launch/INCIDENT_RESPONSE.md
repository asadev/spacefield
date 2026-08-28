# Incident Response — Sev1 / Sev2 / Sev3

> What to do when something is on fire. Read this in calm times so you
> don't have to read it on fire.
>
> Companion: [RUNBOOK.md](./RUNBOOK.md), [ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md).

## Severity definitions

Pick the **highest** severity that any single criterion matches. When
in doubt, classify up — it's cheaper to over-respond.

### Sev1 — Production down or unsafe
- The site is unreachable for **>5 min**, OR
- Payments are failing for **>10 min**, OR
- A data breach / credential leak is **confirmed** or **strongly suspected**, OR
- We are causing **data loss** (writes succeeding but persisting wrong, or being silently dropped), OR
- A **regulator / legal** action has named us specifically and demands immediate response.

**Page founder immediately (SMS + push). Response target: 15 min.**

### Sev2 — Degraded or partial outage
- A major feature is broken for a known subset of users (>10% affected), OR
- Error rate sustained between 1% and 5% for >15 min, OR
- p95 latency sustained between 1.5s and 3s for >15 min, OR
- A non-payment third party is down (email provider, AI provider) and degrading user experience, OR
- A security finding that is **not** confirmed exploitation but warrants urgent attention.

**Page founder. Response target: 1 hour.**

### Sev3 — Annoying but not bleeding
- Single-user-class bugs, cosmetic regressions, slow-but-not-broken endpoints.
- Internal-only failures (admin reports stale, log lag).
- Edge-case AI hallucinations that don't affect money or safety.

**File a ticket. Response target: next business day. Handle in the next hotfix window (see RUNBOOK.md).**

## Escalation paths

| Severity | Path |
|---------|------|
| Sev1 | Sentry → SMS to founder → push to founder. If no ack in 10 min, alert the backup human (whoever is currently named in `memory/oncall-backup.md`). |
| Sev2 | Sentry → push to founder. If no ack in 30 min, escalate to SMS. |
| Sev3 | Email + ticket queue. No paging. |

If the alerting chain is *itself* broken, that's a meta-incident — go
check `/admin/observability` and the Sentry status page directly.

## The first 30 minutes (Sev1 / Sev2)

Run this list in order. Don't skip ahead.

1. **0–2 min — Acknowledge the page.**
   Reply "got it" in the war-room channel so anyone else watching
   knows a human is on it. Stop the alert from re-paging.

2. **2–5 min — Scope.**
   Open `/admin/status` + `/admin/observability` + Sentry. Three questions:
   - What's broken?
   - Who's affected? (one user, one workspace, one region, everyone?)
   - When did it start? (correlate with the most recent deploy / migration / config change)

3. **5–10 min — Stop the bleeding.**
   In priority order: roll back → kill-switch the feature → rate-limit
   the noisy caller → manual intervention. Do **not** try to root-cause
   first — stop the bleeding, root-cause second.
   See ROLLBACK_TRIGGERS.md §"How to roll back".

4. **10–15 min — Communicate.**
   - Post to **status page** (status.spacefield.co): "Investigating an
     issue affecting <X>. Updates here."
   - Post to **war-room channel** with the current hypothesis.
   - For Sev1 only: draft the public tweet / customer email — but
     don't send yet unless impact is broad.

5. **15–25 min — Root-cause or escalate.**
   If you have a hypothesis: verify it (logs, query, git blame). If you
   don't, broaden the lens — last 5 deploys, last 5 config changes, last
   5 cron runs, third-party status pages.

6. **25–30 min — Decide forward.**
   Either:
   - **Resolved:** post update, monitor 15 more min, then close.
   - **Mitigated, not fixed:** post update with ETA for proper fix,
     schedule the fix, keep monitoring.
   - **Still bleeding:** escalate (call the backup human, post to
     Twitter asking calmly for patience, consider taking the affected
     route fully offline behind a maintenance page).

## War-room procedure

- **One channel** per incident (don't use general). Name format:
  `inc-YYYYMMDD-<slug>` so it sorts.
- **One Incident Commander** — by default the founder. The IC's only
  job is decisions; they delegate everything else.
- **Pin the current hypothesis** at the top of the channel; update it
  every 10 min even if it hasn't changed ("still hypothesis X, no
  contradicting data").
- **Log every action** with a UTC timestamp. Cut-and-paste into the
  post-mortem later. This is the most boring and most important habit.
- **No solo heroics.** If you fixed something, post what you did before
  the next person tries something contradicting.

## External comms templates

Copy-paste these. Adjust the angle brackets. Don't try to write fresh
prose during an incident — you'll either say too much or sound like a
robot.

### Sev1 — initial (status page + tweet)

```
We're investigating an issue affecting <feature / all users>. We
noticed at <HH:MM UTC>. Updates here every 15 min until resolved.
```

### Sev1 — update

```
Update at <HH:MM UTC>: <one-sentence status>. Next update by <HH:MM UTC>.
```

### Sev1 — resolved

```
Resolved at <HH:MM UTC>. Root cause: <one sentence in plain English>.
Impact: <numbers — affected users, duration, whether any data was lost>.
Post-mortem will be published within 48 hours.
```

### Sev2 — initial

```
We're aware of an issue affecting <X>. Working on it. Most of the
product is unaffected. Updates here as we learn more.
```

### Sev2 — resolved

```
Fixed at <HH:MM UTC>. Sorry for the disruption. If you hit this
specifically, reply here or email <support email> and we'll make it right.
```

### Customer email (Sev1, after resolution)

```
Subject: <plain-English subject — "Service issue today, fully resolved">

Hi —

Earlier today between <HH:MM> and <HH:MM> UTC, <plain-English what broke>.

What this means for you: <only the parts that affected the customer>.

What we did: <one-paragraph factual recap, no jargon>.

What we're doing so this doesn't repeat: <2-3 bullet points>.

If you have questions or you think you were affected and we missed
something, reply directly to this email. I read every reply.

— the maintainer, founder
```

Send from the founder address, not `noreply@`. People respond to humans.

## After the incident

1. Schedule a 30 min slot within 48h to write the post-mortem (see
   [POST_MORTEM_TEMPLATE.md](./POST_MORTEM_TEMPLATE.md)).
2. Add at least one action item from the post-mortem to the next
   week's plan with an owner and a due date.
3. If user-facing comms went out, send a follow-up after the fix is
   verified — don't leave the public conversation hanging.
4. Sleep. Incidents are exhausting. Take the next morning slow.
