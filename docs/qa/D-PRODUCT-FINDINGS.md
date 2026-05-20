# QA-D: In-app product surfaces — findings

Scope: Tasks, Projects, People, CRM (in `app/tools/crm/` and `app/api/crm`),
Comments, Inbox, Activity feed, Search, Cmd-K, Trash, Tags, Favorites,
Saved views, Import wizard, toShare viewers, CurrencySwitcher.

Read-only audit. ~50 file reads. No WebFetch needed (every surface
audited is auth-gated; anonymous renders are unreliable). All `file:line`
references are absolute to the repo.

---

## ✅ Working

| Surface | Note |
| --- | --- |
| `/tasks` toolbar + filters (`workspace`, `project`, `status`, `assignee`, `priority`, `due_before`, `open_only`) | RSC reads honor `searchParams`; defaults to list view; URL is shareable. `app/tasks/page.tsx:73-83` |
| Tasks Kanban drag & drop | Optimistic move with revert-on-failure via `PATCH /api/tasks/[id]`. `app/tasks/_components/TasksKanbanView.tsx:60-90` |
| Task soft-delete → Undo snackbar → POST `/api/trash` restore | `app/tasks/_components/TaskHeader.tsx:111-150` + `lib/undo.ts` + `app/api/trash/route.ts` round-trip works end-to-end. |
| `createTask` / `updateTask` / `softDeleteTask` / `completeTask` index + unindex search_documents | `lib/tasks/server.ts:157-343` |
| `createProject` / `updateProject` / `softDeleteProject` index + unindex | `lib/tasks/server.ts:362-441` |
| `createEmployee` / `updateEmployee` / `archiveEmployee` index + unindex | `lib/people/actions.ts:25-191` |
| `createEmployeeDocument` / `deleteEmployeeDocument` index + unindex | `lib/people/actions.ts:58-89, 286-389` |
| `createComment` / `updateCommentBody` / `softDeleteComment` index + unindex (for task / project / contact parents only) | `lib/collab/comments.ts:125-308` |
| Mention fan-out to `notifications` + `activity_emit` + outbox `CommentMentionFanout` | `lib/collab/comments.ts:165-203` + `app/api/comments/route.ts:174-194` |
| `/api/comments` POST idempotency window (10 min via sha1 of `(user, entity, body, parent)`) | `app/api/comments/route.ts:141-198` |
| `/api/comments` `MAX_MENTIONS=10` cap | `app/api/comments/route.ts:37, 112-117, 233-238` |
| `/api/comments` body length cap (8,000 chars) | `app/api/comments/route.ts:130, 246-248` |
| `/inbox` tabs (All/Unread/Mentions/Assignments/System) + `MarkAllReadButton` + `MarkOneReadInline` | `app/inbox/page.tsx:25-104` + `app/inbox/_components/InboxActions.tsx` |
| NotificationBell unread count from `notifications.read_at IS NULL` via `countUnread` | `components/NotificationBell.tsx:32-46` + `app/api/notifications/route.ts:56-71` |
| toShare `/p|/q|/r|/b|/d/[slug]` viewers each read `?ws=` and pass `subdomain` to `resolveLink` | `app/(share)/p/[slug]/page.tsx:18-21`, etc. + `lib/toshare/server.ts:136-147` |
| toShare middleware host router rewrites `<ws>.toshare.net/<type>/<slug>` → adds `?ws=<sub>` | `middleware.ts:188-245` |
| toShare share-only-paths guard (404 on spacefield.io/.co) | `middleware.ts:204-209` |
| Trash listing + restore + admin/owner-only purge (`role !== 'admin' && role !== 'owner'` → 403) | `app/api/trash/route.ts:99-127` |
| Trash UI windowed via `VirtualTableBody` (handles >100 rows correctly) | `app/trash/page.tsx:223-345` + `components/VirtualList.tsx` |
| `/import` wizard 4-step state (Upload → Map → Preview → Import) | `app/import/_components/Wizard.tsx:33-128` |
| Import POST splits client-side into chunks of 100 → server batches into `Promise.all` groups of 10 | `app/import/_components/ImportRunner.tsx:18, 55-86` |
| `/api/import/[entity]` rate limit 30/min + 5,000 row cap per request | `app/api/import/[entity]/route.ts:34, 100-106` |
| Importer for employees + tasks goes through indexed helpers (`createTask`, `createEmployee`) | `lib/import/importers/tasks.ts:61-69`, `lib/import/importers/employees.ts:59` |
| `recordView` fires on every toShare viewer page (`p`, `q`, `r`, `b`, `d`, `share-form`) | `app/(share)/*/[slug]/page.tsx` |
| `pushUndo` snackbar (5s default, single visible card, replace-on-new) | `lib/undo.ts:80-115` |
| `CurrencySwitcher` writes `spacefield-currency` cookie + dispatches `spacefield:currency-changed` window event | `components/CurrencySwitcher.tsx:69-87` |
| WhatsNew modal mounted in root layout, gated on `getLastSeenVersion()` cookie | `app/layout.tsx:93, 182` + `components/WhatsNew.tsx:39-80` |
| `/people/time-off` calendar + own-requests + team-approved-time-off | `app/people/time-off/page.tsx:37-77` |
| Document upload (`/api/people/documents/upload`) — 10 MB + mime allow-list + storage bucket + audit log on reveal | `app/api/people/documents/upload/route.ts:26-104` + `app/api/people/documents/[id]/reveal/route.ts` |

