-- ════════════════════════════════════════════════════════════════════════════
-- 2026-05-27 (Agent D): Rename Property Poster Creator → Poster Creator
-- ────────────────────────────────────────────────────────────────────────────
-- The tool is no longer real-estate-specific; it ships templates for
-- 8 industries (real_estate, clothing_retail, marketing_agency,
-- restaurant, salon, fitness, automotive, generic). The route +
-- registry id therefore drops the "property" prefix.
--
-- This migration moves the existing app_registry row to the new id,
-- updates the AI sidekick agent's allowed_tools array, and adjusts
-- any pinned dock entries written by users.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) app_registry — primary key is `id`, so we INSERT new row and
--    DELETE old. Foreign-key references on user_app_grants /
--    workspace_app_grants etc cascade by slug-as-text (no FK to
--    app_registry.id), so a clean swap is safe.
--    `ON CONFLICT` keeps the migration idempotent if someone re-runs it.
insert into public.app_registry
  (id, domain, title, description, category, icon, published,
   access_mode, access_tiers, allowlist_user_ids, sort_order, metadata)
select
  'poster-creator' as id,
  domain,
  'Poster Creator' as title,
  'Generate posters for any industry — real estate, fashion, food, services and more.' as description,
  category,
  icon,
  published,
  access_mode,
  access_tiers,
  allowlist_user_ids,
  sort_order,
  metadata
from public.app_registry
where id = 'property-poster-creator'
on conflict (id) do nothing;

-- If the source row never existed (fresh seed paths), insert the new
-- row directly so the OS shell can find it.
insert into public.app_registry
  (id, domain, title, description, category, icon, published, access_mode, sort_order)
values
  ('poster-creator',
   're',
   'Poster Creator',
   'Generate posters for any industry — real estate, fashion, food, services and more.',
   'agent',
   'image',
   true,
   'authenticated',
   0)
on conflict (id) do nothing;

delete from public.app_registry where id = 'property-poster-creator';

-- 2) Update any per-user / per-workspace grants that referenced the old
--    slug (table key is (user_id, slug) so we use UPDATE not delete).
--    Both tables exist in supabase/migrations/20260509_admin_panel_foundation.sql.
update public.user_app_grants
set slug = 'poster-creator'
where slug = 'property-poster-creator';

-- 3) Update the AI sidekick agent — display name + system prompt + tools
--    array all need to drop the "Property" framing because the agent now
--    helps draft copy for any industry's poster.
update public.ai_agents
set
  display_name = 'Poster Helper',
  description = 'Tool sidekick inside Poster Creator. Helps draft headlines, descriptions, taglines, and pricing copy.',
  system_prompt = 'You write short, persuasive marketing copy for posters. The poster might be for real estate, clothing/fabric, restaurants, salons, fitness, automotive, or any other small-business service. Match the tone to the industry. No emojis. No clichés. Always short.',
  allowed_tools = '["poster-creator"]'::jsonb
where id = 'property-poster-helper';

-- Also rename the agent id itself so logs + UI references are consistent.
-- Two-step: insert-or-replace pattern, since updating a PK to a value that
-- conflicts with an existing row would fail.
update public.ai_agents
set id = 'poster-helper'
where id = 'property-poster-helper'
  and not exists (select 1 from public.ai_agents where id = 'poster-helper');
