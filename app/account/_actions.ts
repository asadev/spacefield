"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hashIp } from "@/lib/lifecycle";
import { requireRecentAuth } from "@/lib/mfa/reauth";

/* app/account/_actions.ts — Server actions called by the /account
 * page's client form components.
 *
 *   - requestEmailChange    → supabase.auth.updateUser({ email })
 *   - requestAccountDeletion → public.request_account_deletion()
 *   - cancelAccountDeletion → public.cancel_account_deletion()
 *
 * Each returns a serialisable { ok, error? , ... } shape so the
 * client component can render inline status without bouncing through
 * exceptions. Server actions can throw, but we keep the happy path
 * resolution-based so React server-action errors don't surface as
 * generic "An error occurred" toasts.
 */

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/* ============================================================
 * Email change
 * ============================================================ */

export async function requestEmailChange(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ sentTo: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { ok: false, error: "Not signed in." };
  }
  const next = String(formData.get("new_email") ?? "").trim().toLowerCase();
  if (!next) {
    return { ok: false, error: "Enter a new email." };
  }
  // Light syntactic check. Supabase will do the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return { ok: false, error: "That doesn't look like an email." };
  }
  if (next === (userData.user.email ?? "").toLowerCase()) {
    return { ok: false, error: "That's already your current email." };
  }

  // S4 — sensitive action: require a recent reauth proof.
  const reauthUrl = await requireRecentAuth("/account");
  if (reauthUrl) redirect(reauthUrl);

  const { error } = await supabase.auth.updateUser({ email: next });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/account");
  return { ok: true, sentTo: next };
}

/* ============================================================
 * Account deletion
 * ============================================================ */

export async function requestAccountDeletion(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ graceUntil: string }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return { ok: false, error: "Not signed in." };
  }

  // Type-to-confirm — must match the current email exactly.
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const currentEmail = (userData.user.email ?? "").toLowerCase();

  if (!currentEmail) {
    return { ok: false, error: "No email on your account — can't confirm." };
  }
  if (confirm !== currentEmail) {
    return {
      ok: false,
      error: "Type your current email exactly to confirm.",
    };
  }

  // S4 — account deletion is the canonical sensitive action.
  const reauthUrl = await requireRecentAuth("/account");
  if (reauthUrl) redirect(reauthUrl);

  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const realIp = h.get("x-real-ip");
  const ip = (forwardedFor?.split(",")[0]?.trim() || realIp || "").trim() || null;
  const ipHash = await hashIp(ip);

  const { data, error } = await supabase.rpc("request_account_deletion", {
    p_reason: reason,
    p_ip_hash: ipHash,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/account");
  return { ok: true, graceUntil: String(data) };
}

export async function cancelAccountDeletion(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/account");
  return { ok: true };
}
