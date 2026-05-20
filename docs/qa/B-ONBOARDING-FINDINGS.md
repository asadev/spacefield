# QA-B: Onboarding + account + workspace lifecycle — findings

Branch: `qa-qa-b-onboarding`. Baseline SHA: `783fa8b` (`docs(ops): CRON-CADENCE.md…`).
Personas walked: (1) brand-new user, (2) returning user changing settings, (3) departing user.
Surfaces audited: `/signin`, `/auth/callback`, `/auth/locked`, `/auth/reauth`, `/account`, `/account/security`, `/account/notifications`, `/account/email`, `/workspace/settings`, lockout check API, cron purge routes, workspace ensure / invite / transfer.

Live probes against `https://spacefield.co/*` confirmed `/signin` 200, `/login` **404**, `/onboarding` **404**, `/account/notifications` and `/account/email` render 200 (unauth path is server-action / form-action triggered, so the dead `/login` redirect only fires on form submit, not page-GET).

## ✅ Working

- `/signin` magic-link + OAuth flow renders, including locked-banner readback from `?locked=1&until=…` (`app/signin/page.tsx:101`).
- `/auth/callback` is solid: re-checks lockout server-side after Supabase session is established, fire-and-forgets `clearLockout` + `recordLogin`, honors `?next=`, normalises external-URL tampering by rebasing onto origin (`app/auth/callback/route.ts:139`), surfaces `?toast=` on unlock.
- `/auth/locked` magic-link unlock loop is correct: `?unlock=1` in the callback short-circuits the lockout re-check and propagates a success toast (`app/auth/callback/route.ts:91-101,146-150`).
- `/auth/reauth` gates on signed-in, lists TOTP + recovery, falls through gracefully when neither exists (legacy accounts pre-2FA-rollout, `app/auth/reauth/page.tsx:76-80`), validates `?next=` against `//` open-redirect.
- `/account` Profile + Email change + Danger Zone all gated by `requireRecentAuth` on sensitive submit; type-to-confirm email match is case-insensitive (`app/account/_actions.ts:90`).
- `requestAccountDeletion` is idempotency-keyed on `user-id:minute-bucket` so double-clicks don't reset the 30-day grace; outbox emit dedupes on the same key (`app/account/_actions.ts:119-149`).
- `/account/security` TOTP enroll flow auto-issues recovery codes on first verify (`app/account/security/_actions.ts:117`), prunes >10-minute-old unverified factors before a new enrollment (`app/account/security/_actions.ts:179-194`).
- `/workspace/settings` correctly re-fetches soft-deleted workspaces to keep the cancel-deletion UI reachable after `workspaces.deleted_at` is stamped (`app/workspace/settings/page.tsx:77-86`).
- `request_workspace_deletion` RPC mirrors `grace_until` onto `workspaces.deleted_at` so existing read paths immediately hide the workspace, while the queue row keeps cancel possible (`supabase/migrations/20260517a_account_lifecycle.sql:159-165`).
- Cascade graph: `auth.users → workspaces → workspace_members → … → account_deletion_requests` all chained on delete cascade (`20260426_workspace_sync.sql:5`, `20260427_workspace_sharing.sql:11-15`, `20260517a:26`).
- `admin_audit_log.actor_id` is `on delete set null` — audit rows survive user purge (PII compliance, `20260509_admin_panel_foundation.sql`).
- `/api/auth/check-lockout` deliberately doesn't increment failure counter (`route.ts:27-33`) — no oracle for attacker to spam the endpoint into locking real users.

## ⚠️ Minor

