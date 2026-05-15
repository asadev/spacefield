# API Endpoints

Catalog of every public HTTP route under `app/api/**`. Regenerate by walking `route.ts` files and reading their top-comments. Last refreshed 2026-05-15.

Auth column legend:

- **none** — no auth check. Public.
- **session** — Supabase cookie session (`supabase.auth.getUser()`). 401 if missing.
- **admin** — session + `profiles.is_admin = true`.
- **bearer** — `Authorization: Bearer <token>` (API token table or `CRON_SECRET`).
- **signed** — provider HMAC / signature header (Paddle, Meta, Share).
- **slug+secret** — public form/webhook ingest; secret rotates per lead source.

Rate-limit column shows the bucket key the route enforces via `lib/rate-limit`. Empty means no explicit limit.

---

## Public / unauthenticated

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET | /api/health | none | — | DB + env probe for synthetic monitors. |
| POST | /api/contact | none | — | Public contact form: inserts `contact_messages` + sends auto-reply. |
| POST | /api/inbound/form/[slug] | slug+secret | per-slug | Lead-source form submission; routes into CRM. |
| POST | /api/inbound/webhook/[slug] | slug+secret | per-slug | Lead-source webhook ingest (Zapier, n8n, etc.). |
| POST | /api/agent/telegram/webhook | signed | — | Inbound Telegram update; routes message to agent runtime. |
| POST | /api/agent/whatsapp/webhook | signed | — | Inbound WhatsApp update; routes message to agent runtime. |
| POST | /api/paddle/webhook | signed | — | Paddle billing webhook (subscription / transaction events). |

## Cron (Vercel-scheduled)

All cron routes verify `Authorization: Bearer ${CRON_SECRET}` or the `vercel-cron/1.0` user-agent / `x-vercel-cron` header. Unauthorized hits return 401.

| Method | Path | Auth | Schedule (UTC) | Purpose |
|--------|------|------|----------------|---------|
| GET | /api/cron/social-publish | bearer | `0 9 * * *` | Pick up `social_posts` rows with `status='scheduled'` and publish them to Meta. |
| GET | /api/cron/audit-purge | bearer | `15 6 * * 1` | Call `admin_purge_audit_log(90)` weekly to prune old audit rows. |
| GET | /api/cron/slow-queries-snapshot | bearer | `45 6 * * 1` | Snapshot top 50 slow queries into `slow_query_snapshots` weekly. |

## Authenticated user — self / session

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET | /api/me | session | — | Tier + caps + permissions overview for the current user. |
| GET | /api/notifications | session | — | List the user's notifications. |
| GET | /api/activity | session | — | Workspace or per-entity activity feed. |
| GET | /api/search | session | per-user search | Global search across workspace entities. |
| GET, POST, DELETE | /api/favorites | session | — | Star/unstar arbitrary entities. |
| GET, POST | /api/comments | session | — | List/create comments on an entity. |
| GET, POST, DELETE | /api/tags | session | — | Manage colored tags on entities. |
| POST | /api/billing/checkout | session | — | Build a Paddle checkout payload for tier or storage add-on. |
| GET | /api/trash | session | — | Soft-deleted items across CRM tables. |

## Workspaces

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/workspaces/ensure | session | — | Idempotent get-or-create of a user's default workspace. |
| POST | /api/workspaces/update | session | — | Patch workspace name / slug / permissions / branding. |
| POST | /api/workspaces/archive | session | — | Archive (soft-delete) a workspace. |
| POST | /api/workspaces/invite | session | — | Email-invite a member into a workspace. |
| POST | /api/workspaces/transfer-ownership | session | — | Transfer workspace owner role to another member. |
| GET | /api/workspaces/storage-stats | session | — | Aggregate file storage usage for the workspace. |
| POST | /api/workspaces/storage-addon | session | — | Attach / detach a storage add-on (post-Paddle confirmation). |
| GET | /api/workspaces/activity | session | — | Workspace-level activity log. |

