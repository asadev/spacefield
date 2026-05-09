"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import { TIER_IDS } from "../_types";
import type { CouponKind, CouponRow } from "../_types";

/**
 * Server actions for `/admin/coupons`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * `"use server"` modules can only export async functions — keep types
 * and constants in `_types.ts`.
 *
 * Audit-action naming follows <area>.<verb>:
 *   coupon.create, coupon.update, coupon.toggle,
 *   coupon.delete, coupon.redeem.
 */

const KINDS: CouponKind[] = ["percent", "fixed", "tier_upgrade", "free_months"];
/** Codes are uppercased for storage; allow letters, digits, hyphen,
 *  underscore, between 3 and 32 chars. */
const CODE_REGEX = /^[A-Z0-9_-]{3,32}$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseKind(raw: unknown): CouponKind {
  const s = String(raw ?? "").trim().toLowerCase();
  return (KINDS as string[]).includes(s) ? (s as CouponKind) : "percent";
}

function parseAppliesTo(values: FormDataEntryValue[]): string[] {
  const allowed = new Set(TIER_IDS as readonly string[]);
  const out = new Set<string>();
  for (const v of values) {
    const s = String(v).trim();
    if (allowed.has(s)) out.add(s);
  }
  return Array.from(out);
}

function parseValue(raw: unknown, kind: CouponKind): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (kind === "percent") return Math.min(100, Math.max(0, n));
  return Math.max(0, n);
}

function parseNullableInt(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function parseNullableDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

async function fetchCoupon(code: string): Promise<CouponRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  return (data as CouponRow | null) ?? null;
}

/* ─────────────────────── createCoupon ─────────────────────── */

export async function createCoupon(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("missing code");
  if (!CODE_REGEX.test(code)) {
    throw new Error(
      "invalid code — uppercase letters/digits/hyphen/underscore, 3–32 chars"
    );
  }
  const description = String(formData.get("description") ?? "").trim();
  const kind = parseKind(formData.get("kind"));
  const value = parseValue(formData.get("value"), kind);
  const applies_to_tiers = parseAppliesTo(formData.getAll("applies_to_tier"));
  const max_redemptions = parseNullableInt(formData.get("max_redemptions"));
  const per_user_limit = parseNullableInt(formData.get("per_user_limit"));
  const starts_at = parseNullableDate(formData.get("starts_at"));
  const ends_at = parseNullableDate(formData.get("ends_at"));
  const enabled = formData.get("enabled") === "on";

  const insertRow = {
    code,
    description,
    kind,
    value,
    applies_to_tiers,
    max_redemptions,
    redemption_count: 0,
    per_user_limit,
    starts_at,
    ends_at,
    enabled,
    metadata: {},
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("coupons").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "coupon.create",
    targetType: "coupons",
    targetId: code,
    after: insertRow,
  });

  revalidatePath("/admin/coupons");
  redirect(`/admin/coupons/${encodeURIComponent(code)}`);
}

/* ─────────────────────── updateCoupon ─────────────────────── */

export async function updateCoupon(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("missing code");
  const before = await fetchCoupon(code);
  if (!before) throw new Error("coupon not found");

  const description = String(formData.get("description") ?? "").trim();
  const kind = parseKind(formData.get("kind"));
  const value = parseValue(formData.get("value"), kind);
  const applies_to_tiers = parseAppliesTo(formData.getAll("applies_to_tier"));
  const max_redemptions = parseNullableInt(formData.get("max_redemptions"));
  const per_user_limit = parseNullableInt(formData.get("per_user_limit"));
  const starts_at = parseNullableDate(formData.get("starts_at"));
  const ends_at = parseNullableDate(formData.get("ends_at"));
  const enabled = formData.get("enabled") === "on";

  const update = {
    description,
    kind,
    value,
    applies_to_tiers,
    max_redemptions,
    per_user_limit,
    starts_at,
    ends_at,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("coupons")
    .update(update)
    .eq("code", code);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "coupon.update",
    targetType: "coupons",
    targetId: code,
    before: {
      description: before.description,
      kind: before.kind,
      value: before.value,
      applies_to_tiers: before.applies_to_tiers,
      max_redemptions: before.max_redemptions,
      per_user_limit: before.per_user_limit,
      starts_at: before.starts_at,
      ends_at: before.ends_at,
      enabled: before.enabled,
    },
    after: update,
  });

  revalidatePath("/admin/coupons");
  revalidatePath(`/admin/coupons/${encodeURIComponent(code)}`);
}

/* ─────────────────────── toggleCoupon ─────────────────────── */

export async function toggleCoupon(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  const next = formData.get("next") === "true";
  if (!code) throw new Error("missing code");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("coupons")
    .select("code, enabled")
    .eq("code", code)
    .maybeSingle();

  const { error } = await admin
    .from("coupons")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "coupon.toggle",
    targetType: "coupons",
    targetId: code,
    before,
    after: { code, enabled: next },
  });

  revalidatePath("/admin/coupons");
  revalidatePath(`/admin/coupons/${encodeURIComponent(code)}`);
}

/* ─────────────────────── deleteCoupon ─────────────────────── */

export async function deleteCoupon(formData: FormData): Promise<void> {
  await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  if (!code) throw new Error("missing code");

  const before = await fetchCoupon(code);

  const admin = createAdminClient();
  const { error } = await admin.from("coupons").delete().eq("code", code);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "coupon.delete",
    targetType: "coupons",
    targetId: code,
    before,
  });

  revalidatePath("/admin/coupons");
  redirect("/admin/coupons");
}

/* ─────────────────────── redeemCoupon ─────────────────────── */

/**
 * Admin manual redemption — inserts a `coupon_redemptions` row and bumps
 * `redemption_count`. Validates user UUID and optional workspace UUID.
 */
export async function redeemCoupon(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const code = normalizeCode(formData.get("code"));
  const userId = String(formData.get("user_id") ?? "").trim();
  const workspaceIdRaw = String(formData.get("workspace_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!code) throw new Error("missing code");
  if (!userId) throw new Error("missing user_id");
  if (!UUID_REGEX.test(userId)) throw new Error("user_id is not a valid UUID");
  if (workspaceIdRaw && !UUID_REGEX.test(workspaceIdRaw)) {
    throw new Error("workspace_id is not a valid UUID");
  }

  const before = await fetchCoupon(code);
  if (!before) throw new Error("coupon not found");
  if (!before.enabled) throw new Error("coupon is disabled");

  if (
    before.max_redemptions !== null &&
    before.redemption_count >= before.max_redemptions
  ) {
    throw new Error("coupon has reached max_redemptions");
  }

  const admin = createAdminClient();
  const insertRow = {
    coupon_code: code,
    user_id: userId,
    workspace_id: workspaceIdRaw || null,
    metadata: {
      manual: true,
      issued_by: auth.userId,
      ...(note ? { note } : {}),
    },
  };
  const { error: insertErr } = await admin
    .from("coupon_redemptions")
    .insert(insertRow);
  if (insertErr) throw new Error(insertErr.message);

  const { error: updateErr } = await admin
    .from("coupons")
    .update({
      redemption_count: before.redemption_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (updateErr) throw new Error(updateErr.message);

  await recordAdminAction({
    action: "coupon.redeem",
    targetType: "coupon_redemptions",
    targetId: code,
    after: { code, user_id: userId, workspace_id: workspaceIdRaw || null, note },
    metadata: { manual: true },
  });

  revalidatePath(`/admin/coupons/${encodeURIComponent(code)}`);
  revalidatePath("/admin/coupons");
}
