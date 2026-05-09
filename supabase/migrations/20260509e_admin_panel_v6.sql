-- ─────────────────────────────────────────────────────────────────────
-- Admin panel v6 — 2026-05-09 (zero-technical-dependency upgrades)
--
-- Tables:
--   1. admin_roles            — named permission bundles
--   2. admin_role_permissions — role × (resource, action) grid
--   3. user_admin_roles       — assign roles to users
--   4. runtime_config         — env-like config readable at runtime
--   5. admin_pages            — custom admin pages (admin-defined)
--   6. admin_page_blocks      — blocks inside an admin_page
--
-- Extends:
--   - has_permission(user_id, resource, action) RPC
--   - get_runtime_config(key) RPC
--   - admin_caller_is_admin() unchanged (backwards-compat)
--   - admin_caller_can(resource, action) NEW resource-aware admin gate
-- ─────────────────────────────────────────────────────────────────────

-- 1. admin_roles
create table if not exists public.admin_roles (
  id                  text primary key,
  display_name        text not null,
  description         text not null default '',
  is_system_default   boolean not null default false,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);

alter table public.admin_roles enable row level security;
drop policy if exists "admins all admin_roles" on public.admin_roles;
create policy "admins all admin_roles" on public.admin_roles for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 2. admin_role_permissions
create table if not exists public.admin_role_permissions (
  role_id    text not null references public.admin_roles(id) on delete cascade,
  resource   text not null,
  action     text not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (role_id, resource, action)
);

alter table public.admin_role_permissions enable row level security;
drop policy if exists "admins all admin_role_permissions" on public.admin_role_permissions;
create policy "admins all admin_role_permissions" on public.admin_role_permissions for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 3. user_admin_roles
create table if not exists public.user_admin_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role_id    text not null references public.admin_roles(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, role_id)
);

alter table public.user_admin_roles enable row level security;
drop policy if exists "user reads own roles" on public.user_admin_roles;
create policy "user reads own roles" on public.user_admin_roles for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());
drop policy if exists "admins write user_admin_roles" on public.user_admin_roles;
create policy "admins write user_admin_roles" on public.user_admin_roles for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists user_admin_roles_user_idx on public.user_admin_roles (user_id);

