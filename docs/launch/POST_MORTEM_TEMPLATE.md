# Post-Mortem Template — `[Sev1|Sev2] <date> — <one-line summary>`

> Blameless. The point is to make the system better, not to assign
> fault. If you find yourself writing a sentence that starts "X should
> have", rephrase it as "the system allowed X to happen because…".
>
> Circulate within **48 hours** of any Sev1 or Sev2 incident.
> File path convention: `memory/post-mortems/YYYY-MM-DD_<slug>.md`.

---

## Incident summary

_One paragraph. The Sev1, the symptom, the duration, the user impact.
This is the "if you read nothing else" paragraph._

> Example: On 2026-05-12 between 14:03 and 14:47 UTC, the Paddle
> webhook endpoint returned 500s on roughly 12% of incoming events
> because a code change accepted a stricter signature header format
> than Paddle actually sends. 41 paid customers had delayed entitlement
> grants (median delay 28 minutes; none lost). Resolved by rolling back
> deployment `dpl_abc123` and reprocessing the failed events via the
> dead-letter queue.

## Timeline (UTC, minute-resolution)

| Time (UTC) | Event |
|-----------|-------|
| 13:47 | Deployment `dpl_abc123` shipped to prod. |
| 14:03 | First failed webhook recorded in `error_log`. |
| 14:11 | Sentry alert fired for spike in `/api/paddle/webhook` errors. |
| 14:12 | Founder paged (SMS). |
| 14:18 | Founder online; began investigation. |
| 14:31 | Root cause identified: signature parser regression. |
| 14:34 | Decision: rollback to `dpl_prev`. |
| 14:38 | Rollback complete; healthcheck green. |
| 14:42 | DLQ replay started for failed webhooks. |
| 14:47 | All failed events successfully replayed. |
| 15:30 | Status page closed. |

## Impact

- **Users affected:** 41 paid customers (~3% of active paid base on the day).
- **$ lost:** $0 in refunds (entitlements applied retroactively); ~$120
  in support time over the next 48h handling "where's my upgrade" tickets.
- **SLO burn:** webhook-handler SLO target is 99.9% success / 30-day
  window. This incident burned **0.31%** of the monthly budget.
- **Reputation:** 3 public tweets, 1 negative review (later updated).

## What went well

- Sentry alert fired in **8 min** from first error — well inside the
  15 min target.
- Rollback was clean; no migration involved, no data loss.
- DLQ pattern caught all failed events; nothing required manual replay.
- Customer comms went out within 30 min of resolution.

## What went poorly

- The signature-parser change didn't have a test that fed it real
  production-shaped headers.
- We had **no canary deploy** — the change went straight to 100% of traffic.
- The on-call alert went to email first, SMS second. Email lag added ~6 min.

## Lucky breaks

_Things that helped us but weren't by design — i.e. risks we still carry._

- The bug only fired on **incoming** webhooks. If we'd had a similar
  bug on **outgoing** signing, downstream customers' systems would have
  rejected every event for the duration.
- Traffic was off-peak. At launch-day peak, 41 affected users would have
  been ~400.

## Root cause(s)

_What allowed this to happen. Plural; aim for at least 2-3 causes._

1. **Code:** the parser used `header.split(";")[0]` assuming `ts=` was
   always first; Paddle sometimes sends `h1=` first. Real data would
   have caught this.
2. **Process:** no test fixtures using captured real-world webhook
   bodies. Unit tests used hand-crafted fixtures that happened to be
   in the wrong order.
3. **Deploy:** no canary. Every change is 0% → 100% in one shot.

## Action items

| Owner | Due | Item | Tracking link |
|-------|-----|------|--------------|
| Owner | 2026-05-15 | Add real Paddle webhook fixtures (captured from prod) to the test suite. | issue #TBD |
| Owner | 2026-05-19 | Add canary deploy step (10% → 100% with auto-rollback on error rate). | issue #TBD |
| Owner | 2026-05-13 | Switch on-call to SMS-first, email-second. | issue #TBD |
| Owner | 2026-05-20 | Add a "previous deploy is 1 click away" widget to /admin/status for faster rollback during incidents. | issue #TBD |

Action items without an owner and a date are wishes, not action items.
If you can't assign one of those, don't add the item.

## Lessons

- Webhook payload-shape regressions are not caught by typing alone —
  we need golden-file tests of real producer output.
- Email-first paging is too slow for Sev1. SMS or push, every time.
- A canary stage is no longer optional once we have paying customers.

---

_Blameless reminder: this document is about the system, not the
people who touched it. If a contributor's name appears, it's only as
"who has the context to make the fix", never as "who is at fault".
Anyone reading this 6 months from now should learn what to change in
the system, not who to mistrust._