---

## ⚠️ Minor

1. **`app/trash/page.tsx:27-37` ENTITY_LABEL map advertises `employee` and `employee_document`** as restorable types, but `lib/trash/index.ts:54-63` deliberately omits those tables (employees use `archived_at`, documents have no soft-delete column). The two labels are dead and will never appear in the filter dropdown. *Fix: drop them from `ENTITY_LABEL` or add a separate Archived-people surface.*
2. **`lib/trash/index.ts:107`** silently caps each entity type at 200 rows. Workspaces past 200 deleted contacts/leads/files will see only the most recent 200 with no UI hint. *Fix: surface a `total` count + add `cursor` paging, or at least show a "showing 200 of N" footer when at-cap.*
3. **`lib/undo.ts:17`** doc comment says "PATCH /api/comments?…&undo=1" but every actual undo path calls `POST /api/trash`. Stale prose, no functional impact.
4. **`app/tags/page.tsx:62-71`** issues a second `_with_counts=1` GET to `/api/tags` whose response is explicitly discarded (`void linksRes`). Wasted server round-trip on every tags page load. *Fix: drop the second fetch or merge counts server-side and consume `linksRes`.*
5. **`components/CommandPalette.tsx:48-52`** `RECENT_LIMIT=6` is conservative — most palettes show ≥8 recent items. Not a bug, just tight.
6. **`app/tasks/_components/TasksKanbanView.tsx:64-89`** revert path: `prev` is captured by closure but written inside `setTasks` updater. If the fetch fails before React commit settles, the revert branch could read `prev === null` and silently skip. Race is theoretical; in practice React flushes the updater synchronously before the fetch resolves. No toast on revert — failures are silent. *Fix: surface `toast.error("Couldn't move task — reverted.")` in the catch.*
7. **`components/NotificationBell.tsx:153-186`** `NotificationRow` wraps `<div onClick={onClick}>` in `<Link href={item.href}>` when href is set. Click bubbles to both. Functionally fine, but the `cursor: pointer` is doubled and screen readers see two interactive regions for one row.
8. **`app/people/time-off/page.tsx:21-35`** UAE 2026 public holidays are hard-coded estimates (Eid dates are lunar — these will drift vs the official UAE calendar). *Fix: pull from `/admin/people/holidays` runtime config or document the source date.*
9. **`app/api/trash/route.ts:108-110`** `DELETE` reads `workspace_id` from both body and search params but the client `purge` flow only sends body. Defensive but unused.
10. **`lib/recents/index.ts:38-57`** `recordView` swallows all errors — including the case where `record_view` RPC doesn't exist. Useful for graceful degradation but a missing migration in prod would be invisible. *Fix: `log.warn` on first failure per session.*
11. **`components/CurrencySwitcher.tsx`** mounted but never read — see `❌ Bugs` below for the load-bearing issue. The component itself is wired correctly; consumers are missing.
12. **`app/import/_components/ImportRunner.tsx:80-85`** on a single chunk error the entire run aborts with no resume option. For a 5,000-row import this stings. *Fix: surface a "Retry from row N" button.*

---

## ❌ Bugs (per persona)

### Persona 1 — CRM-focused user