-- 4. runtime_config
create table if not exists public.runtime_config (
  key           text primary key,
  value         jsonb not null default 'null'::jsonb,
  value_type    text not null default 'string'
                  check (value_type in ('string','number','boolean','json','secret')),
  description   text not null default '',
  category      text not null default 'general',
  is_secret     boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.runtime_config enable row level security;
drop policy if exists "anyone reads non-secret config" on public.runtime_config;
create policy "anyone reads non-secret config" on public.runtime_config for select
  using (
    not is_secret
    or public.admin_caller_is_admin()
  );
drop policy if exists "admins write runtime_config" on public.runtime_config;
create policy "admins write runtime_config" on public.runtime_config for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 5. admin_pages
create table if not exists public.admin_pages (
  id            text primary key,
  title         text not null,
  description   text not null default '',
  icon          text,
  section       text not null default 'AI'
                  check (section in (
                    'AI','Apps','People','Data & Ops','Security',
                    'Communication','Experience','Money','Content','Custom')),
  layout        text not null default 'single'
                  check (layout in ('single','sidebar','grid','tabbed')),
  enabled       boolean not null default true,
  sort_order    int not null default 0,
  required_role text references public.admin_roles(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.admin_pages enable row level security;
drop policy if exists "admins all admin_pages" on public.admin_pages;
create policy "admins all admin_pages" on public.admin_pages for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 6. admin_page_blocks
create table if not exists public.admin_page_blocks (
  id            uuid primary key default gen_random_uuid(),
  page_id       text not null references public.admin_pages(id) on delete cascade,
  kind          text not null check (kind in (
                  'kpi','table','chart','markdown','button','iframe','form','divider')),
  title         text,
  config        jsonb not null default '{}'::jsonb,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.admin_page_blocks enable row level security;
drop policy if exists "admins all admin_page_blocks" on public.admin_page_blocks;
create policy "admins all admin_page_blocks" on public.admin_page_blocks for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists admin_page_blocks_page_idx on public.admin_page_blocks (page_id, sort_order);

-- ─── permission RPCs ───
create or replace function public.has_permission(
  uid uuid,
  p_resource text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Super-admins via legacy is_admin flag always pass.
  select coalesce(
    (select is_admin from public.profiles where user_id = uid),
    false
  )
  or exists (
    select 1
    from public.user_admin_roles ur
    join public.admin_role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = uid
      and (ur.expires_at is null or ur.expires_at > now())
      and rp.resource = p_resource
      and rp.action = p_action
  );
$$;

grant execute on function public.has_permission(uuid, text, text) to authenticated;

-- Resource-aware admin caller check. Admin layouts continue to use
-- admin_caller_is_admin for back-compat; new mutation paths can call
-- admin_caller_can('users','update') for fine-grained gates.
create or replace function public.admin_caller_can(p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_resource, p_action);
$$;

grant execute on function public.admin_caller_can(text, text) to authenticated;

-- ─── runtime_config helpers ───
create or replace function public.get_runtime_config(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.is_secret and not public.admin_caller_is_admin() then null
    else r.value
  end
  from public.runtime_config r
  where r.key = p_key;
$$;

grant execute on function public.get_runtime_config(text) to authenticated, anon;

-- ─── seed default roles ───
insert into public.admin_roles (id, display_name, description, is_system_default)
values
  ('super-admin', 'Super admin',     'Full access. Equivalent to legacy profiles.is_admin=true.', true),
  ('support',     'Support agent',   'Read users + workspaces, manage support tickets, send password resets.', true),
  ('billing',     'Billing',         'Refunds, invoices, subscriptions, tiers — money operations.', true),
  ('content-mod', 'Content moderator', 'Moderation queue, banners, announcements, social posts.', true),
  ('developer',   'Developer',       'AI agents/skills/tools/models/providers + database + runtime_config.', true),
  ('analyst',     'Analyst',         'Read-only across logs, audit, analytics, insights, errors.', true)
on conflict (id) do nothing;

-- Seed permission matrix for the default roles
insert into public.admin_role_permissions (role_id, resource, action)
values
  -- super-admin: gets implicit grant via is_admin fallback. We still
  -- record a wildcard row so the UI can show the role as "all access".
  ('super-admin', '*', '*'),

  -- support
  ('support', 'users',      'read'),
  ('support', 'users',      'update'),
  ('support', 'workspaces', 'read'),
  ('support', 'support',    'read'),
  ('support', 'support',    'update'),
  ('support', 'audit',      'read'),
  ('support', 'auth_events','read'),

  -- billing
  ('billing', 'subscriptions','read'),
  ('billing', 'subscriptions','update'),
  ('billing', 'tiers',        'read'),
  ('billing', 'tiers',        'update'),
  ('billing', 'refunds',      'read'),
  ('billing', 'refunds',      'update'),
  ('billing', 'invoices',     'read'),
  ('billing', 'invoices',     'update'),
  ('billing', 'coupons',      'read'),
  ('billing', 'coupons',      'update'),

  -- content-mod
  ('content-mod', 'moderation',  'read'),
  ('content-mod', 'moderation',  'update'),
  ('content-mod', 'banners',     'read'),
  ('content-mod', 'banners',     'update'),
  ('content-mod', 'announcements','read'),
  ('content-mod', 'announcements','update'),
  ('content-mod', 'social',      'read'),
  ('content-mod', 'social',      'update'),

  -- developer
  ('developer', 'agents',         'read'),
  ('developer', 'agents',         'update'),
  ('developer', 'skills',         'read'),
  ('developer', 'skills',         'update'),
  ('developer', 'tools',          'read'),
  ('developer', 'tools',          'update'),
  ('developer', 'models',         'read'),
  ('developer', 'models',         'update'),
  ('developer', 'providers',      'read'),
  ('developer', 'providers',      'update'),
  ('developer', 'workflows',      'read'),
  ('developer', 'workflows',      'update'),
  ('developer', 'prompts',        'read'),
  ('developer', 'prompts',        'update'),
  ('developer', 'database',       'read'),
  ('developer', 'database',       'update'),
  ('developer', 'runtime_config', 'read'),
  ('developer', 'runtime_config', 'update'),
  ('developer', 'eval',           'read'),
  ('developer', 'eval',           'update'),

  -- analyst (read-only)
  ('analyst', 'logs',         'read'),
  ('analyst', 'audit',        'read'),
  ('analyst', 'analytics',    'read'),
  ('analyst', 'insights',     'read'),
  ('analyst', 'errors',       'read'),
  ('analyst', 'auth_events',  'read'),
  ('analyst', 'funnels',      'read'),
  ('analyst', 'cohorts',      'read'),
  ('analyst', 'surveys',      'read')
on conflict (role_id, resource, action) do nothing;

-- ─── seed runtime config defaults ───
insert into public.runtime_config (key, value, value_type, description, category)
values
  ('agent.default_temperature', '1.0'::jsonb,        'number',  'Default temperature for new agents.', 'ai'),
  ('agent.default_max_tokens',  '4096'::jsonb,       'number',  'Default max_tokens for new agents.',  'ai'),
  ('agent.cooldown_seconds',    '0'::jsonb,          'number',  'Forced delay between calls per user.', 'ai'),
  ('webhook.default_timeout_ms','5000'::jsonb,       'number',  'Default webhook delivery timeout.', 'integrations'),
  ('webhook.max_retries',       '3'::jsonb,          'number',  'Default webhook retry count.', 'integrations'),
  ('toshare.default_brand_color', '"#3b82f6"'::jsonb, 'string', 'Default toShare link accent color.', 'toshare'),
  ('feature.show_pricing_page', 'true'::jsonb,       'boolean', 'Show /pricing publicly.', 'site'),
  ('site.support_email',        '"contact@spacefield.co"'::jsonb, 'string', 'Email shown in footer + auth.', 'site')
on conflict (key) do nothing;

-- ─── triggers ───
drop trigger if exists touch_admin_roles on public.admin_roles;
create trigger touch_admin_roles before update on public.admin_roles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_runtime_config on public.runtime_config;
create trigger touch_runtime_config before update on public.runtime_config
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_pages on public.admin_pages;
create trigger touch_admin_pages before update on public.admin_pages
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_admin_page_blocks on public.admin_page_blocks;
create trigger touch_admin_page_blocks before update on public.admin_page_blocks
  for each row execute function public.touch_updated_at();
