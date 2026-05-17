"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { hashIp } from "@/lib/lifecycle";
import { setRecentAuthNow } from "@/lib/mfa/reauth";
import { consumeRecoveryCode } from "@/lib/mfa/recovery";

/* app/auth/reauth/_actions.ts — Server action for the /auth/reauth
 * page. Single entry point: `submitReauth(formData)`.
 *
 * Inputs:
 *   - `mode`: "totp" | "recovery"
 *   - `code`: 6-digit TOTP or alphanumeric recovery code
 *   - `next`: where to redirect after a successful proof. Validated to
 *     start with `/`.
 *
 * On success we set the recent-auth cookie and redirect. On failure we
 * return a serializable error object the client form can render.
 */

export type ReauthResult = { ok: true } | { ok: false; error: string };

function safeNext(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  if (!v.startsWith("/") || v.startsWith("//")) return "/account";
  return v;
}

export async function submitReauth(
  _prev: ReauthResult | null,
  formData: FormData,
): Promise<ReauthResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: "Not signed in." };

  const mode = String(formData.get("mode") ?? "totp");
  const code = String(formData.get("code") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (!code) return { ok: false, error: "Enter a code." };

  if (mode === "totp") {
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
      return { ok: false, error: "Enter the 6-digit code from your app." };
    }
    const ok = await verifyTotp(supabase, code.replace(/\s+/g, ""));
    if (!ok) return { ok: false, error: "Code didn’t match. Try again." };
  } else if (mode === "recovery") {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const real = h.get("x-real-ip");
    const ip = (fwd?.split(",")[0]?.trim() || real || "").trim() || null;
    const ipHash = await hashIp(ip);
    const ok = await consumeRecoveryCode(code, ipHash);
    if (!ok) return { ok: false, error: "Recovery code not recognised." };
  } else {
    return { ok: false, error: "Unsupported verification mode." };
  }

  await setRecentAuthNow();
  redirect(next);
}

interface MfaFactor {
  id: string;
  factor_type: string;
  status: string;
}

async function verifyTotp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  const factors = ((data?.all ?? []) as MfaFactor[]).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  for (const f of factors) {
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: f.id,
    });
    if (challengeErr || !challenge) continue;
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: f.id,
      challengeId: challenge.id,
      code,
    });
    if (!verifyErr) return true;
  }
  return false;
}
