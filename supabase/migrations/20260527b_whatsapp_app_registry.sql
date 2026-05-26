-- ─────────────────────────────────────────────────────────────────────
-- 20260527b_whatsapp_app_registry.sql — register WhatsApp in app_registry
--
-- Spacefield's app catalog is public.app_registry (added in
-- 20260509_admin_panel_foundation.sql). To make the WhatsApp app
-- discoverable by Launchpad, the OS shell, and the per-tier/per-user
-- grant resolvers we need a row in that table.
--
-- access_mode = 'tier' + access_tiers = ['pro'] enforces the Pro-only
-- gate at the app_registry layer; the server-side API routes also
-- enforce isPro() defence-in-depth.
--
-- published = false on purpose — we want to ship the rows live but
-- keep the app dark by default; admin flips the flag per-rollout.
-- (Map the contract field `enabled_by_default=false` onto
-- `published=false`. The registry has no separate "default-on" flag.)
--
-- metadata.tier_gate = 'pro' is denormalised for client-side reads
-- that don't want to inspect access_tiers.
--
-- Idempotency: on-conflict upsert keyed on `id`.
--
-- Rollback (manual):
--   delete from public.app_registry where id = 'whatsapp';
-- ─────────────────────────────────────────────────────────────────────

insert into public.app_registry
  (id, domain, title, description, category, icon, published,
   access_mode, access_tiers, sort_order, metadata)
values (
  'whatsapp',
  'solutions',
  'WhatsApp',
  'Pair your shop WhatsApp number and send/receive inside Spacefield with throttling and CRM auto-link',
  'communication',
  'message-circle',
  false,
  'tier',
  '["pro"]'::jsonb,
  150,
  jsonb_build_object(
    'tier_gate',          'pro',
    'enabled_by_default', false,
    'slug',               'whatsapp',
    'integration',        'evolution-api',
    'feature_flag',       'whatsapp_app'
  )
)
on conflict (id) do update set
  title        = excluded.title,
  description  = excluded.description,
  category     = excluded.category,
  icon         = excluded.icon,
  access_mode  = excluded.access_mode,
  access_tiers = excluded.access_tiers,
  metadata     = public.app_registry.metadata
                   || excluded.metadata;
