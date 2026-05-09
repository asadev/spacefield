"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { FunnelRow } from "../_types";

/**
 * Server actions for `/admin/funnels`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * `"use server"` modules can only export async functions — keep types
 * and constants in `_types.ts` or `_helpers.ts`.
 *
 * Audit-action naming follows <area>.<verb>:
 *   funnel.create, funnel.update, funnel.toggle, funnel.delete.
 */

const ID_REGEX = /^[a-z][a-z0-9_-]{1,62}$/;

type RawStep = {
  name?: unknown;
  event_kind?: unknown;
  match?: unknown;
};

function parseSteps(raw: unknown): Array<{
  name: string;
  event_kind: string;
  match: Record<string, unknown>;
}> {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("steps must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("steps must be a JSON array");
  }
  if (parsed.length === 0) {
    throw new Error("at least one step required");
  }
  if (parsed.length > 12) {
    throw new Error("at most 12 steps allowed");
  }
  return parsed.map((step, idx) => {
    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      throw new Error(`step ${idx + 1} must be an object`);
    }
    const s = step as RawStep;
    const name = String(s.name ?? "").trim();
    if (!name) throw new Error(`step ${idx + 1} missing name`);
    const event_kind = String(s.event_kind ?? "").trim();
    if (!event_kind) throw new Error(`step ${idx + 1} missing event_kind`);
    const match =
      typeof s.match === "object" && s.match !== null && !Array.isArray(s.match)
        ? (s.match as Record<string, unknown>)
        : {};
    return { name, event_kind, match };
  });
}

async function fetchFunnel(id: string): Promise<FunnelRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("funnels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as FunnelRow | null) ?? null;
}

/* ─────────────────────── createFunnel ─────────────────────── */

export async function createFunnel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error(
      "invalid id — lowercase letters, digits, hyphen, underscore, 2–63 chars"
    );
  }
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  const description = String(formData.get("description") ?? "").trim();
  const steps = parseSteps(formData.get("steps"));
  const enabled = formData.get("enabled") === "on";

  const insertRow = {
    id,
    display_name,
    description,
    steps,
    enabled,
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("funnels").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "funnel.create",
    targetType: "funnels",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/funnels");
  redirect(`/admin/funnels/${encodeURIComponent(id)}`);
}

/* ─────────────────────── updateFunnel ─────────────────────── */

export async function updateFunnel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const before = await fetchFunnel(id);
  if (!before) throw new Error("funnel not found");

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  const description = String(formData.get("description") ?? "").trim();
  const steps = parseSteps(formData.get("steps"));
  const enabled = formData.get("enabled") === "on";

  const update = {
    display_name,
    description,
    steps,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("funnels")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "funnel.update",
    targetType: "funnels",
    targetId: id,
    before: {
      display_name: before.display_name,
      description: before.description,
      steps: before.steps,
      enabled: before.enabled,
    },
    after: update,
  });

  revalidatePath("/admin/funnels");
  revalidatePath(`/admin/funnels/${encodeURIComponent(id)}`);
}

/* ─────────────────────── toggleFunnel ─────────────────────── */

export async function toggleFunnel(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const next = formData.get("next") === "true";
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("funnels")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("funnels")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "funnel.toggle",
    targetType: "funnels",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/funnels");
  revalidatePath(`/admin/funnels/${encodeURIComponent(id)}`);
}

/* ─────────────────────── deleteFunnel ─────────────────────── */

export async function deleteFunnel(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const before = await fetchFunnel(id);

  const admin = createAdminClient();
  const { error } = await admin.from("funnels").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "funnel.delete",
    targetType: "funnels",
    targetId: id,
    before,
  });

  revalidatePath("/admin/funnels");
  redirect("/admin/funnels");
}