## Files / Launchpad

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET | /api/files/list | session | — | List files in a folder. |
| POST | /api/files/upload | session | per-user upload | Pre-sign R2 upload + insert `workspace_files` row. |
| POST | /api/files/finalize | session | — | Confirm upload after R2 PUT completes. |
| GET | /api/files/download | session | — | Issue signed R2 download URL. |
| POST | /api/files/rename | session | — | Rename a file row. |
| POST | /api/files/move | session | — | Move file across folders / workspaces (share path). |
| POST | /api/files/delete | session | — | Soft-delete to trash. |
| POST | /api/files/restore | session | — | Restore from trash. |
| POST | /api/files/permanently-delete | session | — | Hard-delete trash row + R2 object. |
| POST | /api/files/empty-trash-older-than | session | — | Purge trash older than N days. |
| GET, POST | /api/files/favorites | session | — | Star/unstar a workspace file. |
| GET | /api/files/trash | session | — | List items in trash. |
| POST | /api/files/tag | session | — | Add/remove tag chips on a file. |
| GET | /api/files/load-content | session | — | Inline preview (text/MD/code files). |
| POST | /api/files/save-content | session | — | Persist edits to a text-shaped file. |
| GET, POST | /api/files/shares | session | — | Cross-workspace share grants on a file. |
| DELETE | /api/files/shares/[id] | session | — | Revoke a cross-workspace share. |
| GET | /api/files/shares/incoming | session | — | Shares granted *to* the current workspace. |
| GET | /api/files/shares/outgoing | session | — | Shares granted *from* the current workspace. |

## Chat

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/chat/channels/create | session | — | Create a chat channel. |
| GET | /api/chat/channels/list | session | — | List workspace channels. |
| GET | /api/chat/messages/list | session | — | Page messages in a channel. |
| POST | /api/chat/messages/send | session | per-user chat | Send a chat message. |
| POST | /api/chat/messages/edit | session | — | Edit a sent message. |
| POST | /api/chat/messages/delete | session | — | Soft-delete a sent message. |
| GET, POST | /api/chat/members | session | — | List/add channel members. |
| POST | /api/chat/read | session | — | Mark a channel read up to a message id. |
| GET | /api/chat/unread | session | — | Unread counts across channels. |

