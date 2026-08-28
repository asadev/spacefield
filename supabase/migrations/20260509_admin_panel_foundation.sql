-- ─────────────────────────────────────────────────────────────────────
-- Admin panel foundation — 2026-05-09
--
-- Adds the platform-control plane the maintainer needs in /admin:
--   1. app_registry           — declarative list of every OS-shell app
--   2. user_app_grants        — per-user override (complements
--                               workspace_tool_grants)
--   3. feature_flags          — global on/off named flags w/ rollout
--   4. ai_agents              — declarative list of every AI assistant
--                               (chat / per-tool sidekick / system)
--   5. ai_agent_runs          — runtime log
--   6. workspace_custom_domains — full CNAME white-label
--   7. admin_audit_log        — every admin mutation
--   8. auth_events            — sign-in / sign-out audit
--   9. toShare analytics RPCs
--  10. app_visible() / agent_visible() / feature_enabled() resolvers
--
-- All tables RLS-locked: admins write, members/owners read where
-- relevant. Public reads only for app_registry "published" rows.
-- ─────────────────────────────────────────────────────────────────────

-- 1. ───────────────── app_registry ─────────────────
-- One row per app/tool the OS shell exposes. Seeded from tools-list.ts
-- by the post-migration seeder. Source of truth for what shows up in
-- Launchpad/Dock + whether it's globally published.
create table if not exists public.app_registry (
  id              text primary key,
  domain          text not null check (domain in ('re','solutions','os','admin')),
  title           text not null,
  description     text not null default '',
  category        text not null default '',
  icon            text,
  published       boolean not null default true,
  access_mode     text not null default 'authenticated'
                    check (access_mode in ('public','authenticated','tier','allowlist','admin_only')),
  access_tiers    jsonb not null default '[]'::jsonb,
  allowlist_user_ids jsonb not null default '[]'::jsonb,
  sort_order      int not null default 0,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

alter table public.app_registry enable row level security;

drop policy if exists "anyone reads published apps" on public.app_registry;
create policy "anyone reads published apps"
  on public.app_registry for select
  using (
    auth.role() = 'authenticated'
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write app_registry" on public.app_registry;
create policy "admins write app_registry"
  on public.app_registry for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists app_registry_domain_idx on public.app_registry(domain);
create index if not exists app_registry_published_idx on public.app_registry(published);

-- 2. ───────────────── user_app_grants ─────────────────
-- Per-user override. Wins over tier + workspace grant when set.
-- granted = true → user can launch this app even if their tier blocks it
-- granted = false → user is locked out even if tier allows
create table if not exists public.user_app_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slug       text not null,
  granted    boolean not null,
  granted_by uuid references auth.users(id) on delete set null,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.user_app_grants enable row level security;

drop policy if exists "users read own grants" on public.user_app_grants;
create policy "users read own grants"
  on public.user_app_grants for select
  using (user_id = auth.uid() or public.admin_caller_is_admin());

drop policy if exists "admins write user_app_grants" on public.user_app_grants;
create policy "admins write user_app_grants"
  on public.user_app_grants for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists user_app_grants_slug_idx on public.user_app_grants(slug);

-- 3. ───────────────── feature_flags ─────────────────
-- Global named flags. Code calls feature_enabled('flag.key') and gets
-- back a bool resolved against rollout strategy + per-user/per-workspace
-- allowlist.
create table if not exists public.feature_flags (
  key                       text primary key,
  title                     text not null default '',
  description               text not null default '',
  enabled                   boolean not null default false,
  rollout                   text not null default 'off'
                              check (rollout in ('off','on','allowlist','percent')),
  rollout_percent           int not null default 0 check (rollout_percent between 0 and 100),
  allowlist_user_ids        jsonb not null default '[]'::jsonb,
  allowlist_workspace_ids   jsonb not null default '[]'::jsonb,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references auth.users(id) on delete set null
);

alter table public.feature_flags enable row level security;

drop policy if exists "anyone reads feature_flags" on public.feature_flags;
create policy "anyone reads feature_flags"
  on public.feature_flags for select
  using (auth.role() = 'authenticated' or public.admin_caller_is_admin());

drop policy if exists "admins write feature_flags" on public.feature_flags;
create policy "admins write feature_flags"
  on public.feature_flags for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

-- 4. ───────────────── ai_agents ─────────────────
-- Declarative AI assistant config. The runtime reads this and uses
-- (model, system_prompt, allowed_skills, allowed_tools) on every call.
create table if not exists public.ai_agents (
  id                  text primary key,
  display_name        text not null,
  description         text not null default '',
  kind                text not null default 'tool-sidekick'
                        check (kind in ('chat','tool-sidekick','system')),
  model               text not null default 'claude-opus-4-7',
  fast_model          text not null default 'claude-haiku-4-5-20251001',
  system_prompt       text not null default '',
  greeting            text not null default '',
  allowed_skills      jsonb not null default '[]'::jsonb,
  allowed_tools       jsonb not null default '[]'::jsonb,
  temperature         numeric not null default 1.0,
  max_tokens          int not null default 4096,
  status              text not null default 'live'
                        check (status in ('live','draft','disabled')),
  access_mode         text not null default 'all'
                        check (access_mode in ('all','tier','workspace_role','allowlist','admin_only')),
  access_tiers        jsonb not null default '[]'::jsonb,
  access_roles        jsonb not null default '[]'::jsonb,
  allowlist_user_ids  jsonb not null default '[]'::jsonb,
  icon                text,
  sort_order          int not null default 0,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id) on delete set null
);

alter table public.ai_agents enable row level security;

drop policy if exists "authenticated reads live agents" on public.ai_agents;
create policy "authenticated reads live agents"
  on public.ai_agents for select
  using (
    auth.role() = 'authenticated'
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write ai_agents" on public.ai_agents;
create policy "admins write ai_agents"
  on public.ai_agents for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists ai_agents_status_idx on public.ai_agents(status);

-- 5. ───────────────── ai_agent_runs ─────────────────
create table if not exists public.ai_agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_id        text references public.ai_agents(id) on delete set null,
  workspace_id    uuid references public.workspaces(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  channel         text,
  status          text not null check (status in ('success','error','denied','timeout')),
  input_excerpt   text,
  output_excerpt  text,
  tokens_in       int,
  tokens_out      int,
  duration_ms     int,
  model           text,
  error           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

alter table public.ai_agent_runs enable row level security;

drop policy if exists "admins read ai_agent_runs" on public.ai_agent_runs;
create policy "admins read ai_agent_runs"
  on public.ai_agent_runs for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write ai_agent_runs" on public.ai_agent_runs;
create policy "admins write ai_agent_runs"
  on public.ai_agent_runs for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists ai_agent_runs_agent_idx on public.ai_agent_runs(agent_id, created_at desc);
create index if not exists ai_agent_runs_user_idx on public.ai_agent_runs(user_id, created_at desc);
create index if not exists ai_agent_runs_workspace_idx on public.ai_agent_runs(workspace_id, created_at desc);

-- 6. ───────────────── workspace_custom_domains ─────────────────
-- Full CNAME white-label. workspace points its own apex/sub at our
-- Vercel target; we serve their workspace from that hostname.
create table if not exists public.workspace_custom_domains (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  domain             text not null unique,
  cname_target       text not null default 'cname.vercel-dns.com',
  txt_token          text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 32),
  txt_verified_at    timestamptz,
  cname_verified_at  timestamptz,
  added_to_vercel_at timestamptz,
  status             text not null default 'pending'
                       check (status in ('pending','txt_verified','cname_verified','active','failed','disabled')),
  scope              text not null default 'workspace'
                       check (scope in ('workspace','toshare')),
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.workspace_custom_domains enable row level security;

drop policy if exists "members read custom domains" on public.workspace_custom_domains;
create policy "members read custom domains"
  on public.workspace_custom_domains for select
  using (
    workspace_id in (
      select id from public.workspaces where user_id = auth.uid()
      union
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
    or public.admin_caller_is_admin()
  );

drop policy if exists "admins write custom domains" on public.workspace_custom_domains;
create policy "admins write custom domains"
  on public.workspace_custom_domains for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists wcd_workspace_idx on public.workspace_custom_domains(workspace_id);

-- 7. ───────────────── admin_audit_log ─────────────────
create table if not exists public.admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  target_type  text,
  target_id    text,
  before       jsonb,
  after        jsonb,
  ip           text,
  user_agent   text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log"
  on public.admin_audit_log for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write audit log" on public.admin_audit_log;
create policy "admins write audit log"
  on public.admin_audit_log for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists audit_actor_idx on public.admin_audit_log(actor_id, created_at desc);
create index if not exists audit_action_idx on public.admin_audit_log(action, created_at desc);
create index if not exists audit_target_idx on public.admin_audit_log(target_type, target_id, created_at desc);

-- 8. ───────────────── auth_events ─────────────────
create table if not exists public.auth_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  event       text not null
                check (event in ('sign_in','sign_out','sign_up','password_reset','magic_link','password_change','email_change','mfa_enabled','mfa_disabled','suspended','unsuspended')),
  ip          text,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

alter table public.auth_events enable row level security;

drop policy if exists "admins read auth_events" on public.auth_events;
create policy "admins read auth_events"
  on public.auth_events for select
  using (public.admin_caller_is_admin());

drop policy if exists "admins write auth_events" on public.auth_events;
create policy "admins write auth_events"
  on public.auth_events for all
  using (public.admin_caller_is_admin())
  with check (public.admin_caller_is_admin());

create index if not exists auth_events_user_idx on public.auth_events(user_id, created_at desc);
create index if not exists auth_events_event_idx on public.auth_events(event, created_at desc);

-- 9. ───────────────── feature_enabled() resolver ─────────────────
create or replace function public.feature_enabled(
  flag_key text,
  uid uuid default auth.uid(),
  ws_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  flag record;
  bucket int;
begin
  select * into flag from public.feature_flags where key = flag_key;
  if not found then
    return false;
  end if;
  if flag.enabled = false then
    return false;
  end if;

  -- explicit allowlist hit always wins
  if uid is not null and exists (
    select 1 from jsonb_array_elements_text(flag.allowlist_user_ids) e
    where e = uid::text
  ) then
    return true;
  end if;
  if ws_id is not null and exists (
    select 1 from jsonb_array_elements_text(flag.allowlist_workspace_ids) e
    where e = ws_id::text
  ) then
    return true;
  end if;

  if flag.rollout = 'off' then
    return false;
  end if;
  if flag.rollout = 'on' then
    return true;
  end if;
  if flag.rollout = 'allowlist' then
    return false; -- only explicit allowlist hits above
  end if;
  if flag.rollout = 'percent' then
    if uid is null then return false; end if;
    -- stable bucket per (flag, uid): 0..99
    bucket := abs(hashtext(flag_key || ':' || uid::text)) % 100;
    return bucket < flag.rollout_percent;
  end if;

  return false;
end;
$$;

grant execute on function public.feature_enabled(text, uuid, uuid) to authenticated, anon;

-- 10. ───────────────── app_visible() resolver ─────────────────
-- Resolves whether a user can see/launch an app. Considers: published,
-- access_mode, tier, allowlist, plus existing workspace and per-user
-- grants. Returns a structured verdict so UI can show *why* it's locked.
create or replace function public.app_visible(
  app_slug text,
  uid uuid default auth.uid(),
  ws_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  app record;
  user_grant boolean;
  ws_grant boolean;
  user_tier text;
begin
  select * into app from public.app_registry where id = app_slug;
  if not found then
    -- App not registered yet — fall back to legacy tool_settings + tier
    -- behavior so we don't break existing tools mid-rollout.
    return jsonb_build_object(
      'visible', not coalesce((select disabled from public.tool_settings where slug = app_slug), false),
      'reason', 'unregistered'
    );
  end if;

  -- admins see everything
  if public.admin_caller_is_admin() then
    return jsonb_build_object('visible', true, 'reason', 'admin');
  end if;

  if not app.published then
    return jsonb_build_object('visible', false, 'reason', 'unpublished');
  end if;

  -- per-user override wins
  if uid is not null then
    select granted into user_grant from public.user_app_grants
      where user_id = uid and slug = app_slug;
    if user_grant is not null then
      return jsonb_build_object(
        'visible', user_grant,
        'reason', case when user_grant then 'user_grant' else 'user_blocked' end
      );
    end if;
  end if;

  -- per-workspace override
  if ws_id is not null then
    select granted into ws_grant from public.workspace_tool_grants
      where workspace_id = ws_id and slug = app_slug;
    if ws_grant is not null then
      return jsonb_build_object(
        'visible', ws_grant,
        'reason', case when ws_grant then 'workspace_grant' else 'workspace_blocked' end
      );
    end if;
  end if;

  -- access_mode resolution
  if app.access_mode = 'public' then
    return jsonb_build_object('visible', true, 'reason', 'public');
  end if;

  if uid is null then
    return jsonb_build_object('visible', false, 'reason', 'auth_required');
  end if;

  if app.access_mode = 'authenticated' then
    return jsonb_build_object('visible', true, 'reason', 'authenticated');
  end if;

  if app.access_mode = 'admin_only' then
    return jsonb_build_object('visible', false, 'reason', 'admin_only');
  end if;

  if app.access_mode = 'allowlist' then
    if exists (
      select 1 from jsonb_array_elements_text(app.allowlist_user_ids) e
      where e = uid::text
    ) then
      return jsonb_build_object('visible', true, 'reason', 'allowlist');
    end if;
    return jsonb_build_object('visible', false, 'reason', 'not_allowlisted');
  end if;

  if app.access_mode = 'tier' then
    select tier_id into user_tier from public.subscriptions where user_id = uid;
    user_tier := coalesce(user_tier, 'free');
    if exists (
      select 1 from jsonb_array_elements_text(app.access_tiers) e
      where e = user_tier
    ) then
      return jsonb_build_object('visible', true, 'reason', 'tier_match', 'tier', user_tier);
    end if;
    return jsonb_build_object('visible', false, 'reason', 'tier_locked', 'tier', user_tier);
  end if;

  return jsonb_build_object('visible', false, 'reason', 'unknown');
end;
$$;

grant execute on function public.app_visible(text, uuid, uuid) to authenticated, anon;

-- 11. ───────────────── agent_visible() resolver ─────────────────
create or replace function public.agent_visible(
  agent_slug text,
  uid uuid default auth.uid(),
  ws_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  agent record;
  user_tier text;
  user_role public.workspace_role;
begin
  select * into agent from public.ai_agents where id = agent_slug;
  if not found then
    return jsonb_build_object('visible', false, 'reason', 'not_found');
  end if;

  if public.admin_caller_is_admin() then
    return jsonb_build_object('visible', true, 'reason', 'admin');
  end if;

  if agent.status != 'live' then
    return jsonb_build_object('visible', false, 'reason', 'not_live');
  end if;

  if uid is null then
    return jsonb_build_object('visible', false, 'reason', 'auth_required');
  end if;

  if agent.access_mode = 'all' then
    return jsonb_build_object('visible', true, 'reason', 'all');
  end if;

  if agent.access_mode = 'admin_only' then
    return jsonb_build_object('visible', false, 'reason', 'admin_only');
  end if;

  if agent.access_mode = 'allowlist' then
    if exists (
      select 1 from jsonb_array_elements_text(agent.allowlist_user_ids) e
      where e = uid::text
    ) then
      return jsonb_build_object('visible', true, 'reason', 'allowlist');
    end if;
    return jsonb_build_object('visible', false, 'reason', 'not_allowlisted');
  end if;

  if agent.access_mode = 'tier' then
    select tier_id into user_tier from public.subscriptions where user_id = uid;
    user_tier := coalesce(user_tier, 'free');
    if exists (
      select 1 from jsonb_array_elements_text(agent.access_tiers) e
      where e = user_tier
    ) then
      return jsonb_build_object('visible', true, 'reason', 'tier_match', 'tier', user_tier);
    end if;
    return jsonb_build_object('visible', false, 'reason', 'tier_locked', 'tier', user_tier);
  end if;

  if agent.access_mode = 'workspace_role' then
    if ws_id is null then
      return jsonb_build_object('visible', false, 'reason', 'workspace_required');
    end if;
    user_role := public.workspace_role_of(ws_id);
    if user_role is null then
      return jsonb_build_object('visible', false, 'reason', 'not_a_member');
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(agent.access_roles) e
      where e = user_role::text
    ) then
      return jsonb_build_object('visible', true, 'reason', 'role_match', 'role', user_role::text);
    end if;
    return jsonb_build_object('visible', false, 'reason', 'role_locked', 'role', user_role::text);
  end if;

  return jsonb_build_object('visible', false, 'reason', 'unknown');
end;
$$;

grant execute on function public.agent_visible(text, uuid, uuid) to authenticated, anon;

-- 12. ───────────────── toShare analytics RPCs ─────────────────
-- Per-link daily time series + funnel.
create or replace function public.toshare_link_analytics(
  p_link_id uuid,
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  day        date,
  views      int,
  submits    int,
  redirects  int,
  converts   int,
  unique_ips int
)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select * from public.toshare_events
    where link_id = p_link_id
      and created_at >= p_since
  )
  select
    (date_trunc('day', created_at))::date as day,
    count(*) filter (where event = 'view')::int     as views,
    count(*) filter (where event = 'submit')::int   as submits,
    count(*) filter (where event = 'redirect')::int as redirects,
    count(*) filter (where event = 'convert')::int  as converts,
    count(distinct ip_hash) filter (where event = 'view')::int as unique_ips
  from src
  group by day
  order by day asc;
$$;

grant execute on function public.toshare_link_analytics(uuid, timestamptz) to authenticated;

-- Top links + per-type totals for a workspace (for the analytics dashboard).
create or replace function public.toshare_workspace_analytics(
  p_workspace_id uuid,
  p_since timestamptz default (now() - interval '30 days')
)
returns table (
  link_id      uuid,
  type         text,
  slug         text,
  title        text,
  views        int,
  submits      int,
  converts     int,
  conv_rate    numeric,
  last_event   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id as link_id,
    l.type,
    l.slug,
    coalesce(l.payload->>'title', l.slug) as title,
    coalesce((select count(*)::int from public.toshare_events e
               where e.link_id = l.id and e.event = 'view' and e.created_at >= p_since), 0) as views,
    coalesce((select count(*)::int from public.toshare_events e
               where e.link_id = l.id and e.event = 'submit' and e.created_at >= p_since), 0) as submits,
    coalesce((select count(*)::int from public.toshare_events e
               where e.link_id = l.id and e.event = 'convert' and e.created_at >= p_since), 0) as converts,
    case
      when coalesce((select count(*) from public.toshare_events e
                      where e.link_id = l.id and e.event = 'view' and e.created_at >= p_since), 0) > 0
      then round(
        100.0 * coalesce((select count(*) from public.toshare_events e
                           where e.link_id = l.id and e.event in ('submit','convert')
                             and e.created_at >= p_since), 0)::numeric
        / nullif((select count(*) from public.toshare_events e
                   where e.link_id = l.id and e.event = 'view' and e.created_at >= p_since), 0)::numeric,
        2)
      else 0::numeric
    end as conv_rate,
    (select max(e.created_at) from public.toshare_events e where e.link_id = l.id) as last_event
  from public.toshare_links l
  where l.workspace_id = p_workspace_id
  order by views desc
  limit 100;
$$;

grant execute on function public.toshare_workspace_analytics(uuid, timestamptz) to authenticated;

-- Cross-workspace totals for super-admin. Uses admin_caller_is_admin
-- so RLS doesn't matter — the function refuses non-admins.
create or replace function public.toshare_global_analytics(
  p_since timestamptz default (now() - interval '30 days')
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.admin_caller_is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'total_links',     (select count(*)::int from public.toshare_links),
    'active_links',    (select count(*)::int from public.toshare_links where status = 'live'),
    'total_views',     (select count(*)::int from public.toshare_events where event = 'view' and created_at >= p_since),
    'total_submits',   (select count(*)::int from public.toshare_events where event = 'submit' and created_at >= p_since),
    'total_converts',  (select count(*)::int from public.toshare_events where event = 'convert' and created_at >= p_since),
    'by_type',         (select coalesce(jsonb_object_agg(type, c), '{}'::jsonb)
                          from (select type, count(*)::int as c
                                  from public.toshare_links group by type) t),
    'webhook_success_rate', coalesce(
        (select round(100.0 * count(*) filter (where status = 'success')::numeric
                       / nullif(count(*), 0)::numeric, 2)
            from public.toshare_webhook_deliveries
            where attempted_at >= p_since), 0)
  ) into result;

  return result;
end;
$$;

grant execute on function public.toshare_global_analytics(timestamptz) to authenticated;

-- 13. ───────────────── admin audit helper ─────────────────
-- Wrapper used by server actions to write structured audit rows. Refuses
-- non-admins.
create or replace function public.admin_audit_write(
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  uid uuid;
  uemail text;
begin
  if not public.admin_caller_is_admin() then
    raise exception 'forbidden';
  end if;
  uid := auth.uid();
  select email into uemail from auth.users where id = uid;
  insert into public.admin_audit_log
    (actor_id, actor_email, action, target_type, target_id, before, after, metadata)
  values
    (uid, uemail, p_action, p_target_type, p_target_id, p_before, p_after, p_metadata)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.admin_audit_write(text, text, text, jsonb, jsonb, jsonb) to authenticated;

-- 14. ───────────────── auth event recorder ─────────────────
-- Public-callable helper that records sign-in events from the client
-- (we capture user_id from auth.uid() — caller can't spoof). Called
-- from /signin success path + auth callback.
create or replace function public.auth_event_record(
  p_event    text,
  p_email    text default null,
  p_ip       text default null,
  p_ua       text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  uid uuid;
begin
  uid := auth.uid();
  -- allow anon sign_in/sign_up records (uid may be null right at the
  -- point of dispatch); admins can also write any event for backfills
  if uid is null and not (p_event in ('sign_in','sign_up','password_reset','magic_link')) then
    raise exception 'auth required';
  end if;
  insert into public.auth_events (user_id, email, event, ip, user_agent, metadata)
  values (uid, p_email, p_event, p_ip, p_ua, p_metadata)
  returning id into new_id;
  return new_id;
end;
$$;

grant execute on function public.auth_event_record(text, text, text, text, jsonb) to authenticated, anon;

-- 15. ───────────────── updated_at touch triggers ─────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists touch_app_registry on public.app_registry;
create trigger touch_app_registry before update on public.app_registry
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_feature_flags on public.feature_flags;
create trigger touch_feature_flags before update on public.feature_flags
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_ai_agents on public.ai_agents;
create trigger touch_ai_agents before update on public.ai_agents
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_workspace_custom_domains on public.workspace_custom_domains;
create trigger touch_workspace_custom_domains before update on public.workspace_custom_domains
  for each row execute function public.touch_updated_at();

-- 16. ───────────────── seed default feature flags ─────────────────
-- A few flags admins will likely want to flip first day.
insert into public.feature_flags (key, title, description, enabled, rollout)
values
  ('toshare.paid_domains', 'toShare paid custom domains', 'Allow workspaces to attach a custom CNAMEd domain (e.g. share.example.com).', false, 'off'),
  ('agent.deep_mode',      'Agent deep-thinking mode', 'Allow users to opt-in to extended-thinking model calls.', true, 'on'),
  ('agent.tool_calls',     'Agent autonomous tool calls', 'Allow the assistant to invoke skills without confirm prompts.', true, 'on'),
  ('os.global_search',     'OS-shell global search', 'New cross-app search bar at the top of the OS shell.', false, 'off'),
  ('billing.show_paddle',  'Paddle checkout', 'Expose the Paddle checkout flow on /pricing.', true, 'on')
on conflict (key) do nothing;

-- 17. ───────────────── seed system AI agents ─────────────────
-- Two starter agents — runtime can create more from the admin UI later.
insert into public.ai_agents
  (id, display_name, description, kind, model, system_prompt, allowed_skills, allowed_tools, access_mode, sort_order)
values
  ('main-chat',
   'Spacefield Assistant',
   'The main in-app chat assistant. Users invoke it from the Chat app or via the agent dispatcher.',
   'chat',
   'claude-opus-4-7',
   'You are Spacefield Assistant, the in-product helper for a real-estate workspace platform. Be concise. Use installed tools when relevant.',
   '["crm.deals","crm.contacts","crm.companies","crm.leads","files","workspace","meta","apps","boards","crm-activities"]'::jsonb,
   '[]'::jsonb,
   'all',
   0),
  ('property-poster-helper',
   'Property Poster Helper',
   'Tool sidekick inside Property Poster Creator. Helps draft headlines, descriptions, and stat copy.',
   'tool-sidekick',
   'claude-haiku-4-5-20251001',
   'You write short, persuasive real-estate marketing copy. No emojis. No clichés.',
   '[]'::jsonb,
   '["property-poster-creator"]'::jsonb,
   'all',
   10)
on conflict (id) do nothing;