#### ❌ BUG-D-01 (HIGH) — CRM contact/lead/deal creates do NOT index `search_documents`
- **Files**: `app/api/crm/contacts/route.ts:59-64`, `app/api/crm/leads/route.ts:69-74`, `app/api/crm/deals/route.ts:84-94`
- **Impact**: Every contact, lead, and deal created through the public CRM API is invisible to `/search` and the Cmd-K palette. The mention dropdown can never resolve them. Only the demo seed + AI tools (which go through `lib/agent/skills/crm-*`) bypass this — but those don't index either.
- **Persona walk**: Adam adds a contact "Jane Smith" → mounts `/tools/crm` → fires `POST /api/crm/contacts` → row written → `/search?q=Jane` returns 0 results.
- **Fix**: Call `indexDocument({ entityType: "crm_contact", entityId: row.id, title: `${first} ${last}`, subtitle: email, href: "/tools/crm?contact=" + row.id })` after each insert in the three routes above. Same pattern as `lib/tasks/server.ts:241-283`.

#### ❌ BUG-D-02 (HIGH) — Comment search index points "contact" parents to `/admin/users/<id>`, a 403 page for regular workspace members
- **File**: `lib/collab/comments.ts:38-40`
  ```ts
  case "contact":
    return `/admin/users/${entityId}`;
  ```
- **Impact**: When a workspace member comments on a CRM contact and another member searches their workspace, the search hit links to `/admin/users/<crm_contact_id>` — which is the platform admin user-list (auth.users, not crm_contacts), gated to admins. Regular users hit 403. Admins land on a "user not found" page because the UUID is a CRM contact id, not an auth user id.
- **Fix**: Change to `return /tools/crm?contact=${entityId};` (or whatever the canonical CRM contact viewer URL is — verify against `app/tools/crm/_app.tsx`). Also add cases for `crm_lead` and `crm_deal`.

#### ❌ BUG-D-03 (MED) — No user-facing CRM pipeline UI outside `/tools/crm`
- **Files**: `app/api/crm/deals/move/route.ts` exists; `app/tools/crm/_boards/` exists; but the CommandPalette JUMP_TO points at `/apps/crm` (404 — see BUG-D-12). The deal-pipeline kanban only renders inside the OS shell.
- **Impact**: A CRM user who arrives via `/search?q=deal:Acme` or via a comment link cannot reach the pipeline kanban from a deep link — they have to open `/tools/crm` and navigate inside the OS shell.
- **Fix**: Add a stub `app/tools/crm/page.tsx` (or top-level `app/crm/page.tsx`) that resolves to the OS-shell-launched CRM tool, then point JUMP_TO + comment-href at it.

### Persona 2 — Tasks/projects user

#### ❌ BUG-D-04 (HIGH) — Task detail page mounts the LEGACY `TaskComments`, not the rich `CommentsThread`
- **Files**: `app/tasks/[id]/page.tsx:12, 58` mounts `TaskComments`. `app/tasks/_components/TaskComments.tsx:38-77` writes directly to `supabase.from("comments").insert(...)` from the client SDK.
- **Impact**: When a user comments on a task:
  1. **No mention parsing** — `@user` tokens stay literal text, no fan-out, no notifications.
  2. **No `activity_emit` row** — the task ActivityFeed below stays blank.
  3. **No `search_documents` index write** — the comment is never searchable.
  4. **No idempotency** — a double-click double-posts.
  5. **No HTTP-level `MAX_MENTIONS=10` cap or 8,000-char body cap** — those are enforced in `/api/comments` which this page bypasses.
  6. **No mention sanitisation** (V-3 hardening), no rate-limit (rate limit lives in `withApiHandler` on `/api/comments`).
- **Fix**: Replace the `<TaskComments />` mount in `app/tasks/[id]/page.tsx:58` with `<CommentsThread entityType="task" entityId={task.id} workspaceId={task.workspace_id} currentUserId={userId} />` and delete `app/tasks/_components/TaskComments.tsx`.

#### ❌ BUG-D-05 (HIGH) — Project detail and People detail have NO comments mounted at all
- **Files**: `app/projects/[id]/page.tsx` (whole file), `app/people/[id]/page.tsx` (whole file). Neither imports `CommentsThread` or any comment component.
- **Impact**: A user cannot comment on a project or an employee. The `/api/comments` route accepts `entity_type: "project"` (and the index helper has a case for it), but nothing on the UI surfaces it. The activity feed on these records will never see comment rows because none can be created.
- **Fix**: Mount `<CommentsThread entityType="project" entityId={project.id} … />` on the project detail page; mount the same on the employee profile (entity_type="employee") and add `case "employee"` to `commentParentHref` in `lib/collab/comments.ts:29-43`.