- `/signin` URL `until=` value is accepted up to 64 chars then trusted as-is — `describeLockoutCountdown` returns "try again shortly" on garbage, but lets you stash arbitrary querystring noise. Tighten to ISO-8601 parse-and-reserialize (`app/signin/page.tsx:30`).
- `SignInPageInner` reads `?next=` only on first effect; if the URL is changed via `router.replace` mid-flow, the post-auth redirect target is stale. Low-impact since the page only renders for unauth users.
- `FactorList` calls `router.push(state.reauth)` during render rather than inside `useEffect` (`app/account/security/_components/FactorList.tsx:64-67`). Triggers strict-mode warnings and a stale-render navigation if the action returns a second time.
- `request_account_deletion` RPC body has no rate limit — a logged-in user can call it thousands of times. The idempotency wrapper on the server action helps the UI case but the RPC itself is `to authenticated`. Add a per-user 1/min throttle inside the RPC (`20260517a:66-92`).
- `cancelAccountDeletion` returns the same `ActionResult` shape but doesn't emit a corresponding outbox event (`account.deletion_cancelled`), so the audit trail is one-sided (`app/account/_actions.ts:161-169`).
- `account_deletion_requests.ip_hash` is stored but never displayed or used for abuse review surfaces. Either wire into `/admin/auth-events` or drop the column.
- `/account/notifications` and `/account/email` titles use "Space Field" in metadata while UI uses "Space Field" with non-breaking space mix; minor brand-consistency nit.
- Workspace-deletion RPC raises generic `'only the workspace owner can request deletion'` — the client surfaces this string verbatim. Wrap in a friendly error in the server action (`app/workspace/settings/_actions.ts:62`).
- Welcome email template exists at `lib/email/templates/welcome.ts` AND a legacy duplicate at `lib/email.ts:141` — keep one, mark the other as deleted.
- `lib/email.ts` welcome email button uses `#7c3aed` (purple) but Spacefield brand is teal/silver per IDENTITY notes — both welcome templates ship purple CTAs (`lib/email.ts:124`, `_chrome.ts` button style).

## ❌ Bugs (per persona)

### Persona 1 — Brand-new user

**B1. `/onboarding` route doesn't exist** — live probe `GET https://spacefield.co/onboarding → 404`. There is no first-run flow page; new users land on `/` after callback. `app/admin/onboarding` is unrelated (admin tooling). If a tour is meant to fire it's silent.
- Severity: P2 (UX gap, not broken auth)
- Persona: 1
- Fix: either ship `app/onboarding/page.tsx` with a checklist, or drop all docs/comments referencing `/onboarding/*`.

**B2. Welcome email is never sent** — `welcomeEmail()` template exists in two places (`lib/email.ts:141`, `lib/email/templates/welcome.ts:18`) but no call site imports it. Grep:
```
$ grep -rn "welcomeEmail\|sendWelcome" app/ lib/
lib/email.ts:141:export function welcomeEmail(args:
lib/email/templates/welcome.ts:18:export function welcomeEmail(vars:
```
- Severity: P2 (first-run delight gap, also `notification_prefs.email_welcome` defaults true but nothing sends)
- Persona: 1
- Fix: in `app/auth/callback/route.ts` after a successful exchange, check if `profiles.created_at == auth.users.created_at` (≈ first session) and emit via `enqueueEmail()` or fire `sendEmail()` directly.

**B3. `/api/workspaces/ensure` doesn't reject soft-deleted workspaces** — service-role lookup at `app/api/workspaces/ensure/route.ts:64-86` returns the existing row whenever `existing.user_id === user.id`, even if `workspaces.deleted_at IS NOT NULL`. A localStorage-resurrected workspace id during the 30-day grace silently "ensures" back a deleted workspace and re-upserts the owner membership row.
- Severity: P1 (lifecycle invariant: soft-deleted workspaces should be unreachable until cancelled)
- Persona: 1, 3
- Fix: at line 73, branch on `existing.deleted_at` → return 409 `workspace_pending_deletion` with the grace_until so the client can prompt "cancel deletion first."

### Persona 2 — Returning user changing settings

**B4. `/account/notifications` redirects unauthenticated users to `/login` (404)** — `app/account/notifications/page.tsx:50` does `redirect("/login?next=/account/notifications")`. `/login` does not exist (live probe → 404, also confirmed via `find app -type d -name login`). Same bug at `app/account/notifications/_actions.ts:25` on the server-action path.
- Severity: P0 (every unauthenticated visit + every signed-out form post lands on a 404)
- Persona: 2
- Fix: `s|/login|/signin|g` in both files.

**B5. `/account/email` redirects unauthenticated users to `/login` (404)** — same bug at `app/account/email/page.tsx:54` and again in the route handler at `app/api/account/email-prefs/route.ts:53`.
- Severity: P0
- Persona: 2
- Fix: same as B4 — change `/login` → `/signin`.

