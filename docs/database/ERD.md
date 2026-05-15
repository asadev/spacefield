# Database ERD — `public.*` schema

Every table in the `public` schema, grouped by domain, with the source migration and key relationships. Last refreshed 2026-05-15.

Source of truth is the migration set in `supabase/migrations/`. When the migrations and this file disagree, the migrations win — file a fix in the same commit.

Cross-cutting tenancy: nearly every table is keyed on `workspace_id → public.workspaces.id`, with `auth.users.id` as the user identity. RLS enforces "you can read rows where you are a member of the workspace".

---

## Workspaces & members (tenancy spine)

### public.workspaces
Created in `20260426_workspace_sync.sql` (+slug column in `20260428_workspaces_slug.sql`). Root tenancy entity — one row per workspace.
- `user_id → auth.users.id` — workspace owner.
- Members in `workspace_members`.
- Settings extended in `20260428_workspace_settings.sql` (identity + permissions cols).

### public.workspace_members
Created in `20260427_workspace_sharing.sql`. Membership rows with `role ∈ {owner, admin, member, viewer}`.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id`
- Unique on `(workspace_id, user_id)`.

### public.workspace_invites
Created in `20260427_workspace_sharing.sql`. Email-token invitations.
- `workspace_id → public.workspaces.id`
- `invited_email`, `token`, `role`.

### public.workspace_settings
Created in `20260428_workspace_settings.sql`. Per-workspace identity + permission flags + branding.
- `workspace_id → public.workspaces.id` (1:1).

### public.workspace_state
Created in `20260509_admin_panel_foundation.sql`. Runtime state per workspace (suspended, frozen, etc.).
- `workspace_id → public.workspaces.id` (1:1).

### public.workspace_activity
Created in `20260428_workspace_settings.sql`. Activity audit on settings-page actions.
- `workspace_id → public.workspaces.id`
- `actor_user_id → auth.users.id`

### public.workspace_custom_domains
Created in `20260509_admin_panel_foundation.sql`. White-label custom domains.
- `workspace_id → public.workspaces.id`

## Identity / profiles

### public.profiles
Created in `20260427_profiles.sql` (+`is_admin` flag in `20260427_admin_messages.sql`). Public-readable user profile.
- `user_id → auth.users.id` (primary key).

### public.auth_events
Created in `20260509_admin_panel_foundation.sql` (extended `20260513_waitlist.sql`). Sign-in events + suspicious-login detection.
- `user_id → auth.users.id`

## Tiers, billing, storage add-ons

### public.subscription_tiers
Created in `20260427_tiers_and_files.sql` (caps reset in `20260428_tier_member_caps.sql`). Tier metadata (price, member cap, storage cap).

### public.subscriptions
Created in `20260427_tiers_and_files.sql` (+Paddle cols in `20260428_paddle_billing.sql`, Polar dropped in `20260429_drop_polar.sql`). One subscription row per user.
- `user_id → auth.users.id`
- `tier_id → public.subscription_tiers.id`
- `paddle_subscription_id`, `paddle_customer_id`.

### public.workspace_storage_addons
Created in `20260428_tier_caps_and_storage_addons.sql` (default flipped in `20260429_addon_payment_status_default.sql`). À-la-carte per-workspace storage upgrades.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id`
- `payment_status ∈ {pending, active, past_due, canceled}`.

### public.paddle_webhook_events
Created in `20260428_paddle_billing.sql`. Webhook idempotency log.
- One row per Paddle `event_id`.

### public.polar_webhook_events
Created in `20260428_polar_billing.sql`. Polar webhook log (retained for history; integration retired).

### public.invoices
Created in `20260509d_admin_panel_v4.sql`. Local mirror of paid invoices.
- `user_id → auth.users.id`
- `subscription_id → public.subscriptions.id`

### public.refunds
Created in `20260509d_admin_panel_v4.sql`. Refund requests + statuses.
- `invoice_id → public.invoices.id`
- `user_id → auth.users.id`

