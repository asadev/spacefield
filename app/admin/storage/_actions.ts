"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Storage admin server actions.
 *
 * `emptyTrashOlderThan` permanently removes `workspace_files` rows with
 * a non-null `deleted_at` older than N days. We don't touch the R2
 * objects from here — that's the job of a follow-up reaper job. This
 * just clears the metadata so the rows stop counting against quotas.
 */

function clampDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(3650, Math.max(0, Math.round(n)));
}

export async function emptyTrashOlderThan(formData: FormData): Promise<void> {
  await assertAdmin();
  const days = clampDays(formData.get("days"));
  // 0 days = "everything currently in trash". Anything else = strictly
  // older than that age.
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();

  // Audit-friendly counts (so we can tell after the fact what we wiped).
  const { count: beforeCount } = await admin
    .from("workspace_files")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  const { error } = await admin
    .from("workspace_files")
    .delete()
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "storage.empty_trash",
    targetType: "workspace_files",
    metadata: {
      days,
      cutoff,
      deleted_count: beforeCount ?? null,
    },
  });

  revalidatePath("/admin/storage");
}
