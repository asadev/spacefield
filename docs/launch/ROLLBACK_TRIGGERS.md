# Rollback Triggers — Numbers, Not Feelings

> Pre-decided rules for when we roll back the last release. The point
> is to make the call automatic so we don't argue at 3am.
>
> Two flavors: **auto** (system rolls itself back, page the human after)
> and **manual** (page the human, they make the call).
>
> Companion: [RUNBOOK.md](./RUNBOOK.md), [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## Auto-rollback (no human in the loop)

| # | Trigger | Sustained window | Action |
|---|---------|-----------------|--------|
| 1 | HTTP 5xx error rate **> 5%** of all requests | **5 min** rolling | Auto-rollback to prior Vercel deployment + page founder. |
| 2 | p95 latency **> 3000 ms** on any top-5 route | **5 min** rolling | Auto-rollback + page founder. |
| 3 | AI provider spend **> $100/hr** (sum across all providers) | **5 min** rolling | Kill-switch the AI features via feature flag + page founder. (We don't roll back the whole deploy — just the AI path.) |
| 4 | Paddle webhook success rate **< 80%** | **10 min** rolling | Page founder, queue webhook retries; rollback only if the drop correlates with the last deploy. |

**Auto means auto.** A cron + the metrics provider triggers the action.
The human gets a page *after* the action, not before. Reasoning: if any
of these thresholds is hit, the cost of waiting for a human to wake up
and click is higher than the cost of one bad rollback.

The 5-minute sustained-window matters: a single 30-second spike from a
crawler or a flapping check should not trigger a rollback. We pay for
that smoothing in latency-of-response, which is the right trade.

## Manual-rollback (human decides)

Page the founder. The founder decides whether to rollback inside
**15 minutes** of being paged.

| Trigger | Notes |
|---------|-------|
| Legal incident (cease-and-desist, regulator complaint, takedown demand) | Roll back the offending feature, not always the full deploy. Talk to counsel first if possible. |
| Security incident (suspected breach, leaked credential, exposed endpoint) | See INCIDENT_RESPONSE.md §Sev1. Rotate first, rollback second. |
| Payment processor outage (Paddle status page red) | Don't roll back our code — they're the problem. Queue charges, post status update, wait. |
| Mass user complaints (>50 reports/hour of the same issue not in our dashboards) | Frequently a real bug our monitoring missed. Roll back to prior release while we investigate. |

## How to roll back

### Vercel one-click
1. `vercel rollback` or **Vercel dashboard → Deployments → previous → Promote to Production**.
2. Confirm by hitting `/` and a JSON endpoint — both should return 200
   within 60 seconds (DNS TTL is 60s during launch week, propagation is fast).
3. Post to status page: "Investigating — rolled back to known-good
   deploy, monitoring".

### Database migration rollback
Migrations follow a header convention in `supabase/migrations/*.sql`:

```sql
-- migration: <slug>
-- rollback: <slug>.down.sql
-- safe-rollback: true|false|destructive
```

- `safe-rollback: true` → run the matching `.down.sql` immediately.
- `safe-rollback: false` → DO NOT roll back the migration; roll back
  the *code* to a version compatible with the new schema. Forward-only.
- `safe-rollback: destructive` → migration drops data. Restore from
  PITR backup; do not run the down script unless the founder explicitly OKs it.

### Feature-flag kill switch
For anything gated behind `admin_runtime_config` / feature flag:
1. `/admin/runtime` → toggle the flag off.
2. Change propagates within 30s (the runtime-config cache TTL).
3. No deploy required. This is the preferred rollback for AI features,
   experimental tools, and new admin sections.

## Comms during a rollback

| Channel | Who posts | Timing |
|---------|-----------|--------|
| **Status page** (status.spacefield.co) | Support lead | Within **5 min** of action. Template: "Investigating an issue affecting <X>. Rolled back to a previous version while we look. Updates here." |
| **Twitter / X** | Founder | Only if Sev1 or user-visible. Template: "We hit a snag on the latest update and rolled it back. Service is restored. Post-mortem soon." |
| **Customer email** | Founder | Only if data was affected or users took action with broken UX. Within **24h**. |
| **In-app banner** | Support lead | Within **10 min** if the issue is still affecting some users. Use `/admin/banners`. |

Do NOT post a generic "we're aware of an issue" without a follow-up
within 30 min. Silence after acknowledgement is worse than not acknowledging.
