"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Server actions for `/admin/errors`. Every action calls `assertAdmin()`
 * AND `recordAdminAction(...)`.
 */

/**
 * Resolve a single error event by id. Used from the per-event expand
 * row when the admin wants to mark just one row instead of the whole
 * fingerprint group.
 */
export async function resolveError(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("error_events")
    .select("id, fingerprint, message, resolved_at")
    .eq("id", id)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("error_events")
    .update({ resolved_at: nowIso, resolved_by: auth.userId })
    .eq("id", id)
    .is("resolved_at", null);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "error.resolve",
    targetType: "error_event",
    targetId: id,
    before,
    after: { id, resolved_at: nowIso, resolved_by: auth.userId },
  });

  revalidatePath("/admin/errors");
}

/**
 * Resolve every event sharing a fingerprint. The expected workflow: admin
 * sees a noisy fingerprint at the top of the list, clicks "Resolve group",
 * every row with that fingerprint flips to resolved.
 */
export async function resolveGroup(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  if (!fingerprint) throw new Error("missing fingerprint");

  const admin = createAdminClient();

  // Some rows are grouped client-side under a synthetic key
  // `__msg__:<excerpt>`. Detect that and resolve by message-prefix
  // match instead of fingerprint equality.
  const msgPrefix = fingerprint.startsWith("__msg__:")
    ? fingerprint.slice("__msg__:".length)
    : null;

  const nowIso = new Date().toISOString();
  let resolvedCount = 0;
  if (msgPrefix !== null) {
    const { data, error } = await admin
      .from("error_events")
      .update({ resolved_at: nowIso, resolved_by: auth.userId })
      .is("fingerprint", null)
      .ilike("message", `${msgPrefix.replace(/[%_]/g, "\\$&")}%`)
      .is("resolved_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    resolvedCount = data?.length ?? 0;
  } else {
    const { data, error } = await admin
      .from("error_events")
      .update({ resolved_at: nowIso, resolved_by: auth.userId })
      .eq("fingerprint", fingerprint)
      .is("resolved_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    resolvedCount = data?.length ?? 0;
  }

  await recordAdminAction({
    action: "error.resolve_group",
    targetType: "error_fingerprint",
    targetId: fingerprint,
    after: { fingerprint, resolved_count: resolvedCount, resolved_at: nowIso },
  });

  revalidatePath("/admin/errors");
}

/**
 * Re-open a previously-resolved fingerprint group (clear resolved_at).
 * Useful when the issue resurfaces.
 */
export async function reopenGroup(formData: FormData): Promise<void> {
  await assertAdmin();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  if (!fingerprint) throw new Error("missing fingerprint");

  const admin = createAdminClient();

  const msgPrefix = fingerprint.startsWith("__msg__:")
    ? fingerprint.slice("__msg__:".length)
    : null;

  let reopenedCount = 0;
  if (msgPrefix !== null) {
    const { data, error } = await admin
      .from("error_events")
      .update({ resolved_at: null, resolved_by: null })
      .is("fingerprint", null)
      .ilike("message", `${msgPrefix.replace(/[%_]/g, "\\$&")}%`)
      .not("resolved_at", "is", null)
      .select("id");
    if (error) throw new Error(error.message);
    reopenedCount = data?.length ?? 0;
  } else {
    const { data, error } = await admin
      .from("error_events")
      .update({ resolved_at: null, resolved_by: null })
      .eq("fingerprint", fingerprint)
      .not("resolved_at", "is", null)
      .select("id");
    if (error) throw new Error(error.message);
    reopenedCount = data?.length ?? 0;
  }

  await recordAdminAction({
    action: "error.reopen_group",
    targetType: "error_fingerprint",
    targetId: fingerprint,
    after: { fingerprint, reopened_count: reopenedCount },
  });

  revalidatePath("/admin/errors");
}
