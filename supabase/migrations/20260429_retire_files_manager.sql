-- Retire the standalone Files Manager tool (Round D, 2026-04-29).
--
-- Every Files Manager feature — upload, trash, rename, tag editor,
-- storage bar, inline preview, share dialog — was ported into the
-- system Launchpad. The standalone tool is no longer shipped, the
-- "/tools/files-manager" route 301s to "/", and the slug is removed
-- from the client tool registry.
--
-- This migration does the matching server-side cleanup so admin/
-- workspace tables don't carry a dangling "files-manager" reference.

-- ─── tool_settings: drop the slug ───
-- The row, if it exists, was created lazily by an admin toggling the
-- tool's kill switch. Either flag is now meaningless — the slug
-- doesn't ship — so drop the row outright.
delete from public.tool_settings
where slug = 'files-manager';

-- ─── workspace_tool_grants: drop per-workspace overrides ───
-- "granted = true" rows would let a tier-locked workspace install a
-- tool that no longer exists; "granted = false" rows would block a
-- non-existent tool. Both are noise — clean them up.
delete from public.workspace_tool_grants
where slug = 'files-manager';

-- ─── subscription_tiers.allowed_tool_slugs: strip the slug ───
-- The allow-list is a jsonb array of slugs. Filter out
-- "files-manager" from every tier so admin UIs (and the gate RPC)
-- don't surface a phantom entry.
update public.subscription_tiers
set allowed_tool_slugs = coalesce(
  (
    select jsonb_agg(e)
    from jsonb_array_elements_text(allowed_tool_slugs) e
    where e <> 'files-manager'
  ),
  '[]'::jsonb
)
where allowed_tool_slugs ? 'files-manager';