## CRM (Boards, Pipelines, Records, Tags)

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET, POST | /api/crm/contacts | session | — | List/create contacts. |
| GET, PATCH, DELETE | /api/crm/contacts/[id] | session | — | Read/update/soft-delete one contact. |
| GET, POST | /api/crm/companies | session | — | List/create companies. |
| GET, PATCH, DELETE | /api/crm/companies/[id] | session | — | One company. |
| GET, POST | /api/crm/leads | session | — | List/create leads. |
| GET, PATCH, DELETE | /api/crm/leads/[id] | session | — | One lead. |
| POST | /api/crm/leads/convert | session | — | Convert a lead into contact/deal. |
| GET, POST | /api/crm/deals | session | — | List/create deals. |
| GET, PATCH, DELETE | /api/crm/deals/[id] | session | — | One deal. |
| POST | /api/crm/deals/move | session | — | Drag-drop a deal across pipeline stages. |
| GET, POST | /api/crm/activities | session | — | List/create CRM activity log entries. |
| GET, PATCH, DELETE | /api/crm/activities/[id] | session | — | One activity. |
| GET, POST | /api/crm/inventory | session | — | List/create inventory items (properties, listings). |
| GET, PATCH, DELETE | /api/crm/inventory/[id] | session | — | One inventory item. |
| GET, POST | /api/crm/pipelines | session | — | List/create pipelines. |
| GET, PATCH, DELETE | /api/crm/pipelines/[id] | session | — | One pipeline. |
| GET, POST | /api/crm/pipelines/[id]/stages | session | — | List/add stages within a pipeline. |
| PATCH, DELETE | /api/crm/pipelines/stages/[id] | session | — | One stage. |
| GET, POST | /api/crm/boards | session | — | Monday-style flexible boards. |
| GET, PATCH, DELETE | /api/crm/boards/[id] | session | — | One board. |
| GET, POST | /api/crm/boards/[id]/columns | session | — | Board columns. |
| PATCH, DELETE | /api/crm/boards/[id]/columns/[colId] | session | — | One column. |
| GET, POST | /api/crm/boards/[id]/records | session | — | Board records. |
| PATCH, DELETE | /api/crm/boards/[id]/records/[recId] | session | — | One record. |
| POST | /api/crm/boards/[id]/records/reorder | session | — | Bulk reorder records. |
| GET, POST | /api/crm/boards/[id]/views | session | — | Saved board views. |
| PATCH, DELETE | /api/crm/boards/[id]/views/[viewId] | session | — | One view. |
| GET, POST | /api/crm/saved-views | session | — | Saved filter views (fixed-schema CRM). |
| PATCH, DELETE | /api/crm/saved-views/[id] | session | — | One saved view. |
| GET, POST | /api/crm/custom-fields | session | — | Custom field definitions. |
| PATCH, DELETE | /api/crm/custom-fields/[id] | session | — | One custom field. |
| GET, POST | /api/crm/tags | session | — | CRM-scoped tags. |
| DELETE | /api/crm/tags/[id] | session | — | Delete a tag. |
| POST | /api/crm/tags/attach | session | — | Attach tag to record. |
| POST | /api/crm/tags/detach | session | — | Detach tag from record. |
| GET, POST | /api/crm/lead-sources | session | — | List/create lead sources (form/webhook configs). |
| GET, PATCH, DELETE | /api/crm/lead-sources/[id] | session | — | One lead source. |
| POST | /api/crm/lead-sources/[id]/regenerate-secret | session | — | Rotate inbound secret. |
| POST | /api/crm/lead-sources/[id]/test | session | — | Fire a test payload. |
| GET | /api/crm/lead-sources/[id]/events | session | — | Per-source delivery log. |
| POST | /api/crm/lead-sources/[id]/csv-import | session | — | Bulk CSV import for a source. |
| GET, POST | /api/crm/templates/current | session | — | Current CRM template snapshot. |
| POST | /api/crm/templates/apply | session | — | Apply a CRM template (boards/pipelines/fields). |

## Tasks / Projects / People

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET, POST | /api/tasks | session | per-user tasks | List/create tasks. |
| GET, PATCH, DELETE | /api/tasks/[id] | session | — | One task. |
| POST | /api/tasks/bulk-status | session | per-user tasks | Bulk update task statuses. |
| GET | /api/tasks/export-csv | session | per-user export | CSV export of tasks. |
| GET, POST | /api/projects | session | — | List/create projects. |
| GET, PATCH, DELETE | /api/projects/[id] | session | — | One project. |
| GET, POST | /api/people/employees | session | — | Employee directory. |
| GET, POST | /api/people/documents | session | — | Employee document storage. |
| GET, POST | /api/people/time-off | session | — | Time-off requests + balances. |
| GET, POST | /api/people/onboarding | session | — | Onboarding flows + steps. |

## Agent (in-app + messenger linking)

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/agent/dispatch | session | per-user agent | In-app chat → agent runtime. |
| GET | /api/agent/balance | session | — | Quick/deep credit balances for the workspace. |
| GET, POST | /api/agent/permissions | session | — | List/edit per-skill confirmation modes. |
| GET, PATCH | /api/agent/permissions/[skillId] | session | — | One skill's permission mode. |
| GET, PUT | /api/agent/persona | session | — | Workspace persona / system-prompt overrides. |
| POST | /api/agent/telegram/link-code | session | — | Generate a 6-digit Telegram link code. |
| POST | /api/agent/telegram/send | session | — | Outbound Telegram message (admin/agent-initiated). |
| POST | /api/agent/whatsapp/link-code | session | — | Generate a 6-digit WhatsApp link code. |
| POST | /api/agent/whatsapp/send | session | — | Outbound WhatsApp message. |

## Tools

