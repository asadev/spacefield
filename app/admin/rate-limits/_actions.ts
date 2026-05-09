"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { RateLimitScope } from "../_types";

const SCOPES: RateLimitScope[] = [
  "global",
  "tier",
  "user",
  "workspace",
  "route",
];
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseScope(raw: unknown): RateLimitScope {
  const s = String(raw ?? "global").toLowerCase();
  return (SCOPES as string[]).includes(s) ? (s as RateLimitScope) : "global";
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function nullableInt(raw: unknown, min: number, max: number): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseScopeValue(scope: RateLimitScope, raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (scope === "global" || scope === "route") return null;
  if (scope === "user" || scope === "workspace") {
    if (!UUID_REGEX.test(s)) {
      throw new Error(
        `${scope === "user" ? "User" : "Workspace"} id must be a UUID`
      );
    }
  }
  return s;
}

function parseRoutePattern(scope: RateLimitScope, raw: unknown): string | null {
  if (scope !== "route") return null;
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("route pattern is required when scope is route");
  return s;
}

/* ────────────────────── createRule ────────────────────── */

export async function createRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const scope = parseScope(formData.get("scope"));
  const scope_value = parseScopeValue(scope, formData.get("scope_value"));
  const route_pattern = parseRoutePattern(scope, formData.get("route_pattern"));
  const limit_count = clampInt(formData.get("limit_count"), 1, 10_000_000, 60);
  const window_sec = clampInt(formData.get("window_sec"), 1, 60 * 60 * 24, 60);
  const burst_count = nullableInt(formData.get("burst_count"), 1, 10_000_000);
  const enabled = formData.get("enabled") !== "off";

  const insertRow = {
    scope,
    scope_value,
    route_pattern,
    limit_count,
    window_sec,
    burst_count,
    enabled,
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rate_limit_rules")
    .insert(insertRow)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "rate_limit.create",
    targetType: "rate_limit_rule",
    targetId: data?.id ?? null,
    after: insertRow,
  });

  revalidatePath("/admin/rate-limits");
  redirect("/admin/rate-limits");
}

/* ────────────────────── updateRule ────────────────────── */

export async function updateRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const scope = parseScope(formData.get("scope"));
  const scope_value = parseScopeValue(scope, formData.get("scope_value"));
  const route_pattern = parseRoutePattern(scope, formData.get("route_pattern"));
  const limit_count = clampInt(formData.get("limit_count"), 1, 10_000_000, 60);
  const window_sec = clampInt(formData.get("window_sec"), 1, 60 * 60 * 24, 60);
  const burst_count = nullableInt(formData.get("burst_count"), 1, 10_000_000);
  const enabled = formData.get("enabled") !== "off";

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("rate_limit_rules")
    .select(
      "id, scope, scope_value, route_pattern, limit_count, window_sec, burst_count, enabled"
    )
    .eq("id", id)
    .maybeSingle();

  const update = {
    scope,
    scope_value,
    route_pattern,
    limit_count,
    window_sec,
    burst_count,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("rate_limit_rules")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "rate_limit.update",
    targetType: "rate_limit_rule",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/rate-limits");
  revalidatePath(`/admin/rate-limits/${id}`);
}

/* ────────────────────── toggleRule ────────────────────── */

export async function toggleRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("enabled") ?? "false") === "true";
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("rate_limit_rules")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("rate_limit_rules")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "rate_limit.toggle",
    targetType: "rate_limit_rule",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/rate-limits");
}

/* ────────────────────── deleteRule ────────────────────── */

export async function deleteRule(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("rate_limit_rules")
    .select(
      "id, scope, scope_value, route_pattern, limit_count, window_sec, burst_count, enabled"
    )
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("rate_limit_rules")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "rate_limit.delete",
    targetType: "rate_limit_rule",
    targetId: id,
    before,
  });

  revalidatePath("/admin/rate-limits");
  redirect("/admin/rate-limits");
}
