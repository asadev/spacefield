# Spacefield Launch Runbook — T-30 to T+30

> The minute-by-minute operating doc for going public. Owned by the
> founder. Anyone on-call should be able to pick this up cold and know
> what to do without paging anyone.
>
> Companion docs:
> - [ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md) — when to abort and how.
> - [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) — Sev1/2/3 procedures.
> - [POST_MORTEM_TEMPLATE.md](./POST_MORTEM_TEMPLATE.md) — what to write after.

## Roles

Spacefield is a one-person company right now. We list real roles anyway —
**Asad currently wears all three hats**. The point of naming them is so
that during an incident "who's doing what" is obvious instead of "Asad,
holding three phones".

| Role | Hat | Responsibility |
|------|-----|---------------|
| **Founder / Incident Commander** | Asad | Final call on go/no-go, rollback, public comms. |
| **On-call Engineer** | Asad | First responder to alerts; runs the fix or rolls back. |
| **Support Lead** | Asad | Triages user reports, replies to email/social, status-page updates. |

**Escalation path (today):** alerts → Asad's phone → … that's it.
This is a known single-point-of-failure and is itself a Sev2 risk if
Asad is unreachable for >30 min during launch week. Mitigation: pre-arrange
a backup human (a friend, a contractor, anyone) who has the rollback
button procedure printed and can hit it on call.

**Escalation path (post-first-hire):** rotate on-call weekly, primary
+ secondary, founder is the third escalation only.

---

## Phase 1 — Pre-launch (T-30 to T-7)

The boring weeks where the launch is actually won or lost.

### T-30 — Legal & compliance freeze
- [ ] Terms of Service reviewed by counsel (UAE + EU baseline). PDPL +
      GDPR addenda attached if we're taking EU users.
- [ ] Privacy Policy reviewed by counsel; subprocessor list current
      (Supabase, Vercel, Paddle, OpenAI/Anthropic, Resend, Sentry).
- [ ] Cookie banner shipped if EU traffic is in scope.
- [ ] DPA template ready for any B2B prospect who asks day one.
- [ ] Data-deletion + export endpoints verified end-to-end with a real
      account (not just a dev fixture).

### T-21 — Capacity & resilience
- [ ] Load test the top-5 user flows at 10× current peak (k6 or
      Artillery). Capture p50/p95/p99. File anything >2s p95 as a
      pre-launch fix.
- [ ] Pre-scale: Vercel function regions confirmed, Supabase compute
      bumped to the launch-week tier (revert post-launch to control cost).
- [ ] Backup restore drill: pick a 24-hour-old PITR, restore to a
      throwaway project, confirm row counts on key tables match.
      Document the restore time — it sets our worst-case RTO.
- [ ] AI cost ceiling configured per provider; daily-spend alarm at 50%
      and 80% of budget.

### T-14 — Observability
- [ ] Sentry (errors) wired on web + edge + functions. Test alert fires
      end-to-end (raise a fake error, confirm the email/Slack hit).
- [ ] Better-Stack / Grafana / Vercel-Logs aggregation: at least 7-day
      retention. Pin the dashboards we'll actually watch on launch day.
- [ ] Uptime probes on the 5 most important URLs: `/`, `/admin/status`,
      `/login`, the top tool, the Paddle webhook endpoint.
- [ ] On-call alerting: Sentry → SMS/push to Asad's phone, NOT just email.

