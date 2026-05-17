# War-Room Setup

> The channel that runs the launch. Open at T-1h, close at T+72h.

## Platform

Primary: **Slack**, workspace `spacefield-ops`. Free tier is fine for
launch week.

Fallback if Slack is down: **Discord**, server `Spacefield Ops`,
channel `#launch-war-room`.

Why two: if our own status comms platform goes down, we need to keep
talking. Pre-create both, pin both invite links in the launch
runbook.

---

## Channels (all in `spacefield-ops` Slack)

| Channel | Purpose | Who's in it |
|---|---|---|
| `#launch-war-room` | Live launch traffic, decisions, status | Everyone on launch crew |
| `#alerts` | Sentry, BetterStack, Vercel, Supabase alerts | Bot-only writes; humans read |
| `#support-incoming` | Auto-feed of new help-center tickets | Support lead |
| `#metrics` | Hourly KPI screenshots (see [KPI-DASHBOARD.md](./KPI-DASHBOARD.md)) | Asad |
| `#wins` | Public-facing nice things (PH comments, tweets) | Everyone |

Pin in `#launch-war-room`:
1. RUNBOOK.md link
2. ROLLBACK_TRIGGERS.md link
3. The status-page admin URL
4. Vercel project URL
5. Supabase project URL
6. Anthropic console URL
7. "Who's on call right now: {name} until {time}"

---

## Staffing rotation

Today this is a one-person company. The rotation slot is occupied
by **Asad** for all four shifts. The point of writing it down is
that a future contractor or first-hire slots into a named seat, not
into "whatever Asad usually does".

| Shift | Hours (Dubai) | Primary | Backup |
|---|---|---|---|
| Launch | T+0 to T+10 | Asad | Friend-X (phone-only) |
| Evening | T+10 to T+18 | Asad (on call) | Friend-X |
| Overnight | T+18 to T+28 | Asad (alerts only) | Friend-X |
| Morning-2 | T+28 to T+38 | Asad | Friend-X |

**Friend-X protocol:** see [ON-CALL.md](./ON-CALL.md). They get a
printed rollback procedure and Asad's number.

---

## Ladder of escalation

```
Sev3 (cosmetic, ≤5 users affected)
  → handled in #launch-war-room, no page, no rollback discussion.

Sev2 (one tool broken OR 5–50 users affected OR 5%+ error rate)
  → @here in #launch-war-room.
  → Asad makes call within 15 min: hotfix or live-with-it.
  → User comms within 30 min if external.

Sev1 (auth broken OR all users affected OR >20% error rate OR data loss risk)
  → @channel in #launch-war-room.
  → Asad makes call within 5 min.
  → Rollback considered immediately — see ROLLBACK_TRIGGERS.md.
  → Status page goes red within 10 min.

Sev0 (security incident, breach, exposed credentials)
  → @channel + phone call to Asad.
  → Service may be taken offline pre-emptively.
  → Notify counsel within 1h. Notify regulators per PDPL/GDPR.
```

---

## Decision-maker designation

There is exactly one decision-maker per shift — the Incident
Commander. Today that is always **Asad**.

The Incident Commander has these powers and nobody else does:
- Trigger a rollback
- Take the site offline
- Publish a status-page update
- Talk to press
- Issue refunds outside the standard policy

Even if a friend is helping during overnight, they **page Asad** for
any of the above — they do not make the call themselves.

---

## Who talks to press

Only Asad. If a journalist DMs anyone on the crew during the launch,
they reply:

```
Thanks for reaching out — Asad (founder) handles all press.
Reaching him at support@example.com. He'll be back to you within 2h.
```

Nobody else speaks on the record. Off-the-record from anyone other
than Asad is also off-limits during launch week — journalists print
what they remember.

---

## Sign-off

War room closes T+72h with:
- Final KPI screenshot in `#metrics`
- "Lessons learned" thread in `#launch-war-room` — Asad seeds top 3
- Archive channels (keep the workspace, archive the channels for
  audit trail)
