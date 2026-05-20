"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hashIp } from "@/lib/lifecycle";
import { requireRecentAuth } from "@/lib/mfa/reauth";
import { withIdempotency } from "@/lib/idempotency";
import { emit, OutboxEventTypes } from "@/lib/outbox";

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

  // Idempotency: a double-click on Confirm Delete would otherwise call
  // request_account_deletion twice, and while the RPC is itself
  // idempotent at the data layer (status flips and stays), the second
  // call resets the 30-day grace window. Key the wrapper on the user
  // id + a short time bucket (1 minute) so legitimate retries within
  // a single submission collapse but a deliberate "change my mind /
  // re-request" 5 minutes later still works.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `account-deletion:${userData.user.id}:${minuteBucket}`;

  type DeletionResp = { ok: true; graceUntil: string } | { ok: false; error: string };
  const wrapped = await withIdempotency<DeletionResp>(
    {
      key: idempotencyKey,
      ttl_sec: 60 * 60, // 1h cache — well past the legit retry window
      supabase: { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey },
    },
    async () => {
      const { data, error } = await supabase.rpc("request_account_deletion", {
        p_reason: reason,
        p_ip_hash: ipHash,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      const graceUntil = String(data);
      // Outbox event for any downstream listeners (email reminders,
      // billing, future analytics). Dedup by user_id + the same
      // minute-bucket so retries don't fan out twice.
      void emit(
        OutboxEventTypes.AccountDeletionQueued,
        {
          user_id: userData.user.id,
          grace_until: graceUntil,
          reason,
          kind: "scheduled",
        },
        { dedupeKey: `account-deletion:${userData.user.id}:${minuteBucket}` }
      );
      return { ok: true, graceUntil };
    }
  );

  if (!wrapped.ok) {
    return { ok: false, error: wrapped.error };
  }
  revalidatePath("/account");
  return { ok: true, graceUntil: wrapped.graceUntil };
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
