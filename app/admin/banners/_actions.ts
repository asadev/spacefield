"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type {
  BannerAudience,
  BannerVariant,
  SiteBannerRow,
} from "../_types";

/**
 * Server actions for /admin/banners.
 *
 *   createBanner   → insert new site_banners row
 *   updateBanner   → patch existing row
 *   deleteBanner   → remove row
 *   toggleBanner   → flip enabled bool
 *
 * All mutations call assertAdmin() AND recordAdminAction(...).
 * Audit verbs: banner.create, banner.update, banner.delete, banner.toggle.
 */

const VARIANTS: ReadonlyArray<BannerVariant> = [
  "info",
  "warning",
  "success",
  "error",
];

const AUDIENCES: ReadonlyArray<BannerAudience> = [
  "all",
  "authenticated",
  "tier",
  "allowlist",
];

function pickVariant(value: unknown): BannerVariant {
  const s = String(value ?? "").trim();
  return (VARIANTS as ReadonlyArray<string>).includes(s)
    ? (s as BannerVariant)
    : "info";
}

function pickAudience(value: unknown): BannerAudience {
  const s = String(value ?? "").trim();
  return (AUDIENCES as ReadonlyArray<string>).includes(s)
    ? (s as BannerAudience)
    : "all";
}

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTimestamp(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  // datetime-local inputs send "YYYY-MM-DDTHH:MM" without timezone — trust
  // the browser-provided wall clock as UTC. Postgres timestamptz parses
  // either ISO or this form.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchBanner(id: string): Promise<SiteBannerRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("site_banners")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SiteBannerRow | null) ?? null;
}

function bannerPatchFromForm(
  formData: FormData,
  before: SiteBannerRow | null
): {
  message: string;
  cta_label: string | null;
  cta_href: string | null;
  variant: BannerVariant;
  audience: BannerAudience;
  audience_tiers: string[];
  audience_user_ids: string[];
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
  dismissible: boolean;
} {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("missing message");
  const ctaLabelRaw = String(formData.get("cta_label") ?? "").trim();
  const ctaHrefRaw = String(formData.get("cta_href") ?? "").trim();
  const variant = pickVariant(formData.get("variant"));
  const audience = pickAudience(formData.get("audience"));
  const audience_tiers = formData
    .getAll("audience_tier")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const audience_user_ids = parseLines(formData.get("audience_user_ids"));
  const starts_at = parseTimestamp(formData.get("starts_at"));
  const ends_at = parseTimestamp(formData.get("ends_at"));
  const enabled =
    formData.get("enabled") === "on" ||
    formData.get("enabled") === "true" ||
    (before?.enabled ?? false);
  const dismissible =
    formData.get("dismissible") === "on" ||
    formData.get("dismissible") === "true";

  return {
    message,
    cta_label: ctaLabelRaw.length ? ctaLabelRaw : null,
    cta_href: ctaHrefRaw.length ? ctaHrefRaw : null,
    variant,
    audience,
    audience_tiers,
    audience_user_ids,
    starts_at,
    ends_at,
    enabled,
    dismissible,
  };
}

/* ─────────────────────── create ─────────────────────── */

export async function createBanner(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const patch = bannerPatchFromForm(formData, null);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_banners")
    .insert({ ...patch, updated_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "banner.create",
    targetType: "site_banners",
    targetId: (data as { id: string }).id,
    after: patch,
  });

  revalidatePath("/admin/banners");
}

/* ─────────────────────── update ─────────────────────── */

export async function updateBanner(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchBanner(id);
  if (!before) throw new Error("banner not found");

  const patch = bannerPatchFromForm(formData, before);

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_banners")
    .update({ ...patch, updated_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "banner.update",
    targetType: "site_banners",
    targetId: id,
    before: {
      message: before.message,
      cta_label: before.cta_label,
      cta_href: before.cta_href,
      variant: before.variant,
      audience: before.audience,
      audience_tiers: before.audience_tiers,
      audience_user_ids: before.audience_user_ids,
      starts_at: before.starts_at,
      ends_at: before.ends_at,
      enabled: before.enabled,
      dismissible: before.dismissible,
    },
    after: patch,
  });

  revalidatePath("/admin/banners");
  revalidatePath(`/admin/banners/${id}`);
}

/* ─────────────────────── delete ─────────────────────── */

export async function deleteBanner(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchBanner(id);

  const admin = createAdminClient();
  const { error } = await admin.from("site_banners").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "banner.delete",
    targetType: "site_banners",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/banners");
}

/* ─────────────────────── toggle ─────────────────────── */

export async function toggleBanner(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const next = formData.get("next") === "true";
  if (!id) throw new Error("missing id");

  const before = await fetchBanner(id);
  if (!before) throw new Error("banner not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_banners")
    .update({ enabled: next, updated_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "banner.toggle",
    targetType: "site_banners",
    targetId: id,
    before: { enabled: before.enabled },
    after: { enabled: next },
  });

  revalidatePath("/admin/banners");
  revalidatePath(`/admin/banners/${id}`);
}
