# 30-Day Money-Back Guarantee

> Launch-window promise to remove buying friction. Internal policy +
> customer-facing copy. Mechanism is Paddle's standard refund flow.

## When it applies

A customer is entitled to a full refund if **all** of:

1. Refund requested within **30 days** of their first paid charge.
2. Account is in good standing — no abuse signals (see "When it
   doesn't apply" below).
3. Refund is for a **single billing period** — monthly or annual.

For annual plans: full refund within 30 days, prorated refund of
the unused portion if requested at any point after that (we
unilaterally extend this, it's good will, not policy).

## When it doesn't apply

Refunds may be denied — at our discretion — if:

- Account shows abuse: scraping, content theft, automated traffic
  flooding, or attempts to bypass rate limits.
- Customer has been refunded previously on the same product within
  90 days (the buyback-cycle abuser pattern).
- Customer accumulated significant AI-cost usage in the refund
  window such that the refund would represent a meaningful net loss
  to us (we publish "what counts" below). In this case we offer a
  partial refund of seat cost minus AI usage cost.
- Refund is being requested for chargeback reasons that violate
  Paddle's seller protections.

"Significant AI-cost usage" threshold for partial-refund consideration:
> AI cost in the refund window exceeds 50% of the seat price paid.

## Mechanism (operations)

Today the flow is manual:

1. Customer emails `support@spacefield.co` with `refund` in the
   subject, or uses the in-app "request refund" button.
2. Support reviews in admin → Users → {user} → Billing tab.
3. If qualifying: open Paddle dashboard → Transactions → find the
   payment → Issue Refund → enter amount → confirm.
4. Paddle webhook fires `subscription_payment_refunded` → our
   handler downgrades the plan on the user's row and writes an
   audit log entry.
5. Support replies to the customer: refund issued, time to bank
   account 5–10 business days, plan downgraded immediately.

When volume increases, automate the qualifying-case path:
- In-app refund button auto-checks the qualifying criteria.
- If qualifying → auto-refund via Paddle API + auto-downgrade.
- If borderline → routes to human review.

Code lives at `app/api/refunds/route.ts` (currently stub).

## Customer-facing copy

### Pricing page block

```
30-day money-back guarantee

If Spacefield isn't right for you, email us within 30 days of your
first charge and we'll refund you in full. No forms, no haggling,
no "are you sure?". Just say the word.
```

### Refund-request page (in-app)

```
We're sorry it didn't work out.

Tell us what made you decide to leave — one sentence is enough.
We use this to fix the product, and your refund happens either way.

[ textarea ]
[ Request refund ]

What happens next:
- Your refund goes back to the same card. Takes 5–10 business
  days at the bank's end (it's not us).
- Your account stays open until the end of the current billing
  period. After that it converts to the free tier so your data
  isn't lost.
- You can export everything any time from Settings → Data → Export.
```

### Email reply template (approved)

```
Subject: Refund confirmed

Hey {firstName},

Refund of {amount} processed back to your card just now. Banks
take 5–10 business days from here.

Your account stays open until {endOfBillingPeriod}. After that it
moves to the free tier so you keep access to your data — export
any time from Settings → Data → Export.

Thanks for trying us. The reason you mentioned ({reasonShort}) is
on our list — if it gets fixed and you want to come back, this
email is the place to start.

— the maintainer
```

### Email reply template (denied)

```
Subject: About your refund request

Hey {firstName},

Reviewed your refund request. {Reason}.

I want to be straight about it: this is the rule we wrote down
before launch, and bending it for one customer means I have to
bend it for everyone. {Alternative we can offer, if any}.

Happy to talk it through — reply here or book 15 min:
{calendlyLink}.

— the maintainer
```

## Reporting

Refund rate is a launch-week KPI (not in the top-5 dashboard but
tracked in admin):

```sql
select
  date_trunc('week', refunded_at) as wk,
  count(*) as refunds,
  sum(amount) as refunded_total
from billing_refunds
group by 1 order by 1 desc;
```

Target: < 5% of paid signups in launch week 1, < 3% steady-state.

Above 5% means either (a) we're misrepresenting the product or
(b) we're charging too early in the onboarding. Both are fixable;
both are urgent.

## Why we offer it

Conversion lift on guarantees-this-strong is consistently 10–20%
for SaaS in this price range. Refund cost at <5% rate is
meaningfully less than the lift. The math works on launch budgets.

Separately: it's the right thing to do for a brand-new product
that nobody has heard of yet. The asymmetry — easy refund vs.
no-refund anchor — is the same asymmetry we want our customers to
feel about us as a vendor.
