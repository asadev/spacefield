-- 2026-05-27c — Workspace industry classification (agent-c-industry-system)
--
-- Adds `industry` text column on public.workspaces so every workspace can
-- declare what kind of business it serves. The column is nullable so
-- existing rows aren't broken by the migration; new-workspace flows
-- (onboarding + Create dialog) enforce it client/server-side via the
-- API routes. Downstream code reading `workspace.industry` must treat
-- `null` as "unspecified / generic" — see lib/industry/helpers.ts
-- `getWorkspaceIndustry()` for the canonical defaulting helper.
--
-- The enum lives both here (CHECK constraint) and in
-- lib/industry/registry.ts. Keep them in sync — adding a new slug
-- requires a follow-up migration that extends the CHECK list.
--
-- Backfill: existing workspaces that were seeded from a known template
-- get tagged with the template's matching industry. Spacefield's
-- WorkspaceTemplates only writes localStorage state (no template_id
-- recorded server-side), so we can't reliably infer the template from
-- the DB row. Instead we leave existing rows as NULL — downstream
-- `getWorkspaceIndustry()` treats NULL as 'generic', and owners can
-- opt-in to a specific industry from workspace settings whenever they
-- want. The 'generic' default keeps every tool that reads industry
-- working for legacy workspaces with zero churn.
--
-- Rollback (manual):
--   drop index if exists workspaces_industry_idx;
--   alter table public.workspaces drop constraint if exists workspaces_industry_check;
--   alter table public.workspaces drop column if exists industry;

-- ─── column + check ───
alter table public.workspaces
  add column if not exists industry text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_industry_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_industry_check
      check (
        industry is null
        or industry in (
          'real_estate',
          'clothing_retail',
          'marketing_agency',
          'coworking',
          'salon',
          'restaurant',
          'gym',
          'fitness',
          'beauty',
          'professional_services',
          'automotive',
          'education',
          'healthcare',
          'hospitality',
          'retail_general',
          'generic'
        )
      );
  end if;
end$$;

-- ─── index for analytics queries (industry distribution) ───
create index if not exists workspaces_industry_idx
  on public.workspaces (industry)
  where industry is not null;

-- ─── comment for psql/devs reading the schema ───
comment on column public.workspaces.industry is
  'Business industry classification. Nullable for legacy rows; treated as ''generic'' by lib/industry/helpers.ts getWorkspaceIndustry(). New workspaces are required to set this via the onboarding flow. Enum kept in sync with lib/industry/registry.ts.';
