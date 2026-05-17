# Bug Freeze Policy

> The 36-hour window before launch where the codebase is locked. Stop
> shipping features. Only fixes that meet the bar below land in main.

## Freeze window

- **Starts:** T-1d 22:00 Dubai (right after bug-bash sign-off).
- **Ends:** T+24h Dubai (after first day stabilises).
- **Total duration:** ~46 hours.

During this window, the deploy bar is **much higher** than normal.

---

## What can land

✅ **OK to merge during freeze:**

- Fixes for S1 bugs (auth, payment, data loss, security) found in
  bug bash or live.
- Fixes for S2 bugs found in bug bash or live with an active
  user-impacting trace.
- Copy/typo fixes that the founder personally reviewed and approved.
  Limit: 5 per day, no exceptions.
- Status-page-driven hotfixes during an incident (see
  [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)).
- Config-only changes (banners, feature flags, runtime_config). Not
  deploys.

❌ **NOT OK during freeze:**

- New features. Even small ones. Even "won't take long".
- Refactors. Even "purely additive".
- Dependency upgrades. Period.
- Schema migrations except the rollback of a broken one.
- New API routes.
- Performance optimisations unless tied to a Sev1.
- Re-skinning. Visual changes that aren't bug fixes.

---

## Hotfix criteria

A hotfix during freeze must meet ALL of:

1. **Visible user impact.** A user-reportable symptom. Not "this
   could theoretically break".
2. **Severity ≥ S2.** S3/S4 wait for the post-launch backlog.
3. **Diff size ≤ 100 lines.** Bigger means bigger risk of side
   effects. Split or defer.
4. **No new dependency.** Existing libs only.
5. **No schema migration.** Schema changes are too risky during a
   spike — defer or work around in code.
6. **Tested by the author end-to-end** on a preview URL. Sign-off
   line in the commit message: `Tested on: {preview-url}`.

---

## Sign-off authority

Today: **Asad** is the only sign-off authority.

A hotfix during freeze requires Asad to:
1. Read the diff
2. Run `npx tsc --noEmit` (must be clean)
3. Open the preview URL and reproduce the original bug, then verify
   the fix
4. Type the word "ship" in `#launch-war-room` as a record

Self-approval is allowed today (one-person company). The verification
steps are NOT optional — they prevent the 3am tired-Asad mistake.

When team grows: hotfix requires the on-call + a second human's
typed "ship" in `#launch-war-room`.

---

## Process for a hotfix

```
1. Bug observed (alert, support ticket, or owner-noticed).
2. Open a branch `hotfix/short-description` off main.
3. Write the fix. Diff ≤ 100 lines.
4. Run `npx tsc --noEmit` — must pass.
5. Push, open PR.
6. Vercel preview URL generates.
7. Open preview, reproduce bug pre-fix, verify fix.
8. Sign-off (see above).
9. Merge.
10. Auto-deploy via Vercel.
11. Monitor Sentry and `#alerts` for 10 min.
12. If new errors spike → revert via Vercel "promote to production"
    on previous deploy.
13. Post a one-liner in `#launch-war-room`:
    `Hotfix shipped: {sha} — fixed {symptom}`.
```

---

## "I think this is a hotfix" decision tree

```
Is a user reporting it?
  → NO: probably can wait. Add to backlog.
  → YES: How many users?
    → 1 user, edge case: macro reply, add to backlog.
    → 2-5 users, similar issue: hotfix candidate. Verify scope.
    → >5 users or growing trend: hotfix definitely. Possibly Sev1.

Is the fix obvious + small?
  → NO: defer. Don't try to engineer a fix during freeze.
  → YES: proceed with hotfix process above.

Could the fix make things worse?
  → If you can't answer "no" confidently in 30 seconds: defer.
```

---

## After freeze ends

- Post-mortem the freeze: what waited, what we wished we'd shipped,
  what slipped that we didn't catch.
- Backlog grooming: move anything tagged `waited-for-freeze-end` to
  the next sprint.
- Normalize the deploy bar back to standard.
