# QA-E: Admin chrome — findings

QA agent E. Read-only audit of `/admin/*` from three personas (first-time admin,
operating admin, power admin). No code mutated outside this report. Counts:

- **First-time admin walk:** every section tab loads; every sidebar item
  resolves to a real `page.tsx`; nav reachability is clean. Two pages live
  outside the chrome (see ⚠️).
- **Operating admin walk:** server actions are properly gated. The audit log
  records every bulk run, feature flip, IP rule, refund, etc. Banners,
  flags, IP rules, refunds end-to-end paths verified by code-read.
- **Power admin walk:** bulk-action bar present on 5 list pages; export CSVs
  flow through `/api/admin/bulk/run` and per-page export routes. **One CSV
  injection vuln** below — see ❌-1.

Counts: ✅ 9, ⚠️ 11, ❌ 4 (capped at 30 total per brief).

## ✅ Working

1. **Layout gate is the single source of truth.** `app/admin/layout.tsx:19`
   calls `checkIsAdmin()` and renders a 403 component for non-admins. Every
   page under `app/admin/*` inherits the gate — confirmed no page renders
   sensitive data outside the layout's `<main>` slot.
2. **Server-only boundary is intact.** No `"use client"` file imports
   `lib/supabase/admin.ts` or `createAdminClient` (grep across `app/admin/*`).
   `_lib.ts` has `import "server-only"` at the top.
3. **Server actions self-gate.** Every `_actions.ts` under `app/admin/*` (59
   files) calls `assertAdmin()` before doing any service-role write. Sampled
   `ip-rules/_actions.ts`, `features/_actions.ts`, `banners/_actions.ts`,
   `refunds/_actions.ts`, `roles/_actions.ts`, `bulk/run/route.ts` — all gated.
4. **Audit log captures admin actions.** `recordAdminAction()` is invoked from
   every mutating server action and from the bulk dispatch
   (`app/api/admin/bulk/run/route.ts:145`).
5. **API routes use `withApiHandler({ requireAdmin: true })`.** Confirmed
   `app/api/admin/storage/route.ts`, `alerts/route.ts`, `errors/route.ts`,
   `workflows/generate/route.ts`. The only ungated `/api/admin/*` route is
   `help/vote` and that's documented public-by-design.
6. **Dashboard shows real numbers, not TODO.** `app/admin/page.tsx:44` uses
   `admin_dashboard_stats` RPC + recent contact_messages + profiles + auth
   users — all live data.
7. **`/admin/status` overview renders four views** (overview/list/flow/kanban)
   via `_components/Shell` and `_checklist.ts`. Path-to-launch tally, phase
   strip, "do these next" list, category snapshot all wired.
8. **All insights pages handle empty state.** `/insights/latency`,
   `/insights/slow-queries`, `/insights/ai-costs`, `/insights/health` each have
   an explicit "No X yet" block instead of crashing.
9. **Every NAV href resolves to an actual `page.tsx`** (75 entries checked
   — see reachability table below). Every internal `<Link href="/admin/..">`
   from outside the chrome (135 unique hrefs) resolves to a real route.

## ⚠️ Minor

1. **Header tab label says "sections" when it means "items".**
   `app/admin/_components/Header.tsx:106` — `${section} · ${count} sections`
   reads as "AI · 10 sections" but is actually counting nav items inside a
   section. Should be `items` or `pages`. First-time admin will be confused.
2. **`/admin/tasks` is unreachable from the chrome.** Page exists at
   `app/admin/tasks/page.tsx` but is missing from `_nav.ts`. Power admin needs
   to know the URL. Add to People or Data & Ops section.
3. **`/admin/bulk` is unreachable from the chrome.** Page exists at
   `app/admin/bulk/page.tsx` (history of bulk operations) and is referenced by
   one `<Link>` from the bulk-action bar success state, but no nav entry. Add
   to Data & Ops.
4. **`/admin/database/sql` is unreachable from the chrome.** Exists at
   `app/admin/database/sql/page.tsx`. Only reachable from `/admin/database`
   index. Surface it as a sub-link in the sidebar or in `_nav.ts`.
5. **`/admin/eval/runs/[id]` has no parent listing.** Run detail page exists
   but `/admin/eval` only lists suites — there's no list-of-recent-runs route.
   Power admin needs to remember a run id.