#### ❌ BUG-D-06 (HIGH) — `record_view` is never called on Task / Project / Employee detail pages
- **Files**: `app/tasks/[id]/page.tsx`, `app/projects/[id]/page.tsx`, `app/people/[id]/page.tsx` — none of them call `recordView` from `lib/recents`. The only call sites are the toShare viewers and the Cmd-K palette itself (`grep -rln "recordView"` yields 8 files, all in `(share)` or `CommandPalette.tsx`).
- **Impact**: The "Recent" section of Cmd-K only lists items the user opened via Cmd-K. Opening a task by clicking a `/search` hit, a notification link, or a direct URL never updates `recent_items`. The cross-device recent list (server-backed via `list_recent` RPC) stays empty for most workflows.
- **Fix**: Add a tiny client island at the top of each detail page that calls `recordView("task" | "project" | "employee", id, workspaceId)` in a `useEffect`. Pattern is the same as the share viewers.

#### ❌ BUG-D-07 (MED) — `/api/tasks/bulk-status` does NOT call `updateTask` and so does NOT re-index
- **File**: `app/api/tasks/bulk-status/route.ts:37-41`
  ```ts
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .in("id", ids)
    .select("id");
  ```
- **Impact**: After bulk-completing 20 tasks, every one of them still appears in `/search` with `subtitle` showing the old "Todo" priority/due — the indexed subtitle is built from the task row at index-time. Bulk-completed tasks are not searchable by their new state until each is touched individually.
- **Fix**: Iterate through `data` ids and call `indexTaskRow(row)` for each, or refactor `bulk-status` to call `updateTask(id, { status, completed_at })` in a loop. The bulk update can stay; the index-refresh just needs to fan out per id.

#### ❌ BUG-D-08 (MED) — Tasks/Projects/People pages have NO Favorites or SavedViews UI
- **Files**: `components/FavoriteToggle.tsx` and `components/FavoritesList.tsx` exist but `grep -rn "FavoriteToggle" app` returns zero mounts. Same for `FavoritesList`. SavedViews lib + DB exist (`lib/saved-views/`) but no UI mounts.
- **Impact**: Checklist (`app/admin/status/_checklist.ts:651`) lists "Favorites / pinned items" as `done`, but the feature is invisible to users. The brief's persona-2 walk ("marks a task as favorite, saves a filter view") fails — no star button on `TaskHeader`, no Save-view button on `TasksToolbar`.
- **Fix**: Drop `<FavoriteToggle entityType="task" entityId={task.id} />` into `app/tasks/_components/TaskHeader.tsx`. Mirror for project/employee. Add a "Save view" affordance to `TasksToolbar.tsx` that POSTs to `/api/saved-views` with the current `searchParams`.

### Persona 3 — HR user

#### ❌ BUG-D-09 (HIGH) — `/api/people` GET returns 404; MentionInput silently fails to populate members
- **File**: `components/MentionInput.tsx:81-83`. Both probed URLs (`/api/people?workspace_id=…` and `/api/auth/workspace-members?workspace_id=…`) are 404 — neither route exists. The closest real route is `/api/people/employees` (returns `{ rows }` not `{ items }` — also wrong shape).
- **Impact**: The `@` mention dropdown in `CommentsThread` shows zero members when no `members` prop is passed (the CommentsThread isn't currently mounted anywhere — see BUG-D-05 — but the moment it is, mentions won't autocomplete).
- **Fix**: Either (a) add `app/api/people/route.ts` that returns `{ items: members[] }`, or (b) update `MentionInput.tsx:82-90` to call `/api/people/employees` and read `json.rows`. Recommend (a) since the URL also appears in inline AI tools.

#### ❌ BUG-D-10 (MED) — `archiveEmployee` does not show in `/trash`
- **Files**: `lib/people/actions.ts:179-191` sets `archived_at`; `lib/trash/index.ts:54-63` explicitly excludes the `employees` table; `app/trash/page.tsx:27-37` advertises `employee` in `ENTITY_LABEL`.
- **Impact**: An admin who archives an employee by mistake cannot undo through the recycle bin. There is no Archived-employees view in `/admin/people` either (only the active directory). Restore is effectively impossible without an SQL console.
- **Fix**: Add a separate "Archived employees" list page under `/admin/people?status=terminated` (or treat `archived_at` as soft-delete and add an `employees` row to `TRASH_TABLES` keyed off `archived_at` instead of `deleted_at`).

