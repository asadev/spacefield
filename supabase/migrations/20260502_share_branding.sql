-- ─────────────────────────────────────────────────────────────────────────
-- Share workspace branding defaults.
--
-- Every minted link inherits the workspace's logo (existing avatar_url)
-- and a new share_brand_color when the link's own payload doesn't
-- specify one. This means every form / page / quote / booking the
-- workspace publishes has consistent branding without per-link config.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workspaces
  add column if not exists share_brand_color text;

-- Validation: 7-char hex (#RRGGBB) only, or null
alter table public.workspaces
  drop constraint if exists workspaces_share_brand_color_format;

alter table public.workspaces
  add constraint workspaces_share_brand_color_format
  check (share_brand_color is null or share_brand_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.workspaces.share_brand_color is
  'Default accent color (e.g. #0ea5e9) applied to share.example.com links minted from this workspace when the link payload does not specify its own brandColor.';
