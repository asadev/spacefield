-- 2026-04-28 CRM boards: Monday-style generic boards.
-- Sits on top of the fixed-schema CRM (contacts/companies/deals/leads/
-- inventory/activities) to let users spin up extra collections that don't
-- fit the fixed types — marketing campaigns, projects, customer onboarding,
-- account management, anything they invent. Each board owns its own column
-- definitions (jsonb-typed cells) and its own views.

create extension if not exists pgcrypto;

-- ─── boards ─────────────────────────────────────────────────────────────
create table if not exists public.crm_boards (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  -- url-safe handle; unique per workspace so a router can deep-link
  slug          text not null,
  -- 'marketing' | 'projects' | 'onboarding' | 'accounts' | 'custom'
  kind          text not null check (kind in ('marketing','projects','onboarding','accounts','custom')),
  description   text,
  -- icon key (matches the Shell ICONS map, or a board-local one)
  icon          text,
  -- hex accent (e.g. #6366f1) — used for the sidebar stripe + chip
  color         text,
  -- order in the boards list / sidebar
  position      integer not null default 0,
  archived_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, slug)
);
create index if not exists crm_boards_ws_pos_idx on public.crm_boards(workspace_id, position);
create index if not exists crm_boards_ws_kind_idx on public.crm_boards(workspace_id, kind);

-- ─── columns ────────────────────────────────────────────────────────────
create table if not exists public.crm_board_columns (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.crm_boards(id) on delete cascade,
  -- snake_case key in record.data jsonb
  field_key     text not null,
  label         text not null,
  field_type    text not null check (field_type in (
    'text','longtext','number','currency','percent','rating',
    'date','datetime','status','dropdown','multiselect',
    'checkbox','person','people','link','email','phone','file','formula'
  )),
  -- Type-specific config:
  --   status      → { options: [{ value, label, color }] }
  --   dropdown    → { options: [{ value, label }] }
  --   multiselect → { options: [{ value, label, color? }] }
  --   number      → { prefix, suffix, decimals }
  --   currency    → { code: 'USD', decimals: 2 }
  --   percent     → { decimals: 0 }
  --   rating      → { max: 5 }
  --   formula     → { expression: 'budget - spent' }
  --   person      → { role_filter?: 'admin'|'member' }
  config        jsonb not null default '{}'::jsonb,
  required      boolean not null default false,
  -- pixels for the table view's column width
  width         integer not null default 180,
  -- order within the board
  position      integer not null default 0,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (board_id, field_key)
);
create index if not exists crm_board_columns_board_pos_idx
  on public.crm_board_columns(board_id, position);