### T-10 — Support readiness
- [ ] Help-center top-20 FAQs written and indexed.
- [ ] Support email + in-app chat both routed to the same inbox; auto-ack
      with realistic SLA copy ("we reply within 1 business day during
      launch week").
- [ ] Macros pre-written for the 10 most likely tickets (password reset,
      billing question, "is this safe", "GDPR delete me", etc.).
- [ ] Status page (status.spacefield.co) live and bookmarked. Tested an
      incident-publish flow end-to-end.

### T-7 — Comms drafted
- [ ] Launch tweet/post drafted, 3 variants.
- [ ] Customer email drafted (for existing waitlist).
- [ ] Press kit + 1-pager PDF in `/press` route.
- [ ] Founder no-travel window confirmed (T-3 to T+7 minimum).
- [ ] Pre-recorded video walkthrough as fallback if live demo fails.

---

## Phase 2 — Launch week (T-7 to T-1)

### T-7 to T-3 — Bug freeze runway
- [ ] Code freeze on net-new features. Only bugfixes + copy edits land.
- [ ] Every open P0/P1 in the readiness checklist is closed or has a
      written justification for shipping with it open.
- [ ] Daily morning standup (with yourself if you must — write the
      yesterday/today/blockers in a memo).

### T-2 — Bug freeze
- [ ] Full freeze: no merges to `main` except hotfixes signed off by
      founder.
- [ ] War-room channel created (Slack/Telegram). Phone number for the
      backup human pinned at the top.
- [ ] KPI dashboard up: signups, activation %, errors/min, p95 latency,
      AI $/hr, Paddle webhook success-rate.
- [ ] DNS TTLs dropped to 60s on the apex + critical CNAMEs so a
      DNS-level rollback can land in minutes, not hours.

### T-1 — Final checks
- [ ] All scheduled tweets / posts / emails reviewed one final time.
- [ ] Tabletop drill rerun (15 min): "Sev1 — payment processor down".
      Confirm everyone in the war room knows the playbook.
- [ ] Eat a real meal. Sleep 7+ hours. Public-launch days are 16 hours.

---

## Phase 3 — Launch day (T-0)

All times **launch-local** (00:00 = the moment the public link goes out).

### 0h — Go-live
- **Focus:** error rate, signup conversion, payment success.
- **Comms slot:** publish launch post; tweet; send waitlist email.
- **Playbook:** confirm `/` returns 200 from 3 geographies; confirm a
  synthetic signup works end-to-end (signup → email verify → first action
  → optional paid upgrade).
- **Bail-out:** if any of the synthetic checks fail, hit pause on the
  comms thread before it spreads, fix forward or roll back. See
  ROLLBACK_TRIGGERS.md §"Manual".

### +1h — Early signal
- **Focus:** errors/min trend, p95 latency, any 5xx clusters by route.
- **Comms slot:** reply to the first wave of comments / DMs / Hacker
  News thread. Don't argue, just thank + note feedback.
- **Playbook:** scan Sentry top-5 issues. If any single error >100 events,
  decide: hotfix or rollback. Anything user-facing that breaks signup or
  payment is Sev1 — see INCIDENT_RESPONSE.md.

### +3h — Sustain
- **Focus:** AI spend rate ($/hr), Supabase CPU + connections, Paddle
  webhook success-rate.
- **Comms slot:** repost / cross-post to secondary channels (LinkedIn,
  Reddit if appropriate, partner newsletters).
- **Playbook:** if any backend metric is at 70% of its alarm threshold,
  pre-scale now rather than later. Cheaper than a 3am emergency.

### +6h — Plateau
- **Focus:** activation rate (% of signups completing a first action).
  This is the real KPI. Errors and latency will be near-zero by now;
  if they're not, you have bigger problems.
- **Comms slot:** quick update post — "X signups in 6 hours, here's
  what's resonating". Builds momentum without sounding desperate.
- **Playbook:** look at the funnel drop-offs. If activation <20%, the
  problem is product/onboarding, not infra. Note it for tomorrow's
  iteration — don't ship a fix at hour 6 on launch day.

### +12h — Wind-down
- **Focus:** support queue depth, overnight error baseline.
- **Comms slot:** silence on social; reply to support only.
- **Playbook:** brief handoff note (even to yourself) — what's open,
  what's on fire, who replied to whom. Sleep. Set alarms only for
  Sev1/Sev2 pages; let Sev3 wait until morning.

---

## Phase 4 — First week (T+1 to T+7)

- **Daily 9am standup** with yourself (or team) — 15 min, written in
  `memory/launch-week.md`. Format: yesterday's #s, today's focus,
  blockers, any new known issues.
- **KPI review:** 9am + 9pm. Watch signups, activation, retention-D1,
  Paddle MRR-net-new, support backlog.
- **Hotfix windows:** 10am–noon local + 4pm–6pm local. Don't ship outside
  those windows unless it's a Sev2+. Reduces surprise-bug compounding.
- **Triage rule:** any bug reported by ≥3 users in 24h jumps to P1 and
  gets fixed inside the next hotfix window.

---

## Phase 5 — First month (T+7 to T+30)

- **T+7:** write a public retro post — "What launching taught us".
  Builds trust + recruits future users via storytelling.
- **T+10:** post-mortem any Sev1/Sev2 from launch week (use the
  template). Circulate internally even if "internally" is one person.
- **T+14:** retention-D7 checkpoint. If <30%, freeze new-feature work
  and dig into the activation funnel.
- **T+21:** scale-up review. If sustained traffic >2× the pre-launch
  baseline, lock in the higher Vercel/Supabase tier instead of
  burst-pricing. If <2×, you can roll the pre-scaled tier back.
- **T+30:** retention-D30 checkpoint. This is the real number that
  predicts whether the launch was a stunt or a business.
- **Ongoing weekly:** "what nearly broke" review — 30 min looking at
  the week's top-10 errors and slow queries. Pick one to actually fix.

---

## Quick links

- Rollback triggers + procedure: [ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md)
- Incident severities + comms templates: [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)
- Post-mortem template: [POST_MORTEM_TEMPLATE.md](./POST_MORTEM_TEMPLATE.md)
- Readiness checklist (live): `/admin/status`
