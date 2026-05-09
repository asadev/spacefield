"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../../_audit";
import { assertAdmin } from "../../_lib";

/**
 * Per-error detail page server actions. Both call assertAdmin() and
 * recordAdminAction(). Re-using the broader resolve audit names from
 * `app/admin/errors/_actions.ts` would be nicer, but Next.js lints
 * against re-exporting non-async values from `"use server"` files.
 *
 * Audit actions:
 *   - error.resolve_single
 *   - error.resolve_group
 */

/**
 * Resolve one error event by id. Returns the updated row.
 *
 * Used by:
 *   - `GET /api/admin/errors/[id]/resolve` route (passes the id string)
 *   - `resolveSingleAction` form-action below (extracts id from FormData)
 */
export async function resolveSingle(
  id: string
): Promise<{ ok: true; id: string; resolved_at: string }> {
  const auth = await assertAdmin();
  const trimmedId = id.trim();
  if (!trimmedId) throw new Error("missing id");
  return resolveSingleInner(trimmedId, auth);
}

/**
 * Form-action wrapper: extract the id from FormData and forward.
 * Returns void so it can be used as `<form action={...}>`.
 */
export async function resolveSingleAction(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  await resolveSingleInner(id, auth);
}

async function resolveSingleInner(
  id: string,
  auth: { userId: string; email: string | null }
): Promise<{ ok: true; id: string; resolved_at: string }> {

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
    action: "error.resolve_single",
    targetType: "error_event",
    targetId: id,
    before,
    after: { id, resolved_at: nowIso, resolved_by: auth.userId },
  });

  revalidatePath(`/admin/errors/${id}`);
  revalidatePath("/admin/errors");

  return { ok: true, id, resolved_at: nowIso };
}

/**
 * Resolve every event sharing the supplied fingerprint. Same logic as
 * `resolveGroup` in `../_actions.ts` but logged under
 * `error.resolve_group` from the detail-page context for traceability.
 */
export async function resolveByFingerprint(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  if (!fingerprint) throw new Error("missing fingerprint");

  const admin = createAdminClient();

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
    metadata: { triggered_from: "detail_page", source_event_id: id || null },
  });

  revalidatePath("/admin/errors");
  if (id) {
    revalidatePath(`/admin/errors/${id}`);
    redirect(`/admin/errors/${id}`);
  } else {
    redirect("/admin/errors");
  }
}
