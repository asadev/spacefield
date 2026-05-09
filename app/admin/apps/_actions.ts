"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { AppAccessMode, AppRegistryRow } from "../_types";

/**
 * Server actions backing the /admin/apps UI.
 *
 *   togglePublished      → flips published bool
 *   updateApp            → full editable-row update
 *   setWorkspaceGrant    → upsert workspace_tool_grants
 *   clearWorkspaceGrant  → delete workspace_tool_grants
 *   setUserGrant         → upsert user_app_grants
 *   clearUserGrant       → delete user_app_grants
 *
 * Every mutation calls assertAdmin() AND recordAdminAction(...). The
 * matching SQL policies enforce the same admin-only check, so even if a
 * route slipped through, RLS would block it.
 *
 * Audit-action naming follows <area>.<verb>:
 *   app.toggle_published, app.update,
 *   app.workspace_grant, app.workspace_grant_clear,
 *   app.user_grant, app.user_grant_clear.
 */

const ACCESS_MODES: ReadonlyArray<AppAccessMode> = [
  "public",
  "authenticated",
  "tier",
  "allowlist",
  "admin_only",
];

function pickAccessMode(value: unknown): AppAccessMode | null {
  const s = String(value ?? "").trim();
  return (ACCESS_MODES as ReadonlyArray<string>).includes(s)
    ? (s as AppAccessMode)
    : null;
}

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchAppById(slug: string): Promise<AppRegistryRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_registry")
    .select("*")
    .eq("id", slug)
    .maybeSingle();
  return (data as AppRegistryRow | null) ?? null;
}

/* ─────────────────────── publish toggle ─────────────────────── */

export async function togglePublished(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const next = formData.get("next") === "true";
  if (!slug) throw new Error("missing slug");

  const before = await fetchAppById(slug);
  if (!before) throw new Error("app not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_registry")
    .update({
      published: next,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.toggle_published",
    targetType: "app_registry",
    targetId: slug,
    before: { published: before.published },
    after: { published: next },
  });

  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${slug}`);
}

/* ─────────────────────── full row update ─────────────────────── */

export async function updateApp(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) throw new Error("missing slug");

  const before = await fetchAppById(slug);
  if (!before) throw new Error("app not found");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing title");

  const description = String(formData.get("description") ?? "");
  const category = String(formData.get("category") ?? "").trim();
  const iconRaw = String(formData.get("icon") ?? "").trim();
  const icon = iconRaw.length ? iconRaw : null;

  const sortOrderRaw = Number(formData.get("sort_order") ?? before.sort_order);
  const sort_order = Number.isFinite(sortOrderRaw)
    ? Math.trunc(sortOrderRaw)
    : before.sort_order;

  const access_mode =
    pickAccessMode(formData.get("access_mode")) ?? before.access_mode;

  // Multi-select on access_tiers — checkboxes name="access_tier"
  const access_tiers = formData
    .getAll("access_tier")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const allowlist_user_ids = parseLines(formData.get("allowlist_user_ids"));

  const patch = {
    title,
    description,
    category,
    icon,
    sort_order,
    access_mode,
    access_tiers,
    allowlist_user_ids,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_registry")
    .update(patch)
    .eq("id", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.update",
    targetType: "app_registry",
    targetId: slug,
    before: {
      title: before.title,
      description: before.description,
      category: before.category,
      icon: before.icon,
      sort_order: before.sort_order,
      access_mode: before.access_mode,
      access_tiers: before.access_tiers,
      allowlist_user_ids: before.allowlist_user_ids,
    },
    after: {
      title,
      description,
      category,
      icon,
      sort_order,
      access_mode,
      access_tiers,
      allowlist_user_ids,
    },
  });

  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${slug}`);
}

/* ─────────────────────── workspace grants ─────────────────────── */

export async function setWorkspaceGrant(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const granted = formData.get("granted") === "true";
  if (!slug || !workspaceId) throw new Error("missing slug or workspace_id");

  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("workspace_tool_grants")
    .select("workspace_id, slug, granted")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_tool_grants")
    .upsert(
      {
        workspace_id: workspaceId,
        slug,
        granted,
        granted_by: userId,
      },
      { onConflict: "workspace_id,slug" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.workspace_grant",
    targetType: "workspace_tool_grants",
    targetId: `${workspaceId}:${slug}`,
    before: prior ? { granted: (prior as { granted: boolean }).granted } : null,
    after: { granted },
    metadata: { slug, workspace_id: workspaceId },
  });

  revalidatePath(`/admin/apps/${slug}`);
}

export async function clearWorkspaceGrant(formData: FormData): Promise<void> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  if (!slug || !workspaceId) throw new Error("missing slug or workspace_id");

  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("workspace_tool_grants")
    .select("workspace_id, slug, granted")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_tool_grants")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.workspace_grant_clear",
    targetType: "workspace_tool_grants",
    targetId: `${workspaceId}:${slug}`,
    before: prior ? { granted: (prior as { granted: boolean }).granted } : null,
    after: null,
    metadata: { slug, workspace_id: workspaceId },
  });

  revalidatePath(`/admin/apps/${slug}`);
}

/* ─────────────────────── user grants ─────────────────────── */

export async function setUserGrant(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const granted = formData.get("granted") === "true";
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw.length ? reasonRaw : null;
  if (!slug || !targetUserId) throw new Error("missing slug or user_id");

  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("user_app_grants")
    .select("user_id, slug, granted, reason")
    .eq("user_id", targetUserId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("user_app_grants")
    .upsert(
      {
        user_id: targetUserId,
        slug,
        granted,
        granted_by: userId,
        reason,
      },
      { onConflict: "user_id,slug" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.user_grant",
    targetType: "user_app_grants",
    targetId: `${targetUserId}:${slug}`,
    before: prior
      ? {
          granted: (prior as { granted: boolean; reason: string | null })
            .granted,
          reason: (prior as { granted: boolean; reason: string | null }).reason,
        }
      : null,
    after: { granted, reason },
    metadata: { slug, user_id: targetUserId },
  });

  revalidatePath(`/admin/apps/${slug}`);
}

export async function clearUserGrant(formData: FormData): Promise<void> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!slug || !targetUserId) throw new Error("missing slug or user_id");

  const admin = createAdminClient();

  const { data: prior } = await admin
    .from("user_app_grants")
    .select("user_id, slug, granted, reason")
    .eq("user_id", targetUserId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("user_app_grants")
    .delete()
    .eq("user_id", targetUserId)
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "app.user_grant_clear",
    targetType: "user_app_grants",
    targetId: `${targetUserId}:${slug}`,
    before: prior
      ? {
          granted: (prior as { granted: boolean; reason: string | null })
            .granted,
          reason: (prior as { granted: boolean; reason: string | null }).reason,
        }
      : null,
    after: null,
    metadata: { slug, user_id: targetUserId },
  });

  revalidatePath(`/admin/apps/${slug}`);
}