Tool routes serve specific Spacefield mini-apps. Most are session-only — RLS on the underlying tables does the heavy lifting.

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/tools/availability | session | — | Bulk-resolve "is this tool allowed?" for a slug list. |
| POST | /api/tools/grant | admin | — | Grant a tool to a user/workspace/tier. |
| POST | /api/tools/disable | admin | — | Disable a tool globally. |
| GET, POST | /api/tools/developers | session | — | Developers tool — list/save searches. |
| GET, POST | /api/tools/neighborhoods | session | — | Neighborhood data tool. |
| GET, POST | /api/tools/yields | session | — | Rental yield calculator state. |
| GET, POST | /api/tools/service-charges | session | — | Service-charge tracker. |
| GET, POST | /api/tools/investment-sim | session | — | Investment simulator state. |
| GET, POST | /api/tools/golden-visa | session | — | Golden-visa qualification helper. |
| GET, POST | /api/tools/due-diligence | session | — | Due-diligence checklist tool. |

## Share (universal link system on share.example.com)

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/share/mint | session | — | Mint a new shareable link from any tool output. |
| GET, POST | /api/share/links | session | — | List/manage workspace links. |
| GET, PATCH, DELETE | /api/share/links/[id] | session | — | One link. |
| POST | /api/share/links/[id]/pause | session | — | Pause a link (returns 404 to visitors). |
| POST | /api/share/links/[id]/resume | session | — | Unpause a link. |
| GET | /api/share/links/[id]/deliveries | session | — | Webhook delivery log for a link. |
| POST | /api/share/upload | session | — | Upload private file to share-files bucket. |
| POST | /api/share/upload-image | session | — | Upload public image to share-public bucket. |
| GET | /api/share/download/[id] | none | — | Signed download for a shared file (link-token gated). |
| POST | /api/share/submit | none | per-IP submit | Public form submission against a minted link. |
| POST | /api/share/accept | none | — | Quote accept event. |
| POST | /api/share/book | none | per-IP book | Booking submission. |
| POST | /api/share/subdomain | session | — | Claim/release a workspace's `<sub>.share.example.com`. |

## Notifications / search / etc.

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| POST | /api/onboarding/seed-demo | session | — | Seed demo workspace data for a new user. |

## Wallpapers

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET | /api/wallpapers/list | session | — | List available + user-owned wallpapers. |
| POST | /api/wallpapers/create | session | — | Upload a new custom wallpaper. |
| POST | /api/wallpapers/delete | session | — | Remove a custom wallpaper. |
| GET | /api/wallpapers/asset | session | — | Serve a wallpaper asset (signed URL). |

## Admin (`/api/admin/**` — `profiles.is_admin = true` required)

