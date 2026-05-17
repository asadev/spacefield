# FK Cascade Audit

**Audit date:** 2026-05-18.  
**Author:** Wave-2 Agent W2 (database scalability).  
**Scope:** every `foreign key … references …` in `supabase/migrations/`. Total foreign keys parsed: **258**.

## TL;DR — distribution by behaviour

| `ON DELETE` clause | count | share |
|---|---:|---:|
| `CASCADE` | 130 | 50.4% |
| `SET NULL` | 121 | 46.9% |
| `RESTRICT` | 2 | 0.8% |
| `NO ACTION` | 5 | 1.9% |

**No `NO ACTION` clause = the column was declared without an explicit `ON DELETE`. PostgreSQL's default is `NO ACTION` (which is functionally the same as `RESTRICT` unless the constraint is `DEFERRABLE INITIALLY DEFERRED`).**

## Findings & recommendations

### Things that look correct (so the table is not noisy)

- **`workspaces` (64 inbound FKs, 53 with `CASCADE`)**: a workspace IS the tenant boundary. Cascading on delete is the intended semantic — deleting a workspace must wipe its CRM rows, chat, tasks, AI agents, tool grants, addons, etc. The `workspace-purge` cron and the new `workspace_deletion_requests` lifecycle (see `20260517a_account_lifecycle.sql`) rely on this fan-out — without `CASCADE` the purge would leave orphan rows that violate RLS scoping.
- **`auth.users` (126 inbound FKs, split 33 cascade / 93 set-null)**: the split here is principled. **Owned rows** (`workspaces.user_id`, `profiles.user_id`, `subscriptions.user_id`, `wallpapers.created_by`, every per-user agent link, every `chat_messages.user_id` etc.) cascade because the row has no meaning without its owner. **Authored-by / updated-by / approved-by attributions** (the 93 `SET NULL` cases — `admin_audit_log.actor_id`, all `*.updated_by`, `crm_*.created_by`, `*.owner_id`, `support_tickets.assigned_to`, etc.) keep the historical record but stop pointing at a dead user. This is the right call for an audit trail — losing the audit row because an admin closed their account would be worse than losing the attribution.
- **Workspace-sharing chains**: `workspace_members.user_id` cascades (membership is meaningless without the user) AND `workspace_members.workspace_id` cascades (workspace deletion clears memberships). Both directions are correct.
- **`crm_pipelines` and `crm_pipeline_stages` use `RESTRICT`**: deleting a pipeline or stage while live deals reference it is correctly blocked — you must move deals first. Same goes for `crm_deals.pipeline_id` and `crm_deals.stage_id`. Good defensive behaviour for a configuration table that drives in-flight workflows.
- **`comments.parent_comment_id` cascades**: deleting a parent comment wipes the thread tree. Matches the soft-delete semantics in `lib/collab/comments.ts` (parent deletion hides children from the UI anyway).

### Things to flag — risk: medium

