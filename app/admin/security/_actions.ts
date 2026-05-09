"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Server action for `/admin/security`. The table is a singleton with
 * id=1 — we always update that one row. Every call asserts admin and
 * audits the diff.
 */

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function updateSecurityPolicy(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const update = {
    enforce_2fa: formData.get("enforce_2fa") === "on",
    enforce_2fa_for_admins: formData.get("enforce_2fa_for_admins") === "on",
    session_timeout_minutes: clampInt(
      formData.get("session_timeout_minutes"),
      5,
      60 * 24 * 30,
      1440
    ),
    password_min_length: clampInt(
      formData.get("password_min_length"),
      4,
      128,
      8
    ),
    password_require_uppercase:
      formData.get("password_require_uppercase") === "on",
    password_require_number: formData.get("password_require_number") === "on",
    password_require_symbol: formData.get("password_require_symbol") === "on",
    max_login_attempts: clampInt(
      formData.get("max_login_attempts"),
      1,
      100,
      5
    ),
    lockout_duration_minutes: clampInt(
      formData.get("lockout_duration_minutes"),
      1,
      60 * 24 * 7,
      30
    ),
    allow_sso_only: formData.get("allow_sso_only") === "on",
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("security_policies")
    .select(
      "enforce_2fa, enforce_2fa_for_admins, session_timeout_minutes, password_min_length, password_require_uppercase, password_require_number, password_require_symbol, max_login_attempts, lockout_duration_minutes, allow_sso_only"
    )
    .eq("id", 1)
    .maybeSingle();

  // Use upsert so the row is created if the singleton seed somehow
  // didn't run (defensive — the migration inserts id=1 already).
  const { error } = await admin
    .from("security_policies")
    .upsert({ id: 1, ...update }, { onConflict: "id" });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "security_policy.update",
    targetType: "security_policy",
    targetId: "1",
    before,
    after: update,
  });

  revalidatePath("/admin/security");
}
