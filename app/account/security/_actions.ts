"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireRecentAuth, setRecentAuthNow } from "@/lib/mfa/reauth";
import { regenerateRecoveryCodes } from "@/lib/mfa/recovery";

/* app/account/security/_actions.ts — Server actions for the /account
 * /security page. Three flows:
 *
 *   1. Enroll TOTP   → start (returns QR + secret) → confirm (verifies
 *      first 6-digit code; on success regenerates recovery codes).
 *   2. Disable TOTP  → unenroll a factor (gated on requireRecentAuth).
 *   3. Recovery codes → regenerate batch (gated on requireRecentAuth).
 *
 * All `useActionState`-compatible actions return a serialisable
 * { ok, error?, … } shape. Where we need to gate on re-auth, we either
 * return `{ ok: false, reauth: <url> }` so the client can navigate, or
 * we throw a redirect — the actions below use the explicit return
 * shape so the form components can show the inline prompt.
 */

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; reauth?: string };

/* ============================================================
 * Enrollment: start
 * ============================================================
 *
 * Called once when the user clicks "Add authenticator app". Supabase
 * Auth returns the otpauth URI + a QR-code data URL we render.
 *
 * Note: Supabase keeps the new factor in an "unverified" state until
 * the matching code arrives via `mfa.verify`. If the user closes the
 * dialog without verifying, the factor lingers — we clean those up on
 * the next call (see `pruneUnverifiedFactors`).
 */

export interface StartEnrollmentSuccess {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export async function startTotpEnrollment(): Promise<ActionResult<StartEnrollmentSuccess>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: "Not signed in." };

  await pruneUnverifiedFactors(supabase);

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator (${new Date().toISOString().slice(0, 10)})`,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to start enrollment." };
  }
  // The enroll response is a discriminated union over factor type; we
  // asked for TOTP, so the `totp` field is present. Narrow defensively.
  if (data.type !== "totp" || !("totp" in data)) {
    return { ok: false, error: "Server returned an unexpected factor type." };
  }
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/* ============================================================
 * Enrollment: confirm
 * ============================================================ */

export async function confirmTotpEnrollment(
  _prev: ActionResult<{ recoveryCodes: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: "Not signed in." };

  const factorId = String(formData.get("factor_id") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!factorId) return { ok: false, error: "Missing factor id." };
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your app." };
  }

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challengeData) {
    return { ok: false, error: challengeError?.message ?? "Couldn't start challenge." };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });
  if (verifyError) {
    return { ok: false, error: verifyError.message || "Code didn't match. Try again." };
  }

  // First successful TOTP verify counts as recent auth — the user just
  // proved possession of the second factor.
  await setRecentAuthNow();

  // Issue a fresh batch of recovery codes. Returning them once here is
  // the canonical "show these once" moment; the client component is
  // responsible for forcing the user to confirm they saved them.
  const { codes } = await regenerateRecoveryCodes(userData.user.id);

  revalidatePath("/account/security");
  return { ok: true, recoveryCodes: codes };
}

/* ============================================================
 * Disable factor
 * ============================================================ */

export async function disableTotpFactor(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const factorId = String(formData.get("factor_id") ?? "");
  if (!factorId) return { ok: false, error: "Missing factor id." };

  const reauth = await requireRecentAuth("/account/security");
  if (reauth) return { ok: false, error: "Re-authenticate to continue.", reauth };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/account/security");
  return { ok: true };
}

/* ============================================================
 * Recovery codes: regenerate
 * ============================================================ */

export async function regenerateRecoveryCodesAction(
  _prev: ActionResult<{ codes: string[] }> | null,
): Promise<ActionResult<{ codes: string[] }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: "Not signed in." };

  const reauth = await requireRecentAuth("/account/security");
  if (reauth) return { ok: false, error: "Re-authenticate to continue.", reauth };

  const { codes } = await regenerateRecoveryCodes(userData.user.id);
  revalidatePath("/account/security");
  return { ok: true, codes };
}

/* ============================================================
 * Internal helpers
 * ============================================================ */

interface MfaFactor {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
  created_at?: string;
}

/** Garbage-collect unverified TOTP factors more than 10 minutes old.
 *  These accumulate when a user opens the enroll dialog and bails out
 *  before entering a code. */
async function pruneUnverifiedFactors(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.auth.mfa.listFactors();
    const all = (data?.all ?? []) as MfaFactor[];
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const f of all) {
      if (f.factor_type !== "totp" || f.status === "verified") continue;
      const createdAt = f.created_at ? Date.parse(f.created_at) : NaN;
      if (!Number.isFinite(createdAt) || createdAt < cutoff) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
  } catch {
    // Non-fatal — pruning is opportunistic.
  }
}