### public.coupons, public.coupon_redemptions, public.cohorts, public.cohort_users
Created in `20260509c_admin_panel_v3.sql`. Discount codes + user cohort grouping for funnels.

### public.funnels, public.funnel_events
Created in `20260509c_admin_panel_v3.sql`. Conversion-funnel definitions + event log.

## Files

### public.workspace_files
Created in `20260427_tiers_and_files.sql` (+trash/tags in `20260427_files_trash_and_tags.sql`). Metadata for files stored in Cloudflare R2.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id` (uploader)
- `r2_key`, `size_bytes`, `deleted_at` (soft-delete).

### public.workspace_file_shares
Created in `20260429_workspace_file_shares.sql`. Cross-workspace share grants on individual files.
- `file_id → public.workspace_files.id`
- `target_workspace_id → public.workspaces.id`
- `granted_by → auth.users.id`

### public.workspace_file_favorites
Created in `20260429_files_favorites.sql`. Per-user starred files.
- `user_id → auth.users.id`
- `file_id → public.workspace_files.id`

## Chat

### public.chat_channels
Created in `20260428_chat.sql`. One row per workspace channel.
- `workspace_id → public.workspaces.id`
- `created_by → auth.users.id`

### public.chat_messages
Created in `20260428_chat.sql`. Messages within channels.
- `channel_id → public.chat_channels.id`
- `user_id → auth.users.id`

### public.chat_read_state
Created in `20260428_chat.sql`. Per-user last-read pointer per channel.
- `(channel_id, user_id)` composite key.

## CRM — fixed-schema entities

### public.crm_contacts, public.crm_companies, public.crm_leads, public.crm_deals, public.crm_inventory_items, public.crm_activities
Created in `20260428_crm_foundation.sql` (soft-delete cols in `20260514b_database_hardening.sql`). Core CRM types.
- All keyed on `workspace_id → public.workspaces.id`.
- Deals link to pipelines via `pipeline_id → public.crm_pipelines.id` and `stage_id → public.crm_pipeline_stages.id`.
- Leads convert to contacts via `/api/crm/leads/convert`.

### public.crm_pipelines, public.crm_pipeline_stages
Created in `20260428_crm_foundation.sql`. Pipeline/stage definitions.
- Stages: `pipeline_id → public.crm_pipelines.id`.

### public.crm_custom_fields
Created in `20260428_crm_foundation.sql`. User-defined extra fields on CRM entities.

### public.crm_saved_views
Created in `20260428_crm_foundation.sql`. Saved filter/sort/view state.

### public.crm_tags, public.crm_record_tags
Created in `20260428_crm_foundation.sql`. Tag chips + many-to-many record bindings.

## CRM — Monday-style flexible boards

### public.crm_boards, public.crm_board_columns, public.crm_board_records, public.crm_board_views
Created in `20260428_crm_boards.sql`. Schema-flexible boards on top of fixed CRM.
- Boards: `workspace_id → public.workspaces.id`
- Columns: `board_id → public.crm_boards.id`
- Records: `board_id → public.crm_boards.id`
- Views: `board_id → public.crm_boards.id`

### public.crm_lead_sources, public.crm_lead_source_events
Created in `20260428_crm_lead_sources.sql`. Inbound channels (webhook / form / CSV) + delivery log.
- Sources: `workspace_id → public.workspaces.id`
- Events: `source_id → public.crm_lead_sources.id`

## Tasks / Projects

### public.tasks
Created in `20260514d_tasks.sql`. Project management tasks.
- `workspace_id → public.workspaces.id`
- `project_id → public.projects.id` (nullable for orphan tasks)
- `assignee_user_id → auth.users.id`

### public.projects
Created in `20260514d_tasks.sql`. Project containers for tasks.
- `workspace_id → public.workspaces.id`

## People (HR) module

### public.employees
Created in `20260514e_people.sql`. Employee directory + profile.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id` (nullable — non-user employees allowed)

