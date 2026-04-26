-- Workspace sharing: members + invites + role-based RLS
-- 2026-04-27
--
-- Roles:
--   owner   — creator, full control. Can delete the workspace, transfer
--             ownership, manage all members.
--   admin   — can invite + install/uninstall apps + change settings +
--             promote/demote others, but cannot delete the workspace.
--   member  — can use already-installed tools and edit shared state.
--             Cannot see App Store, cannot install apps, cannot invite.
--
-- Tables:
--   workspace_members  — who has access, with what role
--   workspace_invites  — pending invites (by email or username)
--
-- Existing tables touched:
--   workspaces         — RLS rewritten: read if member, update/delete by role
--   workspace_state    — RLS rewritten: read/write if member (any role)

-- ───────────────────────── role enum ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner', 'admin', 'member');
  end if;
end$$;

-- ───────────────────────── workspace_members ─────────────────────────
create table if not exists public.workspace_members (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          public.workspace_role not null default 'member',
  invited_by    uuid references auth.users(id) on delete set null,
  joined_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

alter table public.workspace_members enable row level security;

-- Helper: is the calling user a member of a workspace?
create or replace function public.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$;

-- Helper: get the calling user's role in a workspace (null if not a member)
create or replace function public.workspace_role_of(ws_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.is_workspace_member(uuid) to anon, authenticated;
grant execute on function public.workspace_role_of(uuid) to anon, authenticated;

-- RLS: members see their own membership rows + everyone in their workspaces
drop policy if exists "members read membership of their workspaces" on public.workspace_members;
create policy "members read membership of their workspaces"
  on public.workspace_members for select
  using (
    user_id = auth.uid()
    or workspace_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Owners + admins can add members (used internally by accept_invite RPC)
drop policy if exists "owners admins add members" on public.workspace_members;
create policy "owners admins add members"
  on public.workspace_members for insert
  with check (
    -- Either inserting yourself with role='member' (accept_invite path)
    user_id = auth.uid()
    or
    -- Or you're an owner/admin of the workspace
    public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- Owners + admins can update roles (with restrictions enforced by RPC)
drop policy if exists "owners admins update members" on public.workspace_members;
create policy "owners admins update members"
  on public.workspace_members for update
  using (public.workspace_role_of(workspace_id) in ('owner','admin'))
  with check (public.workspace_role_of(workspace_id) in ('owner','admin'));

-- Members can leave themselves; owners/admins can remove members
drop policy if exists "leave or be removed" on public.workspace_members;
create policy "leave or be removed"
  on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- ───────────────────────── workspace_invites ─────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_invite_status') then
    create type public.workspace_invite_status as enum ('pending','accepted','declined','revoked','expired');
  end if;
end$$;

create table if not exists public.workspace_invites (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  invitee_email   text,                       -- normalized lowercase
  invitee_user_id uuid references auth.users(id) on delete set null,
  role            public.workspace_role not null default 'member',
  status          public.workspace_invite_status not null default 'pending',
  token           text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  expires_at      timestamptz not null default (now() + interval '14 days')
);

create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id);
create index if not exists workspace_invites_email_idx     on public.workspace_invites (lower(invitee_email));
create index if not exists workspace_invites_user_idx      on public.workspace_invites (invitee_user_id);
create index if not exists workspace_invites_status_idx    on public.workspace_invites (status);

alter table public.workspace_invites enable row level security;

-- Inviter sees invites they sent. Invitee sees invites addressed to
-- them (by user_id OR by lowercased email matching auth.email()).
drop policy if exists "see invites I sent or received" on public.workspace_invites;
create policy "see invites I sent or received"
  on public.workspace_invites for select
  using (
    invited_by = auth.uid()
    or invitee_user_id = auth.uid()
    or lower(invitee_email) = lower((select email from auth.users where id = auth.uid()))
  );

-- Owners + admins of a workspace can create invites for it.
drop policy if exists "owners admins create invites" on public.workspace_invites;
create policy "owners admins create invites"
  on public.workspace_invites for insert
  with check (
    invited_by = auth.uid()
    and public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- Inviter (or owner/admin) can revoke; invitee can accept/decline via RPC.
-- We allow direct UPDATE only by owner/admin/inviter; accept_invite uses
-- security-definer to bypass for the invitee.
drop policy if exists "owners admins or inviter update invite" on public.workspace_invites;
create policy "owners admins or inviter update invite"
  on public.workspace_invites for update
  using (
    invited_by = auth.uid()
    or public.workspace_role_of(workspace_id) in ('owner','admin')
  );

-- ───────────────────────── workspaces RLS rewrite ─────────────────────────
-- Old policy: only owner could read/update/delete. New: any member reads,
-- only owner deletes, owner+admin update.

alter table public.workspaces enable row level security;

drop policy if exists "users own their workspaces" on public.workspaces;

drop policy if exists "members read workspace" on public.workspaces;
create policy "members read workspace"
  on public.workspaces for select
  using (
    user_id = auth.uid()
    or public.is_workspace_member(id)
  );

drop policy if exists "any user creates own workspace" on public.workspaces;
create policy "any user creates own workspace"
  on public.workspaces for insert
  with check (user_id = auth.uid());

drop policy if exists "owner admin update workspace" on public.workspaces;
create policy "owner admin update workspace"
  on public.workspaces for update
  using (public.workspace_role_of(id) in ('owner','admin'))
  with check (public.workspace_role_of(id) in ('owner','admin'));

drop policy if exists "owner deletes workspace" on public.workspaces;
create policy "owner deletes workspace"
  on public.workspaces for delete
  using (public.workspace_role_of(id) = 'owner');

-- ───────────────────────── workspace_state RLS rewrite ─────────────────────
-- All members can read + write workspace_state for any workspace they
-- belong to. Permission gating for "members can't install apps" is
-- enforced client-side + on the App Store-related state keys (the keys
-- themselves are still editable via this policy; the client UI just
-- doesn't expose the controls to non-admins).

alter table public.workspace_state enable row level security;

drop policy if exists "users access state of their workspaces" on public.workspace_state;
drop policy if exists "members access workspace state" on public.workspace_state;
create policy "members access workspace state"
  on public.workspace_state for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ───────────────────────── Backfill existing workspaces ─────────────────────
-- Every existing workspace needs an 'owner' membership row for its
-- creator. on conflict do nothing makes this idempotent.
insert into public.workspace_members (workspace_id, user_id, role, invited_by, joined_at)
select id, user_id, 'owner'::public.workspace_role, user_id, created_at
from public.workspaces
on conflict (workspace_id, user_id) do nothing;

-- ───────────────────────── Trigger: on workspace insert, add owner ─────────
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (new.id, new.user_id, 'owner', new.user_id)
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ───────────────────────── RPC: send_workspace_invite ─────────────────────
create or replace function public.send_workspace_invite(
  ws_id      uuid,
  identifier text,                                  -- email or username
  role_in    public.workspace_role default 'member'
)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.workspace_role;
  is_email    boolean;
  match_user  uuid;
  match_email text;
  invite_row  public.workspace_invites%rowtype;
begin
  caller_role := public.workspace_role_of(ws_id);
  if caller_role not in ('owner','admin') then
    raise exception 'not authorized to invite' using errcode = '42501';
  end if;

  identifier := trim(identifier);
  is_email := identifier like '%@%';

  if is_email then
    match_email := lower(identifier);
    select id into match_user from auth.users where lower(email) = match_email limit 1;
  else
    -- Treat as username — look it up in profiles.
    select p.user_id, u.email
      into match_user, match_email
      from public.profiles p
      join auth.users u on u.id = p.user_id
     where lower(p.username) = lower(identifier)
     limit 1;
    if match_user is null then
      raise exception 'no user with that username' using errcode = 'P0001';
    end if;
  end if;

  -- Already a member?
  if match_user is not null and exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = match_user
  ) then
    raise exception 'already a member' using errcode = 'P0001';
  end if;

  -- Existing pending invite? Just return it.
  select * into invite_row from public.workspace_invites
   where workspace_id = ws_id
     and status = 'pending'
     and (
       (match_user is not null and invitee_user_id = match_user)
       or (match_email is not null and lower(invitee_email) = match_email)
     )
   limit 1;
  if invite_row.id is not null then
    return invite_row;
  end if;

  insert into public.workspace_invites
    (workspace_id, invited_by, invitee_email, invitee_user_id, role)
  values (ws_id, auth.uid(), match_email, match_user, role_in)
  returning * into invite_row;

  return invite_row;
end;
$$;

grant execute on function public.send_workspace_invite(uuid, text, public.workspace_role) to authenticated;

-- ───────────────────────── RPC: accept_workspace_invite ─────────────────────
create or replace function public.accept_workspace_invite(invite_id uuid)
returns public.workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  inv     public.workspace_invites%rowtype;
  caller_email text;
  member_row public.workspace_members%rowtype;
begin
  select email into caller_email from auth.users where id = auth.uid();

  select * into inv from public.workspace_invites where id = invite_id;
  if inv.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invite no longer pending' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.workspace_invites set status = 'expired' where id = inv.id;
    raise exception 'invite expired' using errcode = 'P0001';
  end if;
  if not (
    inv.invitee_user_id = auth.uid()
    or (inv.invitee_email is not null and lower(inv.invitee_email) = lower(caller_email))
  ) then
    raise exception 'invite not addressed to you' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do update set role = excluded.role
  returning * into member_row;

  update public.workspace_invites
     set status = 'accepted', accepted_at = now(), invitee_user_id = auth.uid()
   where id = inv.id;

  return member_row;
end;
$$;

grant execute on function public.accept_workspace_invite(uuid) to authenticated;

-- ───────────────────────── RPC: decline_workspace_invite ─────────────────────
create or replace function public.decline_workspace_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  caller_email text;
begin
  select email into caller_email from auth.users where id = auth.uid();
  select * into inv from public.workspace_invites where id = invite_id;
  if inv.id is null then return; end if;
  if not (
    inv.invitee_user_id = auth.uid()
    or (inv.invitee_email is not null and lower(inv.invitee_email) = lower(caller_email))
    or inv.invited_by = auth.uid()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.workspace_invites
     set status = 'declined'
   where id = invite_id and status = 'pending';
end;
$$;

grant execute on function public.decline_workspace_invite(uuid) to authenticated;

-- ───────────────────────── RPC: leave_workspace ─────────────────────────
create or replace function public.leave_workspace(ws_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role public.workspace_role;
begin
  my_role := public.workspace_role_of(ws_id);
  if my_role is null then return; end if;
  if my_role = 'owner' then
    raise exception 'owners cannot leave; transfer ownership or delete the workspace'
      using errcode = 'P0001';
  end if;
  delete from public.workspace_members
   where workspace_id = ws_id and user_id = auth.uid();
end;
$$;

grant execute on function public.leave_workspace(uuid) to authenticated;

-- ───────────────────────── RPC: set_member_role ─────────────────────────
create or replace function public.set_member_role(
  ws_id     uuid,
  target_id uuid,
  new_role  public.workspace_role
)
returns public.workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.workspace_role;
  target_role public.workspace_role;
  result      public.workspace_members%rowtype;
begin
  caller_role := public.workspace_role_of(ws_id);
  if caller_role not in ('owner','admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_role = 'owner' then
    raise exception 'use transfer_workspace_ownership() instead' using errcode = 'P0001';
  end if;
  select role into target_role from public.workspace_members
   where workspace_id = ws_id and user_id = target_id;
  if target_role is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'cannot change owner role' using errcode = 'P0001';
  end if;
  -- Admins can't demote other admins (only owner can).
  if caller_role = 'admin' and target_role = 'admin' then
    raise exception 'only the owner can change admin roles' using errcode = '42501';
  end if;

  update public.workspace_members
     set role = new_role
   where workspace_id = ws_id and user_id = target_id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.set_member_role(uuid, uuid, public.workspace_role) to authenticated;

-- ───────────────────────── RPC: remove_member ─────────────────────────
create or replace function public.remove_workspace_member(ws_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.workspace_role;
  target_role public.workspace_role;
begin
  caller_role := public.workspace_role_of(ws_id);
  if caller_role not in ('owner','admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select role into target_role from public.workspace_members
   where workspace_id = ws_id and user_id = target_id;
  if target_role = 'owner' then
    raise exception 'cannot remove owner' using errcode = 'P0001';
  end if;
  if caller_role = 'admin' and target_role = 'admin' then
    raise exception 'admins cannot remove admins' using errcode = '42501';
  end if;
  delete from public.workspace_members
   where workspace_id = ws_id and user_id = target_id;
end;
$$;

grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

-- ───────────────────────── RPC: my_workspaces (composite list) ──────────────
-- Returns one row per workspace the caller belongs to, with their role and
-- the member count. Used by the Profile → Workspaces tab.
create or replace function public.my_workspaces()
returns table (
  id           uuid,
  name         text,
  user_id      uuid,
  created_at   timestamptz,
  updated_at   timestamptz,
  role         public.workspace_role,
  member_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.user_id,
    w.created_at,
    w.updated_at,
    m.role,
    (select count(*)::int from public.workspace_members m2 where m2.workspace_id = w.id) as member_count
  from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  where m.user_id = auth.uid()
  order by w.created_at asc;
$$;

grant execute on function public.my_workspaces() to authenticated;