| Method | Path | Auth | Rate-limit | Purpose |
|--------|------|------|------------|---------|
| GET | /api/admin/activity | admin | — | Cross-workspace activity log. |
| GET, POST | /api/admin/alerts | admin | — | Manage admin alert rules + events. |
| GET, POST | /api/admin/api-tokens | admin | — | Issue/revoke API tokens. |
| GET, POST | /api/admin/apps/visibility | admin | — | Toggle app registry visibility. |
| GET, POST | /api/admin/apps/users | admin | — | Per-user app grants. |
| GET, POST | /api/admin/backups | admin | — | Backup snapshot index. |
| GET, POST | /api/admin/bulk | admin | — | List bulk-operation records. |
| GET, POST | /api/admin/bulk/[id] | admin | — | One bulk operation. |
| POST | /api/admin/bulk/run | admin | — | Run a bulk operation (delete / tag / move / grant…). |
| GET, POST | /api/admin/data-exports | admin | — | Export request inbox. |
| GET | /api/admin/domains/check | admin | — | Check custom-domain DNS readiness. |
| GET, POST | /api/admin/errors | admin | — | Error event log. |
| POST | /api/admin/errors/[id]/resolve | admin | — | Mark an error event resolved. |
| POST | /api/admin/eval | admin | — | Kick off an eval suite. |
| POST | /api/admin/features/test | admin | — | Evaluate a feature flag for a fake user. |
| POST | /api/admin/help/vote | admin | — | Upvote/downvote a help article. |
| POST | /api/admin/impersonate | admin | — | Start an impersonation session. |
| GET, POST | /api/admin/integrations | admin | — | Manage third-party integration configs. |
| GET | /api/admin/invoices | admin | — | List invoices. |
| GET | /api/admin/invoices/[id] | admin | — | One invoice. |
| GET | /api/admin/locales/export | admin | — | Export locale strings as JSON. |
| POST | /api/admin/models/resolve | admin | — | Resolve a model alias to its provider config. |
| GET, POST | /api/admin/moderation | admin | — | Moderation rule list. |
| GET | /api/admin/moderation/queue | admin | — | Moderation queue. |
| POST | /api/admin/pages/[id]/run-action | admin | — | Run a custom admin-page action block. |
| POST | /api/admin/playground/agent-run | admin | — | Playground: run agent against an ad-hoc prompt. |
| POST | /api/admin/playground/prompt-test | admin | — | Playground: run a prompt-library entry. |
| POST | /api/admin/playground/skill-invoke | admin | — | Playground: invoke a skill directly. |
| POST | /api/admin/providers/[id]/discover | admin | — | Probe a provider for available models. |
| GET, POST | /api/admin/refunds | admin | — | Refund request list. |
| PATCH | /api/admin/refunds/[id] | admin | — | One refund. |
| GET | /api/admin/roles/check | admin | — | Resolve a user's effective admin role + permissions. |
| POST | /api/admin/runtime-config/test | admin | — | Dry-run a runtime config change against a user. |
| GET | /api/admin/skills/[id]/agents | admin | — | Agents using a skill. |
| GET | /api/admin/skills/[id]/runs | admin | — | Recent runs for a skill. |
| GET | /api/admin/skills/[id]/source | admin | — | Skill source / definition. |
| POST | /api/admin/skills/[id]/test-tool | admin | — | Smoke-test a skill's tool. |
| GET, POST | /api/admin/social/list | admin | — | List scheduled social posts. |
| POST | /api/admin/social/upsert | admin | — | Create/edit a scheduled social post. |
| POST | /api/admin/social/publish | admin | — | Manual "publish now" for a draft. |
| POST | /api/admin/social/delete | admin | — | Delete a draft. |
| POST | /api/admin/social/refresh-insights | admin | — | Re-fetch IG/FB metrics for a post. |
| GET | /api/admin/storage | admin | — | Per-workspace storage usage table. |
| GET, POST | /api/admin/support | admin | — | Support ticket inbox. |
| GET, PATCH | /api/admin/support/[id] | admin | — | One ticket. |
| GET, POST | /api/admin/support/[id]/messages | admin | — | Ticket messages. |
| GET, POST | /api/admin/surveys | admin | — | Survey definitions. |
| GET, PATCH, DELETE | /api/admin/surveys/[id] | admin | — | One survey. |
| GET | /api/admin/tools-catalog/list | admin | — | Tool catalog with grant counts. |
| GET, POST | /api/admin/agents/skills | admin | — | Per-agent skill bindings. |
| POST | /api/admin/agents/visibility | admin | — | Toggle agent visibility. |
| GET | /api/admin/agents/[id]/runs | admin | — | Agent run log. |
| GET, POST | /api/admin/agents/[id]/tools | admin | — | Per-agent tool overrides. |
| POST | /api/admin/workflows/[id]/run | admin | — | Manually run an agent workflow. |

---

### Notes

- Per-route `runtime` is mostly `nodejs`; `/api/health` runs on `edge` for speed.
- `withApiHandler` wraps a number of routes (search, files, projects, tasks, dispatch) to inject the latency-histogram emitter that feeds `api_latency`.
- Rate-limit buckets are configured in `lib/rate-limit` and exposed in `/admin/rate-limits`.
- Inbound webhooks (`/api/inbound/*`) authenticate via per-source secrets stored in `crm_lead_sources.secret` — not session, not bearer.