### public.employee_documents
Created in `20260514e_people.sql`. Document storage with expiry tracking (Emirates ID / visa).
- `employee_id → public.employees.id`

### public.time_off_policies, public.time_off_balances, public.time_off_requests
Created in `20260514e_people.sql`. Leave management.
- Balances: `(policy_id → public.time_off_policies.id, employee_id → public.employees.id)`
- Requests: `(policy_id, employee_id, approver_user_id → auth.users.id)`

### public.onboarding_templates
Created in `20260514e_people.sql`. New-hire onboarding checklist templates.

## Cross-cutting collab primitives

### public.comments
Created in `20260514c_collab_primitives.sql`. Comments on any (`entity_type`, `entity_id`) pair.

### public.activities
Created in `20260514c_collab_primitives.sql`. Activity feed events (cross-entity).

### public.notifications
Created in `20260514c_collab_primitives.sql`. User-targeted notifications.
- `user_id → auth.users.id`

### public.tags, public.entity_tags
Created in `20260514c_collab_primitives.sql`. Workspace-scoped tags + entity bindings.

### public.favorites
Created in `20260514c_collab_primitives.sql`. Per-user starred entities (cross-table).

### public.saved_views
Created in `20260514c_collab_primitives.sql`. Generic saved-view payloads keyed by `(workspace_id, surface)`.

## Search

### public.search_documents
Created in `20260514f_search.sql`. Denormalised global-search index, populated via `search_doc_upsert` / `search_doc_remove` RPCs.

## toShare (universal link system on toshare.net)

