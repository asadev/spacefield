# Bug Bash — 48h Before Launch

> Two-hour scheduled session where we throw a small group at the
> product with one goal: find every visible defect before the world
> does.

## Timing

- Bash session: **T-2 days, 19:00–21:00 Dubai time**.
- Triage + fix window: T-2d 21:00 → T-1d 18:00.
- Re-verify window: T-1d 18:00–22:00.
- Sign-off ceremony: T-1d 22:00 (see below).

After sign-off, the codebase enters **bug freeze** —
see [BUG-FREEZE.md](./BUG-FREEZE.md).

---

## Participants

| Slot | Who | Role |
|---|---|---|
| Owner | Asad | Sets paths, triages, prioritises |
| Tester 1 | A real-estate agent friend | "Power user" persona |
| Tester 2 | A non-tech relative | "Cold user" persona |
| Tester 3 | A SaaS-savvy friend | "Comparison shopper" persona |
| Tester 4 (optional) | A QA-leaning friend | "Try to break it" persona |

All testers get a free Studio account for life as compensation. They
get a 1-page brief 24h before so they're not figuring out logins live.

---

## Test paths (assign one each)

### Tester 1 — Power user path
- Sign up with Google
- Connect a Stripe-substitute (Paddle sandbox in test mode)
- Create a CRM contact, a deal, log 3 activities
- Run the AI assistant: "summarise this contact's last 5 emails"
- Generate a proposal via the proposal-gen tool
- Use the Market Pulse widget
- Sign out, sign back in via magic link

### Tester 2 — Cold user path
- Land on homepage from a tweet (use a tracking URL)
- Sign up with email
- Complete onboarding (don't skip — but try to)
- First-run: open any tool, do anything
- Try to leave (and see if the prompt-to-stay works)
- Reset password
- Try to delete the account

### Tester 3 — Comparison shopper path
- Browse pricing page deeply
- Open the FAQ
- Try the free tier vs trial flow
- Apply a coupon code
- Upgrade mid-session
- Downgrade
- Try refund flow (see [MONEY-BACK-GUARANTEE.md](../marketing/MONEY-BACK-GUARANTEE.md))

### Tester 4 — Adversarial path
- SQL-injection-like inputs in every text field
- 10MB image upload to avatar
- Profanity in display name
- 200-character emoji string everywhere
- Rapid-click everything
- Hit refresh during a multi-step flow
- Open 5 tabs of the same workspace, edit the same row

---

## Severity rubric

| Severity | Definition | Must-fix before launch? |
|---|---|---|
| **S1 — blocker** | Auth, payment, data loss, can't sign up, security | YES — no exceptions |
| **S2 — major** | Tool fully broken, feature inaccessible, AI assistant errors >5% | YES — unless rollback-able |
| **S3 — minor** | Cosmetic, edge case, non-critical tool partial fail | NO — file for week-2 |
| **S4 — nit** | Wording, alignment, polish | NO — file for backlog |

If S1 or S2 count > 5 at T-1d 18:00, the launch slips by 24h. No
heroics — slip is cheaper than a broken launch.

---

## Triage protocol

- All bugs go into a single shared doc / Linear / GitHub issue list
  with tag `bug-bash-2026-XX-XX`.
- Format per row: `[Sev] [Path] What happens — file:line if known`.
- Asad triages within 1h of bash end.
- Each S1/S2 gets an owner + ETA.
- S3/S4 added to backlog with the bash tag.

---

## Sign-off ceremony

At T-1d 22:00 Asad reviews:
- All S1: must be fixed + re-tested. Zero open.
- All S2: must be fixed OR explicitly waived in writing with
  rollback plan. Zero open without waiver.
- Build: green on main branch. `npx tsc --noEmit` clean.
  Build time logged.
- Smoke test: signup → first tool → upgrade → signout. By Asad,
  end-to-end, on production-like URL.

If all pass → **bug freeze begins** ([BUG-FREEZE.md](./BUG-FREEZE.md)).

Sign-off is recorded in `memory/launch-2026-XX-XX.md` with timestamp
and what was waived.

---

## What we don't test in the bash

- Load (separate exercise — see [SCALE-UP-CAPACITY.md](./SCALE-UP-CAPACITY.md))
- Security pentest (separate exercise, ran T-7)
- A11y deep audit (separate, see [AUDIT-FINDINGS.md](../a11y/AUDIT-FINDINGS.md))
- Cross-browser exhaustively — bash uses Chrome + Safari (iOS).
  Firefox + Edge get a 15-min spot check.

Anything found outside the rubric still gets logged — just deferred
appropriately.