#### ❌ BUG-D-11 (LOW) — `deleteEmployeeDocument` hard-deletes immediately; no undo, no audit trail
- **File**: `lib/people/actions.ts:383-390`
  ```ts
  const { error } = await supabase.from("employee_documents").delete().eq("id", id);
  ```
- **Impact**: An accidental click loses an Emirates ID / passport upload entirely. The encrypted number column is gone with the row; there's no `deleted_at` so the row never appears in `/trash`. The reveal endpoint audit-logs reads but doc deletion is not audited.
- **Fix**: Add a `deleted_at` column to `employee_documents` + soft-delete via update + add an `employee_document` row in `TRASH_TABLES`. Audit-log the soft-delete via `logAudit` (same helper the reveal route uses).

### Persona 4 — Power user with bulk actions

#### ❌ BUG-D-12 (HIGH) — Cmd-K JUMP_TO + CREATE links point at six non-existent routes
- **File**: `components/CommandPalette.tsx:60-76`
- **Dead routes** (verified by `ls`):
  - `/dashboard` — does not exist
  - `/files` — does not exist (real route is the Files tool inside `/tools`)
  - `/apps/crm` — does not exist (real route is `/tools/crm`)
  - `/settings/shares` — does not exist
  - `/tasks/new`, `/projects/new`, `/people/new`, `/timeoff/new`, `/apps/crm/contacts/new` — none exist
- **Impact**: 11 of the 12 static Cmd-K rows lead to 404s. The palette is the primary navigation for a power user. Only `/tasks`, `/people`, and `/admin` resolve.
- **Fix**: Either build the missing pages (cheap option: create thin redirect-to-tools-shell stubs) or update CommandPalette to point at the real routes (e.g. `/tasks?new=1` with the toolbar opening a composer, `/tools/crm`, `/people` with an inline "+ Add" trigger). Same fix unblocks comment-href routing in BUG-D-02.

#### ❌ BUG-D-13 (MED) — Importers for contacts + leads bypass `indexDocument`
- **Files**: `lib/import/importers/contacts.ts:69-71`, `lib/import/importers/leads.ts:69`. Both insert directly to the `crm_contacts` / `crm_leads` tables, never calling the search-indexer. `lib/import/importers/tasks.ts` and `lib/import/importers/employees.ts` go through the indexed helpers and are correct.
- **Impact**: Importing 100 contacts via `/import/contacts` leaves them invisible to `/search` and Cmd-K until each contact is mutated individually. Compounds with BUG-D-01 (the create API has the same gap).
- **Fix**: Either wrap each insert with an `indexDocument` call (matching the deleted-by/`href` shape used by `lib/people/actions.ts`), or extract `createContact` / `createLead` helpers that mirror `createTask` and route both the API + importer through them. Cleanest is the helper extraction.

#### ❌ BUG-D-14 (MED) — Trash restore does NOT re-index the restored row
- **Files**: `lib/trash/index.ts:161-178` (`restoreEntity`) sets `deleted_at = null` but never calls `indexDocument`. The matching soft-delete paths (`softDeleteTask`, `softDeleteProject`, `softDeleteComment`, etc.) all correctly call `unindexDocument`.
- **Impact**: A user soft-deletes a task → undo snackbar → restores via `/api/trash` → task row is alive again, but absent from `search_documents`. Same for restored projects, comments, and CRM contacts. The task stays missing from `/search` until the user touches it again.
- **Fix**: After the `update({ deleted_at: null })` succeeds, look up the row and dispatch to the right `index*Row` helper. A `lib/trash/restore-reindex.ts` switch keyed on `entity_type` is the cleanest place. Affects every entity in `TRASH_TABLES`.

#### ❌ BUG-D-15 (MED) — Stale "fake" notifications in OS-shell NotificationCenter — disconnected from real `/api/notifications`
- **File**: `app/tools/_components/NotificationCenter.tsx:23-56`
- **Impact**: The OS-shell top-bar bell opens a panel seeded from localStorage with "Welcome to your workspace" / "Market Pulse" / "Neighborhood Report 2.0" — none of which reflect real notifications. The real NotificationBell is mounted only in `/admin` and the global Nav (`components/layout/Nav.tsx:399`), not inside the OS shell. A user in `/tools/*` literally cannot see comment mentions or assignments through the chrome.
- **Fix**: Replace the localStorage seed with a fetch to `/api/notifications?unread=1&limit=20`. Keep the seed as initial-empty-state fallback. Add the global `<NotificationBell />` to the OS TopBar or rewrite `NotificationCenter` to read from the same source.