### public.toshare_links
Created in `20260502_toshare_links.sql` (+branding in `20260502_toshare_branding.sql`). Minted shareable links.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id`

### public.toshare_events
Created in `20260502_toshare_links.sql` (+accept in `20260502_toshare_accept.sql`, +booking in `20260502_toshare_booking.sql`). Visitor activity per link (view, submit, accept, book).
- `link_id → public.toshare_links.id`

### public.toshare_webhook_deliveries
Created in `20260502_toshare_webhook_log.sql` (+secret rotation in `20260502_toshare_webhook_secret.sql`). Outbound webhook delivery log.
- `link_id → public.toshare_links.id`

## Agent runtime (Spacefield AI)

### public.agent_credit_balances, public.agent_credit_events
Created in `20260429_agent_credits.sql`. Quick/deep credit buckets + audit trail.
- Balances: `(workspace_id, user_id, month)`

### public.agent_conversation_messages
Created in `20260429_agent_credits.sql`. Per-conversation message history fed back into the runtime.

### public.agent_permissions, public.agent_pending_approvals
Created in `20260429_agent_permissions.sql`. Per-skill confirmation modes + pending confirm-required approvals.

### public.agent_personas
Created in `20260429_agent_personas.sql`. Per-workspace persona overrides.

### public.agent_whatsapp_links, public.agent_whatsapp_link_codes
Created in `20260429_agent_whatsapp_links.sql`. Phone-number to user link + 6-digit linking codes.

### public.agent_telegram_links, public.agent_telegram_link_codes
Created in `20260429_agent_telegram_links.sql`. Telegram user id to user link + linking codes.

### public.agent_tool_overrides
Created in `20260509c_admin_panel_v3.sql`. Per-agent tool enable/disable.

### public.agent_workflows
Created in `20260509b_admin_panel_v2.sql`. Multi-step agent workflow definitions.

## AI registry (models, providers, skills, agents)

### public.ai_providers, public.ai_provider_health
Created in `20260509c_admin_panel_v3.sql`. Provider configs (Anthropic / OpenAI / etc.) + health probes.

### public.ai_models
Created in `20260509b_admin_panel_v2.sql`. Model registry with pricing/context info.
- `provider_id → public.ai_providers.id`

### public.ai_skills
Created in `20260509b_admin_panel_v2.sql`. Skill definitions (DB-driven; replaces `ALL_SKILLS` constant).

### public.ai_agents, public.ai_agent_runs
Created in `20260509_admin_panel_foundation.sql`. Configurable agents + run history.
- Runs: `agent_id → public.ai_agents.id`

### public.runtime_model_assignments
Created in `20260509e_admin_panel_v6.sql`. Map of `(workspace, scope) → model` overrides.

### public.runtime_config
Created in `20260509e_admin_panel_v6.sql`. Key/value runtime feature flags read at startup.

### public.prompt_library, public.prompt_versions
Created in `20260509c_admin_panel_v3.sql`. Reusable prompt templates + version history.
- Versions: `prompt_id → public.prompt_library.id`

### public.eval_suites, public.eval_runs
Created in `20260509c_admin_panel_v3.sql`. Eval suite definitions + run history.

## Custom apps + app registry

### public.app_registry
Created in `20260509_admin_panel_foundation.sql` (custom apps in `20260509g_custom_apps.sql`). One row per OS-shell app (system + custom iframe).

### public.user_app_grants
Created in `20260509_admin_panel_foundation.sql`. Per-user explicit allow/deny of an app.
- `user_id → auth.users.id`
- `app_id → public.app_registry.id`

### public.workspace_tool_grants
Created in `20260428_tool_gating.sql`. Per-workspace tool overrides (allow/deny).
- `workspace_id → public.workspaces.id`

### public.tool_settings
Created in `20260428_tool_gating.sql`. Per-tool admin settings (kill-switch, tier allow-list).

## Feature flags + experiments

### public.feature_flags
Created in `20260509_admin_panel_foundation.sql`. Named feature flags with rollout strategy.

### public.user_feature_overrides, public.workspace_feature_overrides
Created in `20260509_admin_panel_foundation.sql`. Explicit overrides per user / per workspace on top of the rollout.

## Admin panel infrastructure

### public.admin_audit_log
Created in `20260509_admin_panel_foundation.sql`. Append-only audit of every admin action. Pruned by `admin_purge_audit_log(p_older_than_days)` (scheduled in `/api/cron/audit-purge`).

### public.admin_roles, public.admin_role_permissions, public.user_admin_roles
Created in `20260509e_admin_panel_v6.sql`. Named admin permission bundles + bindings.

### public.admin_pages, public.admin_page_blocks
Created in `20260509e_admin_panel_v6.sql`. Custom admin pages composed of reusable blocks.

### public.admin_alerts, public.admin_alert_events
Created in `20260509b_admin_panel_v2.sql`. Threshold-based alert rules + firing log.

### public.bulk_operations
Created in `20260509b_admin_panel_v2.sql` (+ runner in `20260509d_admin_panel_v4.sql`). Records of admin bulk actions.

### public.data_export_requests
Created in `20260509b_admin_panel_v2.sql`. GDPR-style data export inbox.

### public.error_events
Created in `20260509c_admin_panel_v3.sql`. Server-side error log surfaced in `/admin/errors`.

### public.api_tokens
Created in `20260509b_admin_panel_v2.sql`. Hashed API tokens for programmatic admin access.

### public.impersonation_sessions
Created in `20260509d_admin_panel_v4.sql`. Active admin-as-user impersonation tokens.

### public.ip_rules
Created in `20260509c_admin_panel_v3.sql`. Allow/deny lists for the middleware IP gate.

### public.security_policies
Created in `20260509c_admin_panel_v3.sql`. Password policy + MFA requirement settings.

### public.sso_configs
Created in `20260509c_admin_panel_v3.sql`. SSO IdP config (placeholder until live SSO ships).

### public.maintenance_state
Created in `20260509d_admin_panel_v4.sql` (read at runtime via `await headers()` since `20260509` v7). Single-row maintenance-mode toggle.

### public.site_banners
Created in `20260509c_admin_panel_v3.sql`. Site-wide announcement banners.

### public.brand_configs
Created in `20260509c_admin_panel_v3.sql`. Theme/branding overrides (currently single-row).

### public.announcements
Created in `20260509d_admin_panel_v4.sql`. In-app announcement bubbles.

### public.push_campaigns, public.push_subscriptions
Created in `20260509c_admin_panel_v3.sql`. Web push: subscriber endpoints + targeted campaigns.

### public.email_templates, public.email_sends
Created in `20260509c_admin_panel_v3.sql`. Branded email templates + outbound log.

### public.locales, public.locale_strings
Created in `20260509c_admin_panel_v3.sql`. Locale registry + key/string translations.

### public.help_articles, public.help_categories
Created in `20260509d_admin_panel_v4.sql`. Help center content tree.

### public.integrations
Created in `20260509c_admin_panel_v3.sql`. Third-party integration configs (Slack, Stripe-side, etc.).

### public.moderation_rules, public.moderation_queue
Created in `20260509c_admin_panel_v3.sql`. Content moderation: regex rules + flagged-content queue.

### public.product_tours, public.onboarding_flows, public.onboarding_steps, public.onboarding_runs, public.user_onboarding_state
Created in `20260509d_admin_panel_v4.sql`. Guided product tours + onboarding sequences + per-user progress.

### public.support_tickets, public.support_messages
Created in `20260509d_admin_panel_v4.sql`. In-app support inbox.

### public.surveys, public.survey_responses
Created in `20260509d_admin_panel_v4.sql`. Survey definitions + responses.

### public.db_backup_drills, public.backup_snapshots
Created in `20260514b_database_hardening.sql` + `20260509d_admin_panel_v4.sql`. Restore-from-backup drill log + snapshot index.

### public.webhook_endpoints, public.webhook_subscriptions, public.webhook_deliveries_v
Created in `20260509b_admin_panel_v2.sql`. Outbound webhook framework.

## Social posting (Meta)

### public.social_posts
Created in `20260428_social_posts.sql`. Drafts / scheduled / sent posts to Facebook + Instagram. Picked up by `/api/cron/social-publish`.
- `workspace_id → public.workspaces.id`
- `user_id → auth.users.id`

## Wallpapers

### public.wallpapers
Created in `20260428_wallpapers.sql`. Desktop background catalog.

## Rate limiting

### public.rate_limit_buckets, public.rate_limit_rules
Created in `20260501_rate_limits.sql`. Sliding-window counters + per-key rule overrides.

## Cron + observability

### public.cron_jobs, public.cron_runs
Created in `20260509b_admin_panel_v2.sql`. Cron job registry + run history (panel toggle in `lib/cron/_check_enabled`).

### public.api_latency
Created in `20260514a_observability.sql`. Per-endpoint latency histogram (inserted by `withApiHandler`).

### public.slow_query_snapshots
Created in `20260515b_observability_history.sql`. Weekly snapshots of `admin_slow_queries(50)` so we have history that survives `pg_stat_statements_reset()`. Service-role only.

## Auxiliary

### public.contact_messages
Created in `20260427_admin_messages.sql`. Inbox for the public `/api/contact` form.

### public.activity_feed
Created in `20260509d_admin_panel_v4.sql`. Cross-workspace activity stream (admin view).

### public.waitlist_signups
Created in `20260513_waitlist.sql`. Pre-launch waitlist email collector.

### public.subscriptions, public.subscription_tiers
See *Tiers, billing, storage add-ons* above.

---

### Notes

- `auth.users.id` is the most-referenced FK target (≈ 120 references) — it's the universal identity. Most rows that belong to a user use `user_id`; some HR rows use `assignee_user_id`, `approver_user_id`, `actor_user_id`, etc.
- `public.workspaces.id` is the tenancy spine — referenced by ≈ 60 child tables and underpins RLS.
- The `_v` suffix (`webhook_deliveries_v`) is a view, not a table — included here because it's user-visible.
- Helper RPCs (`admin_caller_is_admin`, `admin_user_storage_stats`, `tool_availability`, `workspace_storage`, `global_search`, `admin_purge_audit_log`, `admin_slow_queries`, etc.) live alongside the tables but aren't catalogued here — see the individual migration files.