1. **`subscriptions.tier_id → subscription_tiers(tier_id)` has no explicit ON DELETE**, so the default `NO ACTION` applies. This is actually correct (you should never be able to delete a tier while users are subscribed to it), but the missing clause makes it *implicit* — flag for a future migration to add `ON DELETE RESTRICT` for clarity. Source: `20260427_tiers_and_files.sql`.
2. **`runtime_model_assignments.model_id` and `.fallback_model_id` have no explicit ON DELETE**. Same situation — dropping a model row while it's assigned should fail, which `NO ACTION` does, but the admin panel's discover-models flow happily creates and removes model rows. If a model assignment exists you'll get an opaque FK violation in the admin UI. **Recommendation:** add an explicit `ON DELETE RESTRICT` and a friendlier error path in `/app/admin/ai/models/page.tsx`. Source: `20260509b_admin_panel_v2.sql`.
3. **`onboarding_runs.template_id → onboarding_templates(id)` has no explicit ON DELETE**. The `onboarding_templates.workspace_id` cascades from `workspaces`, so dropping a workspace deletes templates, which would then fail FK from runs. **Concrete bug:** the workspace-purge cron could throw on workspaces that ever ran an onboarding flow. **Recommendation:** change to `ON DELETE SET NULL` or `CASCADE` (runs only matter while the template exists; `SET NULL` is safer). Source: `20260514e_people.sql`.
4. **`time_off_requests.policy_id → time_off_policies(id)` has no explicit ON DELETE** while `time_off_balances.policy_id` has `CASCADE`. Inconsistent — a policy deletion will wipe balances but fail on requests. **Recommendation:** add `ON DELETE RESTRICT` on requests (you shouldn't drop a policy with outstanding requests) or `CASCADE` for symmetry (matches balances). Source: `20260514e_people.sql`.
5. **`tasks.project_id → projects(id)` uses `SET NULL`**, which is fine — orphan tasks land in an Inbox-style bucket. But the listing RPCs in `lib/tasks/server.ts` filter by `project_id is not null` in some paths and not others; confirm the orphan view exists. Source: `20260514d_tasks.sql`.

### Things to flag — risk: low (worth noting, not blocking)

1. **`crm_activities.contact_id / company_id / deal_id / lead_id` all cascade**. If a contact is deleted, the activity log entries for that contact disappear. For an audit-style activity table this is debatable — but the soft-delete migration (`20260514b_database_hardening.sql`) added `deleted_at` to `crm_contacts/leads/deals`, so production deletes are soft and the cascade only fires on hard admin purge. Accept as-is.
2. **`employees.manager_id → employees(id)` uses `SET NULL`** while the manager's other dependents (documents, time-off balances) cascade. Means the org-chart parent goes empty but the person's records survive. Correct.
3. **`chat_messages.reply_to → chat_messages(id)` uses `SET NULL`**. Deleting a thread root drops the reply pointer; the reply still shows in the channel as a top-level message. Reasonable for a chat UX.
4. **`tasks.parent_task_id → tasks(id)` uses `SET NULL`** (similar — deleting a parent promotes children). Good.

### Cascading chains worth being aware of

Deleting a workspace today fans out to 53 direct dependents, and those dependents have their own cascades. Concretely:

```
workspaces (drop)
  → crm_boards CASCADE
      → crm_board_columns CASCADE
      → crm_board_records CASCADE
          → crm_board_records.parent_id CASCADE (self-recursive)
      → crm_board_views  CASCADE
  → crm_pipelines CASCADE
      → crm_pipeline_stages CASCADE
          → crm_deals.stage_id RESTRICT  ← will FAIL the workspace drop
                                            unless deals are deleted first
```

The `RESTRICT` on `crm_deals.stage_id` against `crm_pipeline_stages` means a workspace cannot be hard-dropped while it contains deals. The `workspace-purge` cron must therefore explicitly `delete from crm_deals` before dropping the workspace row — confirm `app/api/cron/workspace-purge/route.ts` does this.

## Full inventory

Grouped by target table, then by `ON DELETE` clause. Each entry shows the source `table.column` and the migration file that introduced it.


### `auth.users`  _(referenced by 126 FKs)_

**`ON DELETE CASCADE` — 33 FK(s):**
- `public.account_deletion_requests.user_id`  *(from `20260517a_account_lifecycle.sql`)*
- `public.agent_conversation_messages.user_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_credit_balances.user_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_credit_events.user_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_pending_approvals.user_id`  *(from `20260429_agent_permissions.sql`)*
- `public.agent_telegram_link_codes.user_id`  *(from `20260429_agent_telegram_links.sql`)*
- `public.agent_telegram_links.user_id`  *(from `20260429_agent_telegram_links.sql`)*
- `public.agent_whatsapp_link_codes.user_id`  *(from `20260429_agent_whatsapp_links.sql`)*
- `public.agent_whatsapp_links.user_id`  *(from `20260429_agent_whatsapp_links.sql`)*
- `public.api_tokens.user_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.chat_messages.user_id`  *(from `20260428_chat.sql`)*
- `public.chat_read_state.user_id`  *(from `20260428_chat.sql`)*
- `public.cohort_users.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.crm_saved_views.user_id`  *(from `20260428_crm_foundation.sql`)*
- `public.data_export_requests.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.impersonation_sessions.admin_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.impersonation_sessions.target_user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.login_events.user_id`  *(from `20260517f_security_retention_lockout.sql`)*
- `public.mfa_recovery_codes.user_id`  *(from `20260517e_mfa_recovery.sql`)*
- `public.notification_prefs.user_id`  *(from `20260517c_notification_prefs.sql`)*
- `public.profiles.user_id`  *(from `20260427_profiles.sql`)*
- `public.push_subscriptions.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.subscriptions.user_id`  *(from `20260427_tiers_and_files.sql`)*
- `public.user_admin_roles.user_id`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.user_app_grants.user_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.user_feature_overrides.user_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.user_onboarding_state.user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.wallpapers.created_by`  *(from `20260428_wallpapers.sql`)*
- `public.workspace_file_favorites.user_id`  *(from `20260429_files_favorites.sql`)*
- `public.workspace_files.user_id`  *(from `20260427_tiers_and_files.sql`)*
- `public.workspace_invites.invited_by`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspace_members.user_id`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspaces.user_id`  *(from `20260426_workspace_sync.sql`)*

**`ON DELETE SET NULL` — 93 FK(s):**
- `public.activity_feed.actor_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.admin_alerts.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.admin_audit_log.actor_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.admin_pages.updated_by`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.admin_role_permissions.granted_by`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.admin_roles.updated_by`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.agent_permissions.updated_by`  *(from `20260429_agent_permissions.sql`)*
- `public.agent_personas.updated_by`  *(from `20260429_agent_personas.sql`)*
- `public.agent_tool_overrides.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.agent_workflows.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.ai_agent_runs.user_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.ai_agents.updated_by`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.ai_models.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.ai_providers.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.ai_skills.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.announcements.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.app_registry.updated_by`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.auth_events.user_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.backup_snapshots.triggered_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.brand_configs.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.bulk_operations.actor_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.chat_channels.created_by`  *(from `20260428_chat.sql`)*
- `public.cohorts.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.coupon_redemptions.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.coupons.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.crm_activities.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_board_records.created_by`  *(from `20260428_crm_boards.sql`)*
- `public.crm_boards.created_by`  *(from `20260428_crm_boards.sql`)*
- `public.crm_companies.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_companies.owner_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_contacts.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_contacts.owner_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_deals.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_deals.owner_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_inventory_items.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_inventory_items.owner_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_leads.created_by`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_leads.owner_id`  *(from `20260428_crm_foundation.sql`)*
- `public.cron_jobs.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.db_backup_drills.by_user`  *(from `20260514b_database_hardening.sql`)*
- `public.email_sends.sent_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.email_templates.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.error_events.resolved_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.error_events.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.eval_runs.triggered_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.eval_suites.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.feature_flags.updated_by`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.funnel_events.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.funnels.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.help_articles.updated_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.help_categories.updated_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.integrations.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.invoices.user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.ip_rules.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.maintenance_state.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.moderation_queue.reviewed_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.moderation_queue.user_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.moderation_rules.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.onboarding_flows.updated_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.product_tours.updated_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.prompt_library.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.prompt_versions.created_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.push_campaigns.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.rate_limit_rules.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.refunds.approved_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.refunds.user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.runtime_config.updated_by`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.runtime_model_assignments.updated_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.security_policies.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.site_banners.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.social_posts.created_by`  *(from `20260428_social_posts.sql`)*
- `public.sso_configs.updated_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.support_messages.author_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.support_tickets.assigned_to`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.support_tickets.user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.survey_responses.user_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.surveys.updated_by`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.tool_settings.updated_by`  *(from `20260428_tool_gating.sql`)*
- `public.toshare_links.owner_user_id`  *(from `20260502_toshare_links.sql`)*
- `public.user_admin_roles.granted_by`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.user_app_grants.granted_by`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.user_feature_overrides.set_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.webhook_endpoints.created_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.webhook_subscriptions.created_by`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.workflow_runs.triggered_by`  *(from `20260509h_workflow_runs.sql`)*
- `public.workspace_activity.actor_id`  *(from `20260428_workspace_settings.sql`)*
- `public.workspace_custom_domains.created_by`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.workspace_feature_overrides.set_by`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.workspace_file_shares.shared_by`  *(from `20260429_workspace_file_shares.sql`)*
- `public.workspace_invites.invitee_user_id`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspace_members.invited_by`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspace_storage_addons.selected_by`  *(from `20260428_tier_caps_and_storage_addons.sql`)*
- `public.workspace_tool_grants.granted_by`  *(from `20260428_tool_gating.sql`)*

### `public.admin_alerts`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.admin_alert_events.alert_id`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.admin_pages`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.admin_page_blocks.page_id`  *(from `20260509e_admin_panel_v6.sql`)*

### `public.admin_roles`  _(referenced by 3 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.admin_role_permissions.role_id`  *(from `20260509e_admin_panel_v6.sql`)*
- `public.user_admin_roles.role_id`  *(from `20260509e_admin_panel_v6.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.admin_pages.required_role`  *(from `20260509e_admin_panel_v6.sql`)*

### `public.agent_workflows`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.workflow_runs.workflow_id`  *(from `20260509h_workflow_runs.sql`)*

### `public.ai_agents`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.agent_tool_overrides.agent_id`  *(from `20260509c_admin_panel_v3.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.ai_agent_runs.agent_id`  *(from `20260509_admin_panel_foundation.sql`)*

### `public.ai_models`  _(referenced by 2 FKs)_

**`ON DELETE NO ACTION` — 2 FK(s):**
- `public.runtime_model_assignments.fallback_model_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.runtime_model_assignments.model_id`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.ai_providers`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.ai_provider_health.provider_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.chat_channels`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.chat_messages.channel_id`  *(from `20260428_chat.sql`)*
- `public.chat_read_state.channel_id`  *(from `20260428_chat.sql`)*

### `public.chat_messages`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.chat_messages.reply_to`  *(from `20260428_chat.sql`)*

### `public.cohorts`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.cohort_users.cohort_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.comments`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.comments.parent_comment_id`  *(from `20260514c_collab_primitives.sql`)*

### `public.coupons`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.coupon_redemptions.coupon_code`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.crm_board_records`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_board_records.parent_id`  *(from `20260428_crm_boards.sql`)*

### `public.crm_boards`  _(referenced by 3 FKs)_

**`ON DELETE CASCADE` — 3 FK(s):**
- `public.crm_board_columns.board_id`  *(from `20260428_crm_boards.sql`)*
- `public.crm_board_records.board_id`  *(from `20260428_crm_boards.sql`)*
- `public.crm_board_views.board_id`  *(from `20260428_crm_boards.sql`)*

### `public.crm_companies`  _(referenced by 3 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_activities.company_id`  *(from `20260428_crm_foundation.sql`)*

**`ON DELETE SET NULL` — 2 FK(s):**
- `public.crm_contacts.company_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_deals.company_id`  *(from `20260428_crm_foundation.sql`)*

### `public.crm_contacts`  _(referenced by 3 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_activities.contact_id`  *(from `20260428_crm_foundation.sql`)*

**`ON DELETE SET NULL` — 2 FK(s):**
- `public.crm_deals.primary_contact_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_leads.converted_contact_id`  *(from `20260428_crm_foundation.sql`)*

### `public.crm_deals`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_activities.deal_id`  *(from `20260428_crm_foundation.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.crm_leads.converted_deal_id`  *(from `20260428_crm_foundation.sql`)*

### `public.crm_lead_sources`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_lead_source_events.source_id`  *(from `20260428_crm_lead_sources.sql`)*

### `public.crm_leads`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_activities.lead_id`  *(from `20260428_crm_foundation.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.crm_lead_source_events.lead_id`  *(from `20260428_crm_lead_sources.sql`)*

### `public.crm_pipeline_stages`  _(referenced by 1 FK)_

**`ON DELETE RESTRICT` — 1 FK(s):**
- `public.crm_deals.stage_id`  *(from `20260428_crm_foundation.sql`)*

### `public.crm_pipelines`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_pipeline_stages.pipeline_id`  *(from `20260428_crm_foundation.sql`)*

**`ON DELETE RESTRICT` — 1 FK(s):**
- `public.crm_deals.pipeline_id`  *(from `20260428_crm_foundation.sql`)*

### `public.crm_tags`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.crm_record_tags.tag_id`  *(from `20260428_crm_foundation.sql`)*

### `public.cron_jobs`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.cron_runs.job_id`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.email_templates`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.email_sends.template_key`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.employees`  _(referenced by 5 FKs)_

**`ON DELETE CASCADE` — 4 FK(s):**
- `public.employee_documents.employee_id`  *(from `20260514e_people.sql`)*
- `public.onboarding_runs.employee_id`  *(from `20260514e_people.sql`)*
- `public.time_off_balances.employee_id`  *(from `20260514e_people.sql`)*
- `public.time_off_requests.employee_id`  *(from `20260514e_people.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.employees.manager_id`  *(from `20260514e_people.sql`)*

### `public.eval_suites`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.eval_runs.suite_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.feature_flags`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.user_feature_overrides.flag_key`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.workspace_feature_overrides.flag_key`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.funnels`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.funnel_events.funnel_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.help_categories`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.help_articles.category_id`  *(from `20260509d_admin_panel_v4.sql`)*

### `public.locales`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.locale_strings.locale_code`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.moderation_rules`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.moderation_queue.rule_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.onboarding_flows`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.onboarding_steps.flow_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.user_onboarding_state.flow_id`  *(from `20260509d_admin_panel_v4.sql`)*

### `public.onboarding_templates`  _(referenced by 1 FK)_

**`ON DELETE NO ACTION` — 1 FK(s):**
- `public.onboarding_runs.template_id`  *(from `20260514e_people.sql`)*

### `public.projects`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.tasks.project_id`  *(from `20260514d_tasks.sql`)*

### `public.prompt_library`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.prompt_versions.prompt_id`  *(from `20260509c_admin_panel_v3.sql`)*

### `public.subscription_tiers`  _(referenced by 1 FK)_

**`ON DELETE NO ACTION` — 1 FK(s):**
- `public.subscriptions.tier_id`  *(from `20260427_tiers_and_files.sql`)*

### `public.support_tickets`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.support_messages.ticket_id`  *(from `20260509d_admin_panel_v4.sql`)*

### `public.surveys`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.survey_responses.survey_id`  *(from `20260509d_admin_panel_v4.sql`)*

### `public.tags`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.entity_tags.tag_id`  *(from `20260514c_collab_primitives.sql`)*

### `public.tasks`  _(referenced by 1 FK)_

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.tasks.parent_task_id`  *(from `20260514d_tasks.sql`)*

### `public.time_off_policies`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.time_off_balances.policy_id`  *(from `20260514e_people.sql`)*

**`ON DELETE NO ACTION` — 1 FK(s):**
- `public.time_off_requests.policy_id`  *(from `20260514e_people.sql`)*

### `public.toshare_links`  _(referenced by 2 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.toshare_events.link_id`  *(from `20260502_toshare_links.sql`)*
- `public.toshare_webhook_deliveries.link_id`  *(from `20260502_toshare_webhook_log.sql`)*

### `public.webhook_endpoints`  _(referenced by 1 FK)_

**`ON DELETE CASCADE` — 1 FK(s):**
- `public.webhook_deliveries_v2.endpoint_id`  *(from `20260509b_admin_panel_v2.sql`)*

### `public.workspace_files`  _(referenced by 3 FKs)_

**`ON DELETE CASCADE` — 2 FK(s):**
- `public.workspace_file_favorites.file_id`  *(from `20260429_files_favorites.sql`)*
- `public.workspace_file_shares.file_id`  *(from `20260429_workspace_file_shares.sql`)*

**`ON DELETE SET NULL` — 1 FK(s):**
- `public.crm_inventory_items.image_id`  *(from `20260428_crm_foundation.sql`)*

### `public.workspaces`  _(referenced by 64 FKs)_

**`ON DELETE CASCADE` — 53 FK(s):**
- `public.agent_conversation_messages.workspace_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_credit_balances.workspace_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_credit_events.workspace_id`  *(from `20260429_agent_credits.sql`)*
- `public.agent_pending_approvals.workspace_id`  *(from `20260429_agent_permissions.sql`)*
- `public.agent_permissions.workspace_id`  *(from `20260429_agent_permissions.sql`)*
- `public.agent_personas.workspace_id`  *(from `20260429_agent_personas.sql`)*
- `public.agent_telegram_link_codes.workspace_id`  *(from `20260429_agent_telegram_links.sql`)*
- `public.agent_telegram_links.workspace_id`  *(from `20260429_agent_telegram_links.sql`)*
- `public.agent_whatsapp_link_codes.workspace_id`  *(from `20260429_agent_whatsapp_links.sql`)*
- `public.agent_whatsapp_links.workspace_id`  *(from `20260429_agent_whatsapp_links.sql`)*
- `public.api_tokens.workspace_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.brand_configs.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.chat_channels.workspace_id`  *(from `20260428_chat.sql`)*
- `public.chat_messages.workspace_id`  *(from `20260428_chat.sql`)*
- `public.crm_activities.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_board_records.workspace_id`  *(from `20260428_crm_boards.sql`)*
- `public.crm_board_views.workspace_id`  *(from `20260428_crm_boards.sql`)*
- `public.crm_boards.workspace_id`  *(from `20260428_crm_boards.sql`)*
- `public.crm_companies.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_contacts.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_custom_fields.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_deals.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_inventory_items.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_lead_source_events.workspace_id`  *(from `20260428_crm_lead_sources.sql`)*
- `public.crm_lead_sources.workspace_id`  *(from `20260428_crm_lead_sources.sql`)*
- `public.crm_leads.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_pipelines.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_record_tags.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_saved_views.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.crm_tags.workspace_id`  *(from `20260428_crm_foundation.sql`)*
- `public.employees.workspace_id`  *(from `20260514e_people.sql`)*
- `public.onboarding_templates.workspace_id`  *(from `20260514e_people.sql`)*
- `public.projects.workspace_id`  *(from `20260514d_tasks.sql`)*
- `public.sso_configs.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.tasks.workspace_id`  *(from `20260514d_tasks.sql`)*
- `public.time_off_policies.workspace_id`  *(from `20260514e_people.sql`)*
- `public.toshare_links.workspace_id`  *(from `20260502_toshare_links.sql`)*
- `public.toshare_webhook_deliveries.workspace_id`  *(from `20260502_toshare_webhook_log.sql`)*
- `public.webhook_endpoints.workspace_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.webhook_subscriptions.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.workspace_activity.workspace_id`  *(from `20260428_workspace_settings.sql`)*
- `public.workspace_custom_domains.workspace_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.workspace_deletion_requests.workspace_id`  *(from `20260517a_account_lifecycle.sql`)*
- `public.workspace_feature_overrides.workspace_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.workspace_file_favorites.workspace_id`  *(from `20260429_files_favorites.sql`)*
- `public.workspace_file_shares.source_workspace_id`  *(from `20260429_workspace_file_shares.sql`)*
- `public.workspace_file_shares.target_workspace_id`  *(from `20260429_workspace_file_shares.sql`)*
- `public.workspace_files.workspace_id`  *(from `20260427_tiers_and_files.sql`)*
- `public.workspace_invites.workspace_id`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspace_members.workspace_id`  *(from `20260427_workspace_sharing.sql`)*
- `public.workspace_state.workspace_id`  *(from `20260426_workspace_sync.sql`)*
- `public.workspace_storage_addons.workspace_id`  *(from `20260428_tier_caps_and_storage_addons.sql`)*
- `public.workspace_tool_grants.workspace_id`  *(from `20260428_tool_gating.sql`)*

**`ON DELETE SET NULL` — 11 FK(s):**
- `public.activity_feed.workspace_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.ai_agent_runs.workspace_id`  *(from `20260509_admin_panel_foundation.sql`)*
- `public.coupon_redemptions.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.email_sends.workspace_id`  *(from `20260509b_admin_panel_v2.sql`)*
- `public.error_events.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.funnel_events.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.invoices.workspace_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.moderation_queue.workspace_id`  *(from `20260509c_admin_panel_v3.sql`)*
- `public.refunds.workspace_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.support_tickets.workspace_id`  *(from `20260509d_admin_panel_v4.sql`)*
- `public.survey_responses.workspace_id`  *(from `20260509d_admin_panel_v4.sql`)*

---

_End of audit. Regenerate by re-running the parser in `supabase/migrations` via the script embedded at the top of `20260518e_db_scale.sql`._
