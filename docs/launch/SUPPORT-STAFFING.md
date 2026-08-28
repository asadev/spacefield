# Support Staffing Plan — Launch Week

> Coverage plan for inbound from T-1d through T+7d.

## Channels and intake

| Channel | URL / tool | Auto-ack? | Triage cadence |
|---|---|---|---|
| Email | `support@spacefield.co` (Resend) | yes | every 1h |
| In-app chat | floating widget, posts to same inbox | yes | every 1h |
| Twitter mentions | `@spacefield` | no | every 30 min |
| Product Hunt comments | PH thread | no | every 15 min on launch day |
| Show HN comments | HN thread | no | every 15 min on launch day |
| Direct DMs to the maintainer | LinkedIn / Twitter | no | best-effort |

All channels feed into the same inbox via Resend forwarding. The chat
widget posts new conversations to `#support-incoming` in Slack.

---

## Coverage windows (Dubai time, UTC+4)

Today this is one person — the maintainer. The grid below names slots so a
contractor or first-hire can slot in cleanly later.

| Window | Dubai hours | Primary | Backup |
|---|---|---|---|
| Morning | 06:00 – 14:00 | Owner | Friend-X |
| Afternoon | 14:00 – 22:00 | Owner | Friend-X |
| Overnight | 22:00 – 06:00 | **auto-ack only** | Friend-X (alerts only) |

During overnight the auto-ack copy says:
```
Thanks — we'll reply within 8 hours. If your issue is urgent
(can't log in, payment problem), reply with URGENT in the subject
and we'll get to you faster.
```

URGENT-flagged tickets route to `#support-incoming` with a louder
ping (Slack DM to the maintainer).

---

## Time-zone splits (when we hire help)

The pattern we'll grow into:

| Shift | Coverage | Local hire from |
|---|---|---|
| APAC | 02:00 – 10:00 UTC | India / Philippines |
| EMEA | 06:00 – 14:00 UTC | Dubai (the maintainer today) |
| Americas | 14:00 – 22:00 UTC | LATAM / US East |

Three shifts of 8h with 2h overlap each end = round-the-clock with
warm handoffs.

---

## Response-time SLA (launch week)

| Tier | Target first reply | Target resolution |
|---|---|---|
| URGENT (auth, payment, data) | 1h | 4h |
| Standard (bug, question) | 8h | 48h |
| Feature request | 24h ack | n/a |

These are tighter than steady-state on purpose — launch week
attention pays back 10×.

Post-launch SLAs (T+14 onward):
| Tier | Target first reply |
|---|---|
| URGENT | 4h |
| Standard | 24h |
| Feature request | 72h ack |

---

## Escalation triggers

Escalate to the maintainer's phone (override "do not disturb") when:
- Inbox depth > 20 unread
- Same-issue tickets ≥ 3 in 1 hour (probably an incident)
- Any ticket mentioning words: `breach`, `leak`, `regulator`,
  `lawyer`, `press`, `urgent`, `outage`, `down`
- Refund request from a customer who paid > $200
- VIP customer (manual flag in admin)

The Slack bot rule for this lives in
`app/api/admin/support-escalation/route.ts`.

---

## Macros (pre-written replies)

Stored in admin → Support → Macros. Top 10 to have ready:

1. **password-reset** — link + instructions
2. **payment-not-applied** — see Tabletop Scenario 2
3. **delete-my-account** — point to the in-app data export + delete
4. **gdpr-request** — same as above + 30-day window
5. **refund-policy** — see [MONEY-BACK-GUARANTEE.md](../marketing/MONEY-BACK-GUARANTEE.md)
6. **ai-not-working** — short, link to status page
7. **feature-request-ack** — thanks + we add it to the board
8. **bug-report-ack** — thanks + repro request
9. **enterprise-inquiry** — booking link
10. **press-inquiry** — route to the maintainer directly

---

## Tools

- Inbox: Gmail (cheap, fine for v1) — `support@spacefield.co`
  forwarded into `support@example.com`'s Gmail.
- Chat widget: in-app, custom, writes to `support_tickets` table.
- Status page: status.spacefield.co (hosted on Better Stack).
- Macros + analytics: admin → Support tab.

When ticket volume crosses 30/day for two weeks running, switch to
Help Scout or Front. Pre-launch this is overkill.