-- ─── records ────────────────────────────────────────────────────────────
create table if not exists public.crm_board_records (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.crm_boards(id) on delete cascade,
  -- denormalized for cheap RLS without a join
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  -- jsonb keyed by field_key — the cell values
  data          jsonb not null default '{}'::jsonb,
  position      integer not null default 0,
  -- Subitem support — Monday's "subitems" feature in v1 form
  parent_id     uuid references public.crm_board_records(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  assignee_ids  uuid[] not null default '{}'::uuid[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_board_records_board_pos_idx
  on public.crm_board_records(board_id, position);
create index if not exists crm_board_records_ws_idx
  on public.crm_board_records(workspace_id);
create index if not exists crm_board_records_parent_idx
  on public.crm_board_records(parent_id) where parent_id is not null;
create index if not exists crm_board_records_assignees_idx
  on public.crm_board_records using gin (assignee_ids);

-- ─── views ──────────────────────────────────────────────────────────────
create table if not exists public.crm_board_views (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.crm_boards(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  view_type     text not null check (view_type in ('table','kanban','calendar','timeline','cards','form','chart')),
  -- filters[], sort[], group_by, hidden_columns[], swimlane_field, etc.
  config        jsonb not null default '{}'::jsonb,
  is_default    boolean not null default false,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists crm_board_views_board_idx
  on public.crm_board_views(board_id, position);
create index if not exists crm_board_views_board_type_idx
  on public.crm_board_views(board_id, view_type);

-- ─── triggers: updated_at + denormalized workspace_id ───────────────────

drop trigger if exists crm_boards_touch on public.crm_boards;
create trigger crm_boards_touch before update on public.crm_boards
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_board_columns_touch on public.crm_board_columns;
create trigger crm_board_columns_touch before update on public.crm_board_columns
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_board_records_touch on public.crm_board_records;
create trigger crm_board_records_touch before update on public.crm_board_records
  for each row execute function public.crm_touch_updated_at();
drop trigger if exists crm_board_views_touch on public.crm_board_views;
create trigger crm_board_views_touch before update on public.crm_board_views
  for each row execute function public.crm_touch_updated_at();

-- Copy workspace_id from the parent board on INSERT so RLS reads stay
-- index-only without a join. Trusted because callers can't pick a
-- workspace_id mismatched from the board (CHECK enforced below).
create or replace function public.crm_board_records_set_ws()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select b.workspace_id into ws from public.crm_boards b where b.id = new.board_id;
  if ws is null then
    raise exception 'board % not found', new.board_id;
  end if;
  new.workspace_id = ws;
  return new;
end;
$$;
drop trigger if exists crm_board_records_set_ws_trg on public.crm_board_records;
create trigger crm_board_records_set_ws_trg
  before insert on public.crm_board_records
  for each row execute function public.crm_board_records_set_ws();

create or replace function public.crm_board_views_set_ws()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select b.workspace_id into ws from public.crm_boards b where b.id = new.board_id;
  if ws is null then
    raise exception 'board % not found', new.board_id;
  end if;
  new.workspace_id = ws;
  return new;
end;
$$;
drop trigger if exists crm_board_views_set_ws_trg on public.crm_board_views;
create trigger crm_board_views_set_ws_trg
  before insert on public.crm_board_views
  for each row execute function public.crm_board_views_set_ws();

-- ─── RLS ────────────────────────────────────────────────────────────────
-- v1: workspace members read+write everything in their workspace.
-- Owners/admins additionally own column/view schema mutations (enforced
-- by separate policy). Future migration can split member-write toggles
-- through a workspace_settings flag.

alter table public.crm_boards enable row level security;
drop policy if exists "crm_boards select" on public.crm_boards;
create policy "crm_boards select" on public.crm_boards for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "crm_boards insert" on public.crm_boards;
create policy "crm_boards insert" on public.crm_boards for insert
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_boards update" on public.crm_boards;
create policy "crm_boards update" on public.crm_boards for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_boards delete" on public.crm_boards;
create policy "crm_boards delete" on public.crm_boards for delete
  using (public.workspace_role_of(workspace_id) in ('owner','admin')
         or created_by = auth.uid());

alter table public.crm_board_columns enable row level security;
drop policy if exists "crm_board_columns all" on public.crm_board_columns;
create policy "crm_board_columns all" on public.crm_board_columns for all
  using (exists (select 1 from public.crm_boards b
                 where b.id = board_id and public.is_workspace_member(b.workspace_id)))
  with check (exists (select 1 from public.crm_boards b
                      where b.id = board_id and public.is_workspace_member(b.workspace_id)));

alter table public.crm_board_records enable row level security;
drop policy if exists "crm_board_records select" on public.crm_board_records;
create policy "crm_board_records select" on public.crm_board_records for select
  using (public.is_workspace_member(workspace_id));
drop policy if exists "crm_board_records insert" on public.crm_board_records;
create policy "crm_board_records insert" on public.crm_board_records for insert
  with check (exists (select 1 from public.crm_boards b
                      where b.id = board_id and public.is_workspace_member(b.workspace_id)));
drop policy if exists "crm_board_records update" on public.crm_board_records;
create policy "crm_board_records update" on public.crm_board_records for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "crm_board_records delete" on public.crm_board_records;
create policy "crm_board_records delete" on public.crm_board_records for delete
  using (public.is_workspace_member(workspace_id));

alter table public.crm_board_views enable row level security;
drop policy if exists "crm_board_views all" on public.crm_board_views;
create policy "crm_board_views all" on public.crm_board_views for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
