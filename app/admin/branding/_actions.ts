"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { CACHE_TAGS } from "@/lib/cache/single-flight";
import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { BrandConfigRow } from "../_types";

/**
 * Server actions for /admin/branding.
 *
 * Every action calls assertAdmin() AND recordAdminAction(...) so the
 * audit log captures who changed what. Mutations revalidate the index
 * and per-row detail page.
 */

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!HEX_COLOR_RE.test(s)) return null;
  return s.startsWith("#") ? s : `#${s}`;
}

function strOrNull(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s.length ? s : null;
}

function parseWorkspaceId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "global" || s === "null") return null;
  if (!UUID_RE.test(s)) return null;
  return s;
}

/** Invalidate the right brand-cache tag for a given workspace scope.
 *  null = global brand, anything else = workspace-scoped. We use
 *  updateTag (not revalidateTag) for read-your-own-writes inside the
 *  server action. */
function revalidateBrandTag(workspaceId: string | null): void {
  if (workspaceId) {
    updateTag(`${CACHE_TAGS.brandWorkspace}:${workspaceId}`);
  } else {
    updateTag(CACHE_TAGS.brandGlobal);
  }
}

async function fetchBrand(id: string): Promise<BrandConfigRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_configs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as BrandConfigRow | null) ?? null;
}

/* ────────────────── createBrand ────────────────── */

export async function createBrand(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspace_id = parseWorkspaceId(formData.get("workspace_id"));
  const brand_name = strOrNull(formData.get("brand_name"));

  const admin = createAdminClient();
  const insertRow = {
    workspace_id,
    brand_name,
    logo_url: null,
    logo_dark_url: null,
    favicon_url: null,
    primary_color: null,
    accent_color: null,
    font_family: null,
    email_footer_html: null,
    custom_css: null,
    metadata: {},
  };

  const { data, error } = await admin
    .from("brand_configs")
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const inserted = data as BrandConfigRow;

  await recordAdminAction({
    action: "brand.create",
    targetType: "brand_config",
    targetId: inserted.id,
    after: inserted,
    metadata: { workspace_id, brand_name },
  });

  revalidatePath("/admin/branding");
  revalidateBrandTag(inserted.workspace_id ?? null);
  redirect(`/admin/branding/${inserted.id}`);
}

/* ────────────────── updateBrand ────────────────── */

export async function updateBrand(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await fetchBrand(id);
  if (!before) throw new Error("brand config not found");

  const update = {
    brand_name: strOrNull(formData.get("brand_name")),
    logo_url: strOrNull(formData.get("logo_url")),
    logo_dark_url: strOrNull(formData.get("logo_dark_url")),
    favicon_url: strOrNull(formData.get("favicon_url")),
    primary_color: normalizeColor(formData.get("primary_color")),
    accent_color: normalizeColor(formData.get("accent_color")),
    font_family: strOrNull(formData.get("font_family")),
    email_footer_html: strOrNull(formData.get("email_footer_html")),
    custom_css: strOrNull(formData.get("custom_css")),
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand_configs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "brand.update",
    targetType: "brand_config",
    targetId: id,
    before,
    after: data,
  });

  revalidatePath("/admin/branding");
  revalidatePath(`/admin/branding/${id}`);
  revalidateBrandTag(before.workspace_id ?? null);
}

/* ────────────────── deleteBrand ────────────────── */

export async function deleteBrand(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await fetchBrand(id);
  if (!before) throw new Error("brand config not found");

  const admin = createAdminClient();
  const { error } = await admin.from("brand_configs").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "brand.delete",
    targetType: "brand_config",
    targetId: id,
    before,
  });

  revalidatePath("/admin/branding");
  revalidateBrandTag(before.workspace_id ?? null);
  redirect("/admin/branding");
}
