-- ─────────────────────────────────────────────────────────────────────────
-- toShare link system — universal mint/host/track for any tool's output.
--
-- Domain: toshare.net (separate from spacefield.io for reputation isolation).
-- Patterns:
--   - Free  : toshare.net/<type>/<slug>           (e.g. /f/abc123, /p/xyz)
--   - Paid  : <workspace>.toshare.net/<slug>      (custom subdomain)
--   - Vanity: toshare.net/<type>/<custom-slug>    (paid only)
--
-- Types (`link_type`):
--   form    — embeddable form (lead capture, RSVP, inquiry)
--   page    — hosted content page (property, profile, project showcase)
--   quote   — sales offer / quote / proposal
--   booking — scheduling / booking page
--   redirect— vanity short-link to an external URL
--   file    — temporary signed-file share
--
-- Payload is JSONB for forward compat — each tool stores its render-time
-- payload there and the viewer route knows how to render it by `type`.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── core link table ─────────────────────────────────────────────────────
create table if not exists public.toshare_links (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references public.workspaces(id) on delete cascade,
  owner_user_id   uuid references auth.users(id) on delete set null,
  type            text not null check (type in ('form','page','quote','booking','redirect','file')),
  slug            text not null,
  custom_subdomain text,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'active' check (status in ('active','paused','expired','disabled')),
  view_count      integer not null default 0,
  submit_count    integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz,
  source_tool     text,
  unique (slug, custom_subdomain)
);

create index if not exists toshare_links_workspace_idx on public.toshare_links (workspace_id, created_at desc);
create index if not exists toshare_links_owner_idx     on public.toshare_links (owner_user_id, created_at desc);
create index if not exists toshare_links_subdomain_idx on public.toshare_links (custom_subdomain) where custom_subdomain is not null;
create index if not exists toshare_links_active_idx    on public.toshare_links (slug) where status = 'active';

-- ── event log (views + submissions) ─────────────────────────────────────
create table if not exists public.toshare_events (
  id          bigserial primary key,
  link_id     uuid not null references public.toshare_links(id) on delete cascade,
  event       text not null check (event in ('view','submit','redirect','convert')),
  ip_hash     text,
  ua_hash     text,
  referrer    text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists toshare_events_link_idx on public.toshare_events (link_id, created_at desc);

-- ── slug minting RPC (atomic) ───────────────────────────────────────────
-- Generates a 7-char URL-safe slug, retries on collision, returns the row.
create or replace function public.toshare_mint(
  p_workspace_id   uuid,
  p_owner_user_id  uuid,
  p_type           text,
  p_payload        jsonb,
  p_source_tool    text default null,
  p_custom_slug    text default null,
  p_custom_subdomain text default null,
  p_expires_at     timestamptz default null
)
returns public.toshare_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_row  public.toshare_links;
  v_alphabet text := 'abcdefghijkmnpqrstuvwxyz23456789';  -- no 0,o,1,l,i ambiguity
  v_attempts int := 0;
begin
  if p_type not in ('form','page','quote','booking','redirect','file') then
    raise exception 'invalid link type: %', p_type;
  end if;

  if p_custom_slug is not null then
    if not p_custom_slug ~ '^[a-z0-9-]{3,40}$' then
      raise exception 'custom slug must be 3-40 chars, [a-z0-9-]';
    end if;
    v_slug := p_custom_slug;
  else
    loop
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'could not generate unique slug after 10 attempts';
      end if;
      v_slug := '';
      for i in 1..7 loop
        v_slug := v_slug || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
      exit when not exists (
        select 1 from public.toshare_links
        where slug = v_slug
          and (custom_subdomain is null and p_custom_subdomain is null
               or custom_subdomain = p_custom_subdomain)
      );
    end loop;
  end if;

  insert into public.toshare_links
    (workspace_id, owner_user_id, type, slug, custom_subdomain, payload, source_tool, expires_at)
  values
    (p_workspace_id, p_owner_user_id, p_type, v_slug, p_custom_subdomain, p_payload, p_source_tool, p_expires_at)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── view counter RPC (lock-free, fire-and-forget from edge) ─────────────
create or replace function public.toshare_record_view(
  p_slug      text,
  p_subdomain text,
  p_ip_hash   text,
  p_ua_hash   text,
  p_referrer  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_id uuid;
begin
  update public.toshare_links
     set view_count = view_count + 1,
         updated_at = now()
   where slug = p_slug
     and (
       (custom_subdomain is null and p_subdomain is null)
       or custom_subdomain = p_subdomain
     )
     and status = 'active'
     and (expires_at is null or expires_at > now())
  returning id into v_link_id;

  if v_link_id is not null then
    insert into public.toshare_events (link_id, event, ip_hash, ua_hash, referrer)
    values (v_link_id, 'view', p_ip_hash, p_ua_hash, p_referrer);
  end if;

  return v_link_id;
end;
$$;

-- ── submit recorder RPC ─────────────────────────────────────────────────
create or replace function public.toshare_record_submit(
  p_link_id   uuid,
  p_payload   jsonb,
  p_ip_hash   text,
  p_ua_hash   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.toshare_links
     set submit_count = submit_count + 1,
         updated_at = now()
   where id = p_link_id;

  insert into public.toshare_events (link_id, event, ip_hash, ua_hash, payload)
  values (p_link_id, 'submit', p_ip_hash, p_ua_hash, p_payload);
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.toshare_links  enable row level security;
alter table public.toshare_events enable row level security;

-- owners + workspace members can read their own links
create policy "toshare_links_read_own"
  on public.toshare_links for select
  using (
    auth.uid() = owner_user_id
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- owners can update / pause / disable
create policy "toshare_links_update_own"
  on public.toshare_links for update
  using (
    auth.uid() = owner_user_id
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- inserts go through the mint RPC (security definer), so no direct insert policy
-- delete only by owner
create policy "toshare_links_delete_own"
  on public.toshare_links for delete
  using (
    auth.uid() = owner_user_id
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- events readable by link owner / workspace
create policy "toshare_events_read_own"
  on public.toshare_events for select
  using (
    link_id in (
      select id from public.toshare_links
       where auth.uid() = owner_user_id
          or workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
    )
  );

grant execute on function public.toshare_mint           to authenticated;
grant execute on function public.toshare_record_view    to anon, authenticated;
grant execute on function public.toshare_record_submit  to anon, authenticated;

comment on table public.toshare_links is 'Universal link/share registry served from toshare.net. Each row backs one public URL minted by some tool.';
comment on table public.toshare_events is 'Per-link view/submit/convert events for analytics. Append-only.';