6. **`/admin/help/categories` not in nav.** Categories sub-page exists at
   `app/admin/help/categories/page.tsx`. Only reachable via in-page link inside
   `/admin/help`.
7. **`/admin/moderation/queue` not in nav.** Sub-page exists; only reachable
   via in-page link inside `/admin/moderation`.
8. **`/admin/models/runtime` not in nav.** Exists at
   `app/admin/models/runtime/page.tsx`; only reachable from `/admin/models`.
9. **`/admin/support/impersonations` not in nav.** Exists; only reachable from
   `/admin/support`.
10. **`/admin/messages` doesn't paginate.** `app/admin/messages/page.tsx:23`
    just sets `.limit(200)`. Past message 200 disappears from the admin UI with
    no way to page. Add `?page=` querystring + `count: "exact"`.
11. **Dashboard "Files" stat card has no link target.** `app/admin/page.tsx:109`
    — `<StatCard label="Files" .../>` has no `href`. Every other card on the
    dashboard navigates somewhere. Should link to `/admin/storage`.

## ❌ Bugs

1. **CSV formula-injection vulnerability in bulk export.**
   `app/api/admin/bulk/run/route.ts:1311` defines a LOCAL `csvCell()` that only
   escapes `,`, `"`, `\r`, `\n` and does NOT defang formula-injection chars
   (`=`, `@`, `+`, `-`, leading tab). Every bulk CSV export — users (line 354),
   workspaces (580), agents (762), skills (908), apps (1052) — emits raw
   `=cmd|... !A1` strings that Excel/Sheets will execute when an admin opens
   the file. The codebase has a safe `escapeCsvCell` in
   `lib/escape-helpers.ts:55` that does this correctly and is already used by
   `app/admin/database/_helpers.ts` and `app/admin/people/export/route.ts`.
   **Fix:** delete the local `csvCell` at line 1311 and import `escapeCsvCell`
   from `@/lib/escape-helpers`. Severity: **P0** — exposes the maintainer and other
   admins to RCE-equivalent via a malicious user-controlled field (workspace
   name, full_name, etc.). Persona: power admin who clicks Export.

2. **CSV formula-injection vulnerability in waitlist export.**
   `app/admin/waitlist/export/route.ts:47` defines its own inline `escape()`
   that only handles `",\n` — same problem as #1 but for the waitlist CSV.
   Email-shaped fields are at low risk but `user_agent` and `source` are
   attacker-controlled. **Fix:** import `escapeCsvCell` and use it instead.
   Severity: **P1**.

3. **`/admin/jobs` does not surface stuck-job state.** Brief says W1 wired
   stuck-job detection. `app/admin/insights/health/page.tsx:142` reads
   `workflow_runs` and `ai_batches` where `status='stuck'` and shows them on
   the health page — but `app/admin/jobs/page.tsx` (the one called "Jobs &
   cron" in the sidebar) shows only `cron_jobs` + `cron_runs` and has zero
   awareness of stuck workflow/batch rows. Operating admin who hears "a job is
   stuck" will look here first and see nothing. **Fix:** add a "Stuck jobs"
   section at the top of `/admin/jobs` that mirrors the health page query, or
   link prominently to `/admin/insights/health` from `/admin/jobs`. Severity:
   **P1**.

4. **Local `csvCell` in `bulk/run/route.ts` shadows the shared helper without
   matching its quoting rules.** Same root cause as #1 but worth flagging
   separately for the reviewer: `app/admin/database/_helpers.ts:282` has a
   local `csvCell` that's a *thin wrapper* around `escapeCsvCell` (documented
   delegation, line 285). The bulk route's local copy is a *re-implementation*
   that drifted. Replace with the import, or add a lint rule that bans local
   `csvCell` definitions in `app/api/admin/*`. Severity: **P2**.

## Nav reachability audit (every _nav.ts entry → route exists?)

All 75 nav entries map to a real `app/admin/<path>/page.tsx`. No 404s.
Verified by enumerating `NAV` from `_nav.ts` and `test -f app/admin/<path>/page.tsx`:

| Section | Entries | All resolve? |
|--------|--------:|:-----------:|
| Dashboard (pinned) | 4 | ✅ |
| AI | 10 | ✅ |
| Apps | 5 | ✅ |
| People | 12 | ✅ |
| Data & Ops | 19 | ✅ |
| Security | 7 | ✅ |
| Communication | 6 | ✅ |
| Experience | 7 | ✅ |
| Money | 2 | ✅ |
| Content | 3 | ✅ |
| **Total** | **75** | **✅** |

Pages that exist on disk but are NOT in `_nav.ts` (the ⚠️ items above):
`/admin/tasks`, `/admin/bulk`, `/admin/database/sql`, `/admin/eval/runs/[id]`,
`/admin/help/categories`, `/admin/moderation/queue`, `/admin/models/runtime`,
`/admin/support/impersonations`.

Reverse check: every `<Link href="/admin/..">` from outside `app/admin/*`
resolves to an existing route. 0 dead links.

Header tab label: `_nav.ts` declares the SECTIONS array with 9 entries (AI,
Apps, People, Data & Ops, Security, Communication, Experience, Money, Content).
The brief says "AI · 9 sections" — actually each tab footer shows the **item
count of the active section**, not the section count. So under the AI tab it
reads "AI · 10 sections" (10 items, wrongly labeled "sections"). See ⚠️-1.

## assertAdmin coverage audit (every loader gated?)

- **Pages:** all gated via the inherited layout `checkIsAdmin()` at
  `app/admin/layout.tsx:19`. No admin page bypasses the layout. ✅
- **Server actions:** all 59 `_actions.ts` files under `app/admin/*` import
  `assertAdmin` from `./_lib` and call it as the first statement of every
  exported action. Sampled 8 — all clean. ✅
- **API routes under `/api/admin/*`:** 5 routes appear to lack a direct
  `assertAdmin`/`checkIsAdmin` call. Of those, 4 are wrapped with
  `withApiHandler({ requireAdmin: true })` (`storage`, `alerts`, `errors`,
  `workflows/generate`) — equivalent gating. The 5th, `/api/admin/help/vote`,
  is intentionally anonymous (in-line comment at line 12). ✅
- **`/admin/people/export/route.ts`** and `/admin/waitlist/export/route.ts`
  both call `checkIsAdmin` at the top. ✅

No ungated admin surfaces found.

## Suggested checklist additions

(Items to add to `app/admin/status/_checklist.ts` so future agents pick them up.)

1. **bug-admin-001 — CSV formula injection in bulk exports.** Replace the local
   `csvCell` in `app/api/admin/bulk/run/route.ts:1311` with `escapeCsvCell`
   from `lib/escape-helpers.ts`. P0, effort XS. Phase `hardening`, category
   `security`.
2. **bug-admin-002 — CSV formula injection in waitlist export.** Same fix for
   `app/admin/waitlist/export/route.ts:47`. P1, effort XS.
3. **bug-admin-003 — `/admin/jobs` should surface stuck workflow/AI-batch
   rows.** Either inline the `status='stuck'` query (mirror
   `insights/health/page.tsx:138-145`) or add a prominent link to the health
   page. P1, effort S. Phase `polish`, category `ops`.
4. **gap-admin-004 — `/admin/tasks` missing from `_nav.ts`.** Add to People
   section (between Cohorts and Employees). P2, effort XS.
5. **gap-admin-005 — `/admin/bulk` missing from `_nav.ts`.** Add to Data & Ops
   (after Jobs & cron). P2, effort XS.
6. **gap-admin-006 — `/admin/database/sql` missing from `_nav.ts`.** Add as a
   second Data & Ops entry under Database. P3, effort XS.
7. **gap-admin-007 — `/admin/messages` doesn't paginate.** Add `?page=` +
   `count:"exact"`. P2, effort S.
8. **polish-admin-008 — Dashboard "Files" stat card needs `href="/admin/storage"`.**
   `app/admin/page.tsx:109`. P3, effort XS.
9. **polish-admin-009 — Header section tab label says "sections" when counting
   items.** `app/admin/_components/Header.tsx:106`. Rename to "items" or
   "pages". P3, effort XS.
10. **polish-admin-010 — Surface `/admin/help/categories`,
    `/admin/moderation/queue`, `/admin/models/runtime`,
    `/admin/support/impersonations` somewhere visible.** Either as sidebar
    sub-entries (with a small `pl-6` indent under their parent) or as in-page
    breadcrumb chips. P3, effort XS each.

— end of report —