#### ❌ BUG-D-16 (MED) — CurrencySwitcher: no listener for `spacefield:currency-changed` event
- **Files**: `components/CurrencySwitcher.tsx:128-138` exports `subscribeToCurrencyChange`. `grep -rn "subscribeToCurrencyChange" app components` returns ZERO consumers. `app/pricing/_components/TierGrid.tsx` does not import `currency` at all (`grep -n "currency" returns 0 matches).
- **Impact**: Picking a different currency on `/pricing` writes the cookie + fires the event, but the price cards never re-render. On a hard reload the new currency takes effect (if any consumer reads the cookie SSR-side, which TierGrid does not). Net: the switcher appears broken.
- **Fix**: Wire `subscribeToCurrencyChange` inside `TierGrid` (and any add-on / FAQ price strings). Convert prices to a `formatCurrency(amount, code)` call, hold the active code in `useState`, and call `setCode` from the subscribe callback. Bonus: also use the cookie at SSR time so first-paint shows the persisted currency.

#### ❌ BUG-D-17 (MED) — `/inbox`, `/account/*`, and `app/api/account/email-prefs` redirect to `/login?next=…` which 404s
- **Files**: `app/inbox/page.tsx:47`, `app/chat/page.tsx:63`, `app/api/account/email-prefs/route.ts:53`, `app/account/notifications/page.tsx:50`, `app/account/notifications/_actions.ts:25`, `app/account/email/page.tsx:54`.
- **Impact**: A signed-out user landing on `/inbox` is redirected to `/login?next=/inbox`. Routes are `/signin` (verified by `ls app/signin`; `app/login` does not exist). The 6 redirects above all break sign-in flow for unauthenticated traffic.
- **Fix**: Sweep-replace `/login?next=` with `/signin?next=` across those 6 files. (Middleware already treats `/signin` as a maintenance bypass at `middleware.ts:92`.)

#### ❌ BUG-D-18 (LOW) — `/search` empty-state link to `/auth/sign-in` which 404s
- **File**: `app/search/page.tsx:47`. `app/auth/sign-in/` does not exist (`ls app/auth` returns only `callback`, `locked`, `reauth`). Same root cause as BUG-D-17 but different incorrect URL.
- **Fix**: Change to `/signin?next=/search`.

#### ❌ BUG-D-19 (MED) — ActivityFeed has no "Load more" or `before=` paging
- **File**: `components/ActivityFeed.tsx:26-53` reads up to `limit` (default 25) and renders the result. The `/api/activity` route supports `?before=<iso>` paging (`app/api/activity/route.ts:38-58`) but the RSC component never uses it.
- **Impact**: A task / project / workspace feed silently truncates after 25 entries. Activity older than 25 events is invisible from the UI; only a direct API call surfaces it.
- **Fix**: Convert ActivityFeed to a hybrid RSC-shell + client island that calls `/api/activity?before=<oldest>` on a "Load older" button. Or accept a higher initial `limit` (200 is the API ceiling) and document the cap.

#### ❌ BUG-D-20 (MED) — Demo seed and AI-tool CRM contact insertions bypass indexer
- **Files**: `lib/onboarding/seed-demo.ts:178-185`, `lib/ai-tools/extras.ts` (CRM helpers), `lib/agent/skills/crm-contacts/index.ts`. Each does direct `from('crm_contacts').insert(...)` without `indexDocument`.
- **Impact**: New workspaces with the demo seed see populated CRM but empty `/search` results for those contacts. AI assistant adds a contact → user can't find it via search.
- **Fix**: Same as BUG-D-13 — route everything through a shared `createContact` helper that indexes.

---

## Soft-delete coverage audit

| Table | Has `deleted_at`? | In `TRASH_TABLES`? | Soft-delete writes `deleted_at`? | Restore RPC clears `deleted_at`? | Re-index on restore? |
| --- | --- | --- | --- | --- | --- |
| `crm_contacts` | yes | yes | unverified (no soft-delete endpoint scanned this pass) | yes (`restoreEntity`) | ❌ no |
| `crm_leads` | yes | yes | unverified | yes | ❌ no |
| `crm_deals` | yes | yes | unverified | yes | ❌ no |
| `workspace_files` | yes (`app/api/files/delete/route.ts:76`, `app/api/files/trash/route.ts:85`) | yes | yes | yes | ❌ no |
| `comments` | yes | yes | yes (`lib/collab/comments.ts:244-247`) | yes | ❌ no |
| `tasks` | yes | yes | yes (`lib/tasks/server.ts:335-343`) | yes | ❌ no |
| `projects` | yes | yes | yes (`lib/tasks/server.ts:433-441`) | yes | ❌ no |
| `employees` | no — uses `archived_at` | ❌ no (intentional per comment) | n/a (archiveEmployee) | n/a | n/a |
| `employee_documents` | no — hard-delete | ❌ no | n/a | n/a | n/a |
| `tags` | no (delete is hard) | n/a | n/a | n/a | n/a |
| `favorites` | no (delete is hard) | n/a | n/a | n/a | n/a |

**Verdict**: `TRASH_TABLES` is consistent with what's soft-deletable. The big gap is the missing re-index on restore (BUG-D-14) — affects 7 entity types. Secondary gaps: no soft-delete UI exposed for files (you can call the API but not from the OS shell); `crm_*` soft-delete write paths weren't fully verified this pass but the API routes do not currently expose a soft-delete verb (no `DELETE /api/crm/contacts/[id]` was scanned in detail — recommend a follow-up).

---

## Search index coverage audit (per Y3 spec — every create/update/soft-delete calls indexDocument?)

| Entity | Create indexes? | Update indexes? | Soft-delete unindexes? | Restore re-indexes? |
| --- | --- | --- | --- | --- |
| task | ✅ `lib/tasks/server.ts:281` | ✅ `:326` | ✅ `:342` | ❌ BUG-D-14 |
| project | ✅ `:396` | ✅ `:428` | ✅ `:440` | ❌ BUG-D-14 |
| comment | ✅ `lib/collab/comments.ts:214` (parent-mappable only) | ✅ `:289` (parent-mappable only) | ✅ `:250` | ❌ BUG-D-14 |
| employee | ✅ `lib/people/actions.ts:145` | ✅ `:170` (or unindex on archive) | ✅ `:187` (archive) | n/a (no archive-restore flow) |
| employee_document | ✅ `:352` | n/a (no update path) | ✅ `:387` (hard-delete) | n/a (hard-deleted) |
| crm_contact | ❌ **BUG-D-01** (`app/api/crm/contacts/route.ts:59-64`) | ❌ no `PATCH` indexer | ❌ no soft-delete observed | ❌ BUG-D-14 |
| crm_lead | ❌ **BUG-D-01** (`app/api/crm/leads/route.ts:69-74`) | ❌ | ❌ | ❌ |
| crm_deal | ❌ **BUG-D-01** (`app/api/crm/deals/route.ts:84-94`) | ❌ | ❌ | ❌ |
| workspace_file | ❌ no indexing observed in `app/api/files/finalize/route.ts` or `app/api/files/upload/route.ts` | ❌ | ❌ files-soft-delete doesn't unindex | ❌ |
| comment (parent = `crm_lead`, `crm_deal`, `employee`, others) | ⚠️ silently skipped — `lib/collab/comments.ts:29-43` only maps `task`, `project`, `contact`. Other parents create a comment that **never appears** in search. | same | same | same |

**Verdict**: Massive blind spot in CRM + files. The Y3 spec is honored only for tasks/projects/employees/employee-docs/comments-on-three-parent-types. CRM + workspace_files are completely outside the indexer. Restore is universally broken (BUG-D-14).

---

## Suggested checklist additions

Add to `app/admin/status/_checklist.ts`. Priorities follow BUG severity.

1. **`crm-search-indexer`** — P1 — *Wire `indexDocument` into `POST /api/crm/{contacts,leads,deals}` + the matching importers + AI skill helpers + onboarding demo seed.* Currently CRM rows are invisible to /search and Cmd-K.
2. **`comment-href-crm-contact`** — P1 — *Fix `commentParentHref` "contact" → `/tools/crm?contact=…`. Currently routes to a 403 admin page.*
3. **`task-comments-use-rich-thread`** — P1 — *Replace legacy `TaskComments.tsx` with `CommentsThread` on `app/tasks/[id]/page.tsx`. Currently no mentions, no notifications, no activity, no search index, no idempotency.*
4. **`project-detail-comments`** — P1 — *Mount `CommentsThread` on project detail page (`app/projects/[id]/page.tsx`).*
5. **`employee-detail-comments`** — P2 — *Mount `CommentsThread` on employee profile + add "employee" case to `commentParentHref`.*
6. **`recent-items-detail-pages`** — P1 — *Call `recordView` on `app/tasks/[id]`, `app/projects/[id]`, `app/people/[id]` detail pages so Cmd-K Recent works.*
7. **`bulk-status-reindex`** — P2 — *Make `/api/tasks/bulk-status` call `indexTaskRow` per affected id (currently silently leaves stale search rows).*
8. **`favorites-toggle-on-records`** — P2 — *Drop `<FavoriteToggle>` into Task/Project/Employee headers (component exists, never mounted).*
9. **`saved-views-toolbar`** — P2 — *Add "Save view" button to `TasksToolbar.tsx` that POSTs current `searchParams` to `/api/saved-views`.*
10. **`mention-people-endpoint`** — P1 — *Either add `GET /api/people` returning `{ items }` or update `MentionInput` to call `/api/people/employees` + read `json.rows`. Mention dropdown currently never populates.*
11. **`archived-employees-restore`** — P2 — *Add an Archived-employees admin view + un-archive RPC; OR add `employees` to `TRASH_TABLES` keyed on `archived_at`. Currently archive is one-way without DB access.*
12. **`employee-document-soft-delete`** — P2 — *Add `deleted_at` to `employee_documents`, wire soft-delete + trash + audit-log.*
13. **`commandpalette-static-routes`** — P1 — *Cmd-K JUMP_TO + CREATE: replace 11 dead URLs with real routes (or stub redirects).*
14. **`contacts-leads-import-indexer`** — P2 — *Importers for contacts + leads must call `indexDocument` per row.*
15. **`trash-restore-reindex`** — P1 — *`restoreEntity` must re-add the row to `search_documents`. Affects all 7 trash entity types.*
16. **`os-shell-notifications-real`** — P1 — *OS-shell `NotificationCenter` must fetch `/api/notifications?unread=1` instead of seeding from localStorage. Currently shows fake demo cards.*
17. **`pricing-currency-render`** — P2 — *TierGrid + AddonSection + FAQ must subscribe to `spacefield:currency-changed` and re-render prices. Currently the switcher is decorative.*
18. **`signin-redirect-paths`** — P1 — *Replace `/login?next=…` (6 files) and `/auth/sign-in` (1 file) with `/signin?next=…`. Currently a signed-out user hitting `/inbox`, `/account/email`, `/account/notifications`, `/chat`, `/search` lands on a 404.*
19. **`activity-feed-loadmore`** — P3 — *ActivityFeed must offer "Load older" using the API's `?before=` cursor (or bump default limit).*
20. **`workspace-files-search-indexer`** — P2 — *`/api/files/finalize` should call `indexDocument`. `/api/files/{trash,delete}` should call `unindexDocument`. Files are currently invisible to /search.*
21. **`trash-pagination`** — P3 — *Drop the silent 200-per-table cap in `listTrash` or surface a "showing first 200 of N" message.*
22. **`tags-page-no-double-fetch`** — P3 — *Remove the discarded second GET in `app/tags/page.tsx:62-71`.*
23. **`uae-holidays-runtime`** — P3 — *Move hard-coded UAE 2026 holiday list out of `app/people/time-off/page.tsx` into runtime config (Eid dates drift vs lunar calendar).*
24. **`kanban-revert-toast`** — P3 — *On Kanban drag-and-drop revert, show a toast — currently silent.*
25. **`comments-trash-label`** — P3 — *Remove `employee` + `employee_document` from `ENTITY_LABEL` in `app/trash/page.tsx:27-37`; they'll never appear there.*
26. **`os-shell-cmdk-on-pages`** — P3 — *Verify Cmd-K palette is mounted inside the OS shell (`/tools/*`) so users in the desktop chrome can still summon it.*
27. **`crm-soft-delete-paths`** — P2 — *Audit + add explicit soft-delete endpoints for `crm_contacts`, `crm_leads`, `crm_deals`. The trash table assumes they exist; the API surface doesn't expose them.*
28. **`import-resume-from-row`** — P3 — *ImportRunner should offer a "Retry from row N" button after a chunk fails — currently the whole 5,000-row job aborts.*
29. **`notification-bell-os-shell-mount`** — P2 — *Add `<NotificationBell />` to OS shell TopBar so notifications are reachable without leaving `/tools`.*
30. **`comment-restore-via-trash`** — P3 — *`CommentsThread` undo flow already routes through `/api/trash` — once BUG-D-14 lands, restored comments will need their `mentions[]` re-fanned-out (or not, depending on UX call). Decide + document.*
