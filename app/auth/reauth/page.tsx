import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import ReauthForm from "./ReauthForm";

/* /auth/reauth — Step-up prompt. Reached when a server action calls
 * `requireRecentAuth(returnTo)` and the proof cookie is missing or
 * stale. Verifies one of:
 *
 *   - A fresh TOTP code (if the user has an enrolled factor).
 *   - A single-use recovery code (always available if codes were
 *     ever generated).
 *
 * On success the reauth form server actions stamp the proof cookie
 * via `setRecentAuthNow()` and we redirect back to `?next=`.
 *
 * `?next=` is validated to start with `/` (no protocol, no `//host`)
 * — defense in depth against open-redirect.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm it’s you — Space Field",
  robots: { index: false, follow: false },
};

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return "/account";
  if (!v.startsWith("/") || v.startsWith("//")) return "/account";
  return v;
}

export default async function ReauthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect(`/signin?next=${encodeURIComponent(`/auth/reauth?next=${next}`)}`);
  }

  // Does the user have a verified TOTP factor?
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasTotp = (factorsData?.totp ?? []).length > 0;

  // Are there any active recovery codes? (Cheap admin count.)
  let hasRecovery = false;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id)
      .is("used_at", null);
    hasRecovery = (count ?? 0) > 0;
  } catch {
    hasRecovery = false;
  }

  // If the user has neither TOTP nor recovery codes, the reauth gate
  // would lock them out of sensitive actions forever. We still let
  // them proceed: there's nothing to verify yet, so we just stamp the
  // cookie and bounce. This degrades gracefully for accounts that
  // pre-date the 2FA rollout.
  if (!hasTotp && !hasRecovery) {
    const { setRecentAuthNow } = await import("@/lib/mfa/reauth");
    await setRecentAuthNow();
    redirect(next);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <header className="mb-6 space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Confirm it’s you</h1>
        <p className="text-sm text-muted">
          You’re about to do something sensitive. Enter a code from your
          authenticator app{hasRecovery ? " or use a recovery code" : ""}.
        </p>
      </header>

      <div className="rounded-2xl border border-app bg-app-elevated p-5 shadow-sm">
        <ReauthForm next={next} hasTotp={hasTotp} hasRecovery={hasRecovery} />
      </div>

      <p className="mt-4 text-center text-xs text-faint">
        Lost both your app and your codes?{" "}
        <Link href="/help" className="underline hover:text-app">
          Contact support
        </Link>
        .
      </p>
    </main>
  );
}
