# Tabletop Drill — Pre-launch Scenarios

> Three scenarios we rehearse before T-0. Read out loud, walk the
> playbook, time-box each drill to 20 minutes. Run twice: T-7 and T-1.

Companion: [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md),
[ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md).

---

## Scenario 1 — Anthropic outage

**Setup:** It's T+2h. We're on the front page of PH. Sentry starts
flagging `AnthropicError: 529 overloaded`. AI assistant requests fail.
Anthropic status page goes yellow.

### Trigger
- Sentry: error rate on `/api/ai/chat` route ≥ 20% for 2 consecutive
  minutes.
- Alternative trigger: manual report in `#launch-war-room` that
  three users said the assistant is broken.

### Who's notified
1. `#alerts` channel — Sentry auto-post.
2. `#launch-war-room` — the maintainer pings `@here`.
3. Status page — the maintainer publishes "investigating AI assistant
   degradation" within 10 min.

### Decision tree
```
Is the failure isolated to one model (e.g. opus only)?
  → YES: switch default model to sonnet-4-7 via admin runtime_config.
         Banner: "AI assistant running on backup model. Quality may
         vary briefly."
  → NO:  Is fallback path (rule-based) configured for this route?
    → YES: flip feature-flag `ai.fallback-mode=on`.
            Banner: "AI assistant in limited mode. Full power back
            shortly."
    → NO:  Is the failure ≥10 minutes old?
      → YES: disable AI assistant entry-point in nav. Banner:
              "AI assistant paused — Anthropic outage."
      → NO:  Wait. Re-check in 5 min.
```

### Rollback criteria
- We do **not** roll back the deploy for an upstream outage. The
  deploy is fine. We degrade gracefully.
- We **do** roll back if our own code is amplifying the failure (e.g.
  retry storm hitting Anthropic and making it worse for us).

### Comms template
```
We're aware that the AI assistant is degraded. Cause: an upstream
provider outage. Everything else on Spacefield is working.

We'll update here every 15 minutes. Sorry for the bumps.
```

---

## Scenario 2 — Paddle webhook delivery failing

**Setup:** T+4h. 12 paid signups in the last hour, but admin shows
`subscription_webhooks_pending = 47`. Users paid but their plan didn't
upgrade. Three support emails already.

### Trigger
- BetterStack alert: webhook queue depth > 25 for 5 minutes.
- OR: 2+ support tickets in 1 hour matching `paid but not upgraded`.

### Who's notified
1. `#alerts` — BetterStack auto-post.
2. `#support-incoming` — support lead pages the maintainer.
3. the maintainer pings `@here` in `#launch-war-room`.

### Decision tree
```
Is Paddle status page green?
  → NO:  wait + status-page update + manual upgrade for paying users.
  → YES: Are we receiving any webhooks at all in the last 5 min?
    → NO:  signature verification breakage — check secret rotation.
           Roll back to last deploy where webhooks worked.
    → YES: Selective failure. Tail logs on /api/webhooks/paddle.
           Common causes: timeout (function maxDuration too short),
           DB connection pool exhausted, signature changed for new
           event type.

For any user who paid and isn't upgraded:
  → Admin → Users → Find by email → Manual plan-flip + note.
  → Reply to ticket with apology + 1-month credit.
```

### Rollback criteria
- Rollback the deploy if webhook signature verification is broken
  after a deploy. Last-known-good is in Vercel deployments list.
- Do **not** rollback if Paddle is the broken side — manual upgrade
  the affected users.

### Comms template (in-app banner)
```
We saw a delay processing some payments. If you paid in the last
hour and your plan hasn't upgraded yet, email support@example.com
and we'll fix it within 10 min + add a credit. No need to pay again.
```

---

## Scenario 3 — Database read-replica lag spike

**Setup:** T+6h. Admin dashboard shows replica lag = 47 seconds.
Users report stale data ("I created a deal, it's not showing").

### Trigger
- Supabase dashboard: read-replica lag > 10s for 3 consecutive checks.
- OR: 3+ support tickets matching `I created X but can't see X`.

### Who's notified
1. Supabase email alert → the maintainer.
2. the maintainer pings `@here` in `#launch-war-room`.

### Decision tree
```
Is the primary DB CPU < 80%?
  → NO:  scale primary compute up one tier via Supabase UI.
         Set runtime_config: `db.read-from-primary=true` temporarily.
         This eliminates replica use; primary takes more load but
         data is consistent.
  → YES: Is replication failing or just slow?
    → FAILING: Supabase support ticket immediately. Set
               `db.read-from-primary=true`. Monitor primary CPU.
    → SLOW:    Identify hot query — Supabase Insights → Query
               Performance. Kill anything > 5s. Add an index if
               obvious.

Did this start right after a deploy?
  → YES: check the deploy diff for new long-running queries or
         missing indexes. Rollback if hot.
  → NO:  organic load — scale up + watch.
```

### Rollback criteria
- Rollback if this started within 10 minutes of a deploy AND the
  diff touches schema or hot queries.
- Otherwise scale up, don't rollback. Rollback can make it worse
  if there's a migration involved.

### Comms template
```
A small subset of users are seeing slightly delayed data right now
(typically <60s). Your work is saved — it's just taking a moment to
appear. We're scaling up. Status: status.spacefield.co.
```

---

## After the drill

Each drill ends with three written answers:
1. Did we have the access we needed (Supabase UI, runtime_config admin,
   status page)?
2. Did we know the exact button-to-click for each branch?
3. What document was missing or wrong?

Update the runbook with whatever was missing. The drill is a forcing
function — it's worth less if we don't update.
