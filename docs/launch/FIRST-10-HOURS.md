# T+0 to T+10 — Hour-by-Hour Response Plan

> The most-loaded 10 hours of the launch. Sets the trajectory.
> Owner: Asad on every hour today; named slots for future hires.

Companion: [WAR-ROOM.md](./WAR-ROOM.md), [COMMS-PLAN.md](./COMMS-PLAN.md),
[ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md).

---

## T+0 — Go-live (09:00 Dubai)

**Shift:** Asad — full focus, no other meetings.

- Product Hunt scheduled post goes live at 00:01 PST = 12:01 Dubai —
  we adjust the Dubai start to match: **post goes live at 12:01 Dubai
  on launch day**. The "T+0" below is relative to that moment.
- Monitoring focus: signup rate, error rate, Sentry feed.
- Comms: Twitter launch tweet posted within 5 min. Email blast at
  T+30 min.
- Decision criteria: if first-30-min error rate > 5% → halt the
  email blast, investigate before more eyes arrive.

## T+1 — Stabilisation

**Shift:** Asad.

- Monitoring: signup → activation funnel (target >40%).
- Watch: AI assistant error rate (target <2%).
- Watch: Paddle webhooks (target 0 queued).
- Comms: reply to every PH comment ≤5 min. First milestone tweet if
  we're top-10 on PH.
- Decision: if AI assistant >5% error → flip to fallback model (see
  [TABLETOP-DRILL.md](./TABLETOP-DRILL.md) Scenario 1).

## T+2 — First spike absorbs

**Shift:** Asad.

- Monitoring: DB CPU + connection pool + replica lag.
- Watch: bandwidth on Vercel.
- Comms: Show HN post — go live now (avoids morning PST competition).
- Decision: if DB CPU > 80% for 10 min → bump compute one tier via
  Supabase UI.

## T+3 — Early-user signups taper, returning sessions begin

**Shift:** Asad.

- Monitoring: returning-user metrics. First "session 2" activations.
- Watch: support inbox depth (target <10).
- Comms: reply to all support emails. First batch of personalised
  thank-yous to first 50 signups.
- Decision: if inbox > 20 → enable auto-ack "we're swamped, back in
  4h" message.

## T+4 — Reply-everywhere sweep

**Shift:** Asad.

- Monitoring: tweet/PH/HN engagement; quote-tweet volume.
- Watch: any tweet picking up traction we should boost.
- Comms: reply to every quote-tweet and HN comment from T+0 to T+4.
  This is the biggest single comms task of the day.
- Decision: book a 15-min Loom and tweet it if any thread reaches
  >50 replies — the human face boosts conversion.

## T+5 — Lunch / energy reset

**Shift:** Asad. Eat. 20 min off-screen.

- Auto-ack on support inbox if needed.
- Sentry alerts still active to phone.

## T+6 — Mid-day stats post

**Shift:** Asad.

- Monitoring: signup count + tool-use distribution.
- Comms: mid-day stats tweet — "6 hours in: X signups, top tools
  Y/Z, biggest surprise was W".
- Decision: if a specific tool is getting outsized use → consider
  unhiding it in the homepage hero (config change, not deploy).

## T+7 — Press follow-up

**Shift:** Asad.

- Comms: nudge journalists with embargo lifted at T+0 — ask if they
  want quotes / a quick call.
- Personal-DM the most active early users with offer of 15-min call.

## T+8 — Evening surge (US East wakes up)

**Shift:** Asad — second adrenaline window.

- Monitoring: signups should re-spike as US East workday begins.
- Watch: Vercel function regions — confirm US East requests routing
  to iad1.
- Comms: re-share PH link to friends in US time-zones.
- Decision: if signups stall, post a "still live, still answering
  every comment" tweet to keep the loop alive.

## T+9 — Pre-handoff stabilisation

**Shift:** Asad.

- Monitoring: queue depth on background jobs (cron, emails, AI).
- Watch: AI cost burn for the day. Project full day cost.
- Comms: thank-you wave to first 100 paying customers if we crossed
  it. Personal note, not template.
- Decision: if AI cost > $300 in 9 hours → switch hot routes to
  haiku via runtime_config.

## T+10 — Founder reflection thread + day-1 close-out

**Shift:** Asad → about to hand to overnight rest mode.

- Monitoring: final KPI snapshot for `#metrics`. See
  [KPI-DASHBOARD.md](./KPI-DASHBOARD.md).
- Comms: founder reflection thread on Twitter — what worked, what
  surprised, what broke. Honest, not braggy.
- Decision: pre-set the alerting threshold for overnight. Phone
  on loud-override for Sev1 only.
- Sign-off: post in `#launch-war-room`:
  ```
  Day 1 close. {N} signups, {M} paid, {error}% error rate, {tickets}
  open tickets. I'm on alerts only until 06:00. Friend-X has the
  rollback procedure. Good first day.
  ```

---

## Rollback criteria summary (apply at any hour)

Roll back the deploy if ANY of:
- Auth broken (signup or signin) for > 5 min
- Payment webhooks failing AND it's our deploy that caused it
- Database error rate > 10%
- Error rate on `/` (homepage) > 5%
- Data-loss scenario suspected

Don't roll back for:
- Upstream provider outages (Anthropic, Paddle) — degrade gracefully
- Single tool errors (turn the tool off via runtime_config)
- Slow performance (scale up, not back)

See [ROLLBACK_TRIGGERS.md](./ROLLBACK_TRIGGERS.md) for full procedure.