**B6. `/api/account/email-prefs` redirect from POST is HTTP 307 by default, preserving method** — `NextResponse.redirect(new URL("/account/email?toast=…", req.url))` at lines 87-103 returns 307. Browsers re-POST to `/account/email`, which serves a server component and yields a 405 (or, depending on Vercel, a re-render). The redirect needs to be a 303 ("See Other") so the browser switches to GET.
- Severity: P1 (silent breakage of the email-prefs save UX; in practice users see a flash of error)
- Persona: 2
- Fix: pass `{ status: 303 }` as the second arg to every `NextResponse.redirect` in the route handler (lines 53, 87, 98).

**B7. Account-deletion confirmation email is wired in the template but never sent** — `lib/email/templates/account-deletion-confirm.ts` defines both "scheduled" and "final" emails, but the only consumer of `account.deletion_queued` is a no-op handler (`lib/outbox/index.ts:278-282`: "no-op handler. Producer side already did the work"). User clicks Delete account → no email reaches them. The 30-day grace warning the docstring promises ("Always-on. Security/account-state changes ignore the email channel toggles") doesn't happen.
- Severity: P1 (compliance / user trust — also confusing because `requestAccountDeletion` returns success and the UI claims a 30-day grace)
- Persona: 3 (mostly), 2 (returning user wants confirmation)
- Fix: change `"account.deletion_queued"` handler to call `accountDeletionConfirmEmail({kind:"scheduled", purgeAt: payload.grace_until, …})` and enqueue. Also add a `account.deletion_finalized` event in the cron purge for the "final" kind.

**B8. `requireRecentAuth` redirect inside a server action lands the user on `/auth/reauth?next=/account` but the action that triggered it doesn't preserve the form data** — at `app/account/_actions.ts:58,99` and `app/workspace/settings/_actions.ts:55`. After reauth, the user is bounced back to `/account` (not the action that needed reauth) and has to fill out the deletion / email change form again. Annoying for the workspace-deletion case where they typed the workspace name to confirm.
- Severity: P2 (UX, not security)
- Persona: 2, 3
- Fix: encode `formData` into `next` as a signed token, then replay on the reauth success path — or accept the friction and add a banner explaining what to do.

**B9. `confirmTotpEnrollment` returns recovery codes inline but `useActionState` keeps them in browser memory for the lifetime of the page** — `app/account/security/_actions.ts:117-121` returns `recoveryCodes` in the action result, which `useActionState` retains. If the user navigates away and back via `router.back()`, the codes can be retrieved from React state cache. Codes are also POST'd into the same action object Sentry / next-action observability would capture.
- Severity: P2 (security defense-in-depth)
- Persona: 2
- Fix: clear the action state after the user confirms they saved the codes (already gated client-side per `_components/EnrollFactor.tsx` review, but the action result lingers); also explicitly mark the response no-cache.

### Persona 3 — Departing user

**B10. Workspace deletion has NO outbox event** — `app/workspace/settings/_actions.ts:57-65` calls the RPC and revalidates but never `emit()`s. Compare with account deletion at `app/account/_actions.ts:141-149`. Downstream listeners (billing, analytics, billing-cancellation cron) have no signal.
- Severity: P1 (parity with account deletion + lifecycle observability + future billing tear-down)
- Persona: 3
- Fix: add `OutboxEventTypes.WorkspaceDeletionQueued` in `lib/outbox/index.ts:408`, register a no-op handler, emit in the server action with `dedupeKey: workspace-deletion:${id}:${minuteBucket}`.

**B11. workspace cascade — multiple high-value tables have `workspace_id uuid` WITHOUT `references public.workspaces(id) on delete cascade`** — the cron purge call to `hard_delete_expired_workspaces` will leave orphan rows. Tables affected (none have explicit cascade in any migration, verified via `grep -h "references public.workspaces" supabase/migrations/*.sql`):
  - `comments` (`20260514c_collab_primitives.sql:32`) — workspace_id not null
  - `notifications` (`20260514c:83`) — workspace_id nullable, fanout rows survive
  - `activities` (`20260514c:130`) — orphaned audit-trail
  - `tags` (`20260514c:162`) — labels survive
  - `time_off_balances` (`20260514e:153`), `time_off_requests` (`20260514e:182`) — PII survives
  - `search_documents` (`20260514f:36`) — orphan index rows + leak workspace contents in search
  - `ai_calls` (`20260518c:15`), `ai_batch_jobs` (`20260518c:72`) — orphan rows
  - `embeddings` (`20260518b:16`) — orphan vectors
  - `recent_items` (`20260518a:14`) — orphan navigation history
