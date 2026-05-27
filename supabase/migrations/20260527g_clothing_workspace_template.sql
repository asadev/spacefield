-- Insert the Clothing & Fashion Retail workspace template row.
--
-- The template body lives in lib/workflows/seed-templates.ts (Agent E,
-- 2026-05-27), but the DB header row in public.workspace_templates was
-- never created — so users picking "Clothing & Fashion Retail" at
-- workspace creation got nothing. Caught by Agent M's verification pass.
--
-- Idempotent: ON CONFLICT keeps the apply-time RPC's body shape stable
-- if the row already exists (in prod we already applied this via the
-- Management API on 2026-05-27 ahead of merging the file).
--
-- The body is intentionally empty `{}`. The apply path reads the rich
-- pipeline / inventory / tags / lead-sources from seed-templates.ts;
-- the DB row only carries the visible header (name, industry, icon,
-- description) so the workspace-creation picker lists it.

insert into public.workspace_templates
  (slug, name, industry, description, icon, body, enabled)
values (
  'clothing-retail',
  'Clothing & Fashion Retail',
  'clothing_retail',
  'Boutique, apparel, fabric, fashion accessories — works for any clothing business, any country, any currency. Sales pipeline + customer tags + inventory categories tuned for fashion retail.',
  'shopping-bag',
  '{}'::jsonb,
  true
)
on conflict (slug) do update set
  name        = excluded.name,
  industry    = excluded.industry,
  description = excluded.description,
  icon        = excluded.icon,
  enabled     = true,
  updated_at  = now();
