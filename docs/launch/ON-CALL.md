# On-Call Rotation

> Procedure for who answers the phone when something breaks. Today
> this is mostly Asad; the structure is here so a hire slots in.

## Today's reality (one-person company)

- **Primary on-call:** Asad. 24/7.
- **Secondary:** Friend-X. Paging-eligible during launch week ONLY
  (T-1 to T+7).
- **Escalation path:** alerts → Asad's phone → Friend-X (after 15
  min no-ack) → support email (auto-ack).

Friend-X is a real person Asad has briefed. They have:
- Printed rollback procedure (from ROLLBACK_TRIGGERS.md)
- Vercel + Supabase dashboard logins (read-only)
- Asad's spouse's number for "is Asad OK"
- One-page playbook: "if the site is down, here is the one button you
  push, then call Asad"

## Tomorrow's structure (post-first-hire)

| Week | Primary | Secondary | Escalation |
|---|---|---|---|
| Even-numbered | Asad | Hire-1 | Hire-2 |
| Odd-numbered | Hire-1 | Asad | Hire-2 |

Rotate weekly. Two people on a 2-week rotation gives each person
50% weeks off-call.

---

## Paging tool

**Today:** Sentry + Better Stack → SMS to Asad's UAE number.
Phone is on "do not disturb override" for these two senders only.

**Production-ready replacement options (when budget allows):**
- **PagerDuty** — gold standard, $21/user/month, full SLA features.
- **OpsGenie** — Atlassian, $9/user/month, slightly less polished.
- **Better Stack On-Call** — already in our stack, $24/user/month
  add-on. Lowest friction.

Pick one at T+30d when launch dust settles and team grows beyond 1.

For now, the placeholder is:
```
Sentry alert → Email → Gmail filter → Forward to Twilio webhook
              → SMS to +971 5X XXX XXXX
```

---

## Off-hours protocol

Define "off-hours" as 23:00–06:00 Dubai for Asad. During off-hours:

### What pages Asad
- Sev0: security incident, breach, exposed creds — **always pages**.
- Sev1: site down, auth broken, payment broken — **always pages**.
- Sev2: one feature broken — **does NOT page**; queued for morning.
- Sev3: cosmetic — **does NOT page** ever.

### What gets handled by the auto-ack
- Support tickets: auto-ack with "we'll reply by 09:00 Dubai".
- Twitter mentions: not monitored 23:00–06:00.
- Email: standard auto-responder.

### Sleep override conditions
Even Sev1 doesn't page if:
- The site has been in known-degraded state for >30 min and Asad
  acknowledged it before sleeping.
- A maintenance window is in effect.

---

## Hand-off ritual (when team grows)

End-of-shift hand-off, posted in `#launch-war-room`:

```
Handing off to {next}.

Open incidents: {list, or "none"}
Open tickets: {count}
Recent deploys: {sha + time}
Watchlist: {anything trending the wrong way}
Known issues (do-not-page-for): {list}

You have the conn.
```

Receiving on-call replies `taking over` to make the hand-off
explicit.

---

## What "on-call" actually means

The on-call:
- Acknowledges any page within 5 min (Sev1/0) or 30 min (Sev2)
- Owns the response until handed off
- Decides rollback vs hotfix vs wait
- Owns status-page updates during their shift
- Updates the runbook with anything learned

The on-call does NOT:
- Work on features during their shift (they're reactive only)
- Take meetings during their shift (rescheduled or covered)
- Drink alcohol during their shift (this is a real rule)

---

## "Asad is unreachable" protocol

If Asad doesn't ack a Sev1 within 30 min:
1. Friend-X gets a page (via SMS).
2. Friend-X opens Vercel dashboard, identifies last good deploy,
   uses "Promote to Production" to roll back.
3. Friend-X posts in `#launch-war-room`: "Asad unreachable.
   Rolled back to {sha}. Will keep trying to reach him."
4. Friend-X calls Asad's spouse to confirm he's OK.
5. Status page goes to "investigating" with vague copy. No detail
   until Asad is back.

This protocol exists because the alternative — flying blind for
hours during a launch — is worse than a possibly-unneeded rollback.