- Severity: **P0** (workspace deletion does not actually delete the data — direct GDPR / "right to be forgotten" violation if a user requests deletion of an entire workspace they own)
- Persona: 3
- Fix: a single migration `20260520_workspace_fk_cascade.sql` that runs `alter table … add constraint … foreign key (workspace_id) references public.workspaces(id) on delete cascade` for each. The values are not unique (they're already named workspace_id), so be defensive about pre-existing orphans first.

**B12. `event_outbox` carries deletion events but has no workspace FK** — by design (it's a global queue), but it means a hard-deleted workspace leaves stale `account.deletion_queued` / future `workspace.deletion_queued` rows referring to dead IDs. The handler is a no-op so nothing breaks, but cleanup is loose. Not a bug strictly — flagging because the QA scope mentions `event_outbox` cascade.
- Severity: P3
- Persona: 3
- Fix: optional `workspace_id_hint` payload field consumed by a sweep cron.

**B13. Sign-in attempt during 30-day grace silently un-soft-deletes nothing but reactivates Supabase auth** — Supabase auth doesn't know about `account_deletion_requests`. A user who scheduled deletion can sign back in (magic link or Google) and get a fresh session before grace_until. Currently the `/account` page shows the cancel-deletion banner — good — but no other surface warns them. `auth/callback` doesn't auto-cancel deletion or even surface a toast. A user who forgets they requested deletion can use the product normally for 30 days, then be silently purged.
- Severity: P1 (data-loss footgun)
- Persona: 3
- Fix: in `app/auth/callback/route.ts` after `clearLockout`, check `account_deletion_requests.cancelled_at IS NULL AND grace_until > now()` and either (a) auto-cancel and surface "deletion cancelled because you signed in" toast, or (b) redirect to `/account?warn=pending_deletion`. Option (a) is friendlier; (b) is safer.

**B14. Cron-route auth fallback accepts any caller with a `vercel-cron` user-agent or `x-vercel-cron` header** — `app/api/cron/account-purge/route.ts:43-53` and `app/api/cron/workspace-purge/route.ts:40-50` short-circuit to authorized on UA substring match. UA / arbitrary headers are trivially forgeable from any HTTP client. The `CRON_SECRET` Bearer check is the real defense, but the OR fallback means if `CRON_SECRET` isn't set in the env, anyone can purge accounts and workspaces.
- Severity: P1 (privilege escalation if env is misconfigured)
- Persona: 3 (downstream blast)
- Fix: drop the UA / `x-vercel-cron` fallback entirely. Vercel signs cron invocations with an Authorization header anyway. If `CRON_SECRET` is absent, fail closed with 503 "cron not configured".

**B15. `request_workspace_deletion` doesn't surface what gets deleted** — there's no preview / count UI. A user with 200 CRM contacts, 50 tasks, 30 files in a workspace clicks delete and types the name, no "this will delete 200 contacts / 50 tasks / 30 files" warning. Stripe-style confirmation is missing.
- Severity: P2
- Persona: 3
- Fix: add a server function `workspace_deletion_summary(p_workspace_id uuid)` returning counts; render under the type-to-confirm.

**B16. There is no `/workspace/settings/members` page** — scope item asked about it. The desktop OS shell handles member management. Acceptable, but `/workspace/settings` doesn't link to it, so an owner who hits the page from email isn't directed anywhere useful for invite management.
- Severity: P3 (discoverability)
- Persona: 2, 3
- Fix: add a "Members are managed inside the workspace — open Settings → Workspaces" hint with a deep link to the in-app sheet.

## Cascade audit (workspace deletion)

| Table | FK column | ON DELETE | Verdict |
|---|---|---|---|
| `workspaces` | `user_id → auth.users` | CASCADE | OK |
| `workspace_members` | `workspace_id → workspaces` | CASCADE | OK |
| `workspace_members` | `user_id → auth.users` | CASCADE | OK |
| `workspace_invites` | `workspace_id` | CASCADE | OK |
| `workspace_deletion_requests` | `workspace_id` | CASCADE | OK |
| `crm_contacts` | `workspace_id` | CASCADE | OK |
| `projects` | `workspace_id` | CASCADE | OK |
| `tasks` | `workspace_id` | CASCADE | OK |
| `employees` | `workspace_id` | CASCADE | OK |
| `agent_conversation_messages` | `workspace_id` | CASCADE | OK |
| `comments` | `workspace_id` | **NONE** | **BROKEN** — see B11 |
| `notifications` | `workspace_id` | **NONE** | **BROKEN** |
| `activities` | `workspace_id` | **NONE** | **BROKEN** |
| `tags` | `workspace_id` | **NONE** | **BROKEN** |
| `time_off_balances` | `workspace_id` | **NONE** | **BROKEN** |
| `time_off_requests` | `workspace_id` | **NONE** | **BROKEN** |
| `time_off_policies` | `workspace_id` | CASCADE | OK |
| `onboarding_templates` | `workspace_id` | CASCADE | OK |
| `search_documents` | `workspace_id` | **NONE** | **BROKEN** |
| `ai_calls` | `workspace_id` | **NONE** | **BROKEN** |
| `ai_batch_jobs` | `workspace_id` | **NONE** | **BROKEN** |
| `embeddings` | `workspace_id` | **NONE** | **BROKEN** |
| `recent_items` | `workspace_id` | **NONE** | **BROKEN** |
| `favorites` | `workspace_id` | (nullable, no FK) | OK (per-user; cascades on user delete) |
| `saved_views` | `workspace_id` | (nullable, no FK) | concerning but low-impact |
| `event_outbox` | n/a (jsonb payload) | n/a | OK by design |

Overall verdict: **BROKEN** for workspace deletion. Account deletion (`auth.users` cascade chain) is fine because every workspace-scoped table cascades from `workspaces` → which cascades from `auth.users.id` via `workspaces.user_id`. But the chain breaks at workspace deletion because the `workspace_id` columns on 11 tables don't enforce cascade. The cron `hard_delete_expired_workspaces` will leave a long tail of orphan rows referring to a workspace UUID that no longer exists.

## Suggested checklist additions

1. **Wire welcome email** — emit `account.signup_completed` on first callback, handler dispatches `welcomeEmail()`.
2. **Wire account-deletion-confirm emails** — replace the no-op `account.deletion_queued` handler with `accountDeletionConfirmEmail({kind:"scheduled"})`; add `account.deletion_finalized` from the purge cron for the "final" kind.
3. **Add `WorkspaceDeletionQueued` outbox event + emit from `requestWorkspaceDeletion`** — parity with account deletion.
4. **Migration `20260520_workspace_fk_cascade.sql`** — add `on delete cascade` to 11 missing `workspace_id` FKs (see B11 table).
5. **Replace 4 `/login` redirects with `/signin`** — `notifications/page.tsx:50`, `notifications/_actions.ts:25`, `email/page.tsx:54`, `email-prefs/route.ts:53`.
6. **Change `NextResponse.redirect` status to 303 in `/api/account/email-prefs`** — three call sites.
7. **Drop UA / `x-vercel-cron` header fallback in cron auth** — require `CRON_SECRET`. Two files (`account-purge`, `workspace-purge`); audit other cron routes likewise.
8. **Auto-cancel pending account deletion on successful sign-in** — patch `/auth/callback` to detect + cancel (or warn).
9. **Reject `/api/workspaces/ensure` for soft-deleted workspaces** — return 409 `workspace_pending_deletion`.
10. **Per-user rate limit on `request_account_deletion` RPC** — 1/min throttle inside SECURITY DEFINER body.
11. **Move `router.push` out of render in `FactorList`** — into `useEffect` keyed on `state.reauth`.
12. **De-duplicate `welcomeEmail` definitions** — remove the legacy copy in `lib/email.ts`, keep the templates dir version.
13. **Workspace deletion preview** — show counts of contacts/tasks/files/employees before confirm.
14. **Re-auth flow form-data preservation** — encode form fields into `next` so the user doesn't re-type on reauth bounce.
15. **`/onboarding` route** — either ship the first-run tour page or remove dead references from comments.
