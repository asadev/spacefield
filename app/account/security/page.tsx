import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecentAuth } from "@/lib/mfa/reauth";

import FactorList from "./_components/FactorList";
import EnrollFactor from "./_components/EnrollFactor";
import RecoveryCodes from "./_components/RecoveryCodes";

/* /account/security — Security tab. Three panels:
 *
 *   1. Authenticator apps  — list of enrolled TOTP factors + the
 *      "Add authenticator" button. Disabling a factor is gated on a
 *      recent-auth proof.
 *   2. Recovery codes      — count remaining, regenerate (also gated
 *      on recent auth).
 *   3. Reauth status       — small badge showing whether the user
 *      currently has a fresh proof-of-presence cookie and a link to
 *      refresh it.
 *
 * Auth gating: same redirect pattern as /account.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security — Space Field",
  robots: { index: false, follow: false },
};

interface FactorSummary {
  id: string;
  friendly_name: string | null;
  status: "verified" | "unverified";
  created_at: string | null;
}

export default async function SecurityPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect("/signin?next=/account/security");
  }
  const user = userData.user;

  // Pull enrolled factors. We surface verified TOTP factors only — the
  // unverified ones are pruned on the next enroll attempt anyway.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const totpFactors: FactorSummary[] = (factorsData?.totp ?? [])
    .map((f) => ({
      id: f.id,
      friendly_name: f.friendly_name ?? null,
      status: "verified" as const,
      created_at: f.created_at ?? null,
    }));

  // Recovery-code count (admin client so we can read across RLS — view
  // also works, but admin is consistent with the regenerate path).
  let remainingRecovery = 0;
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("used_at", null);
    remainingRecovery = count ?? 0;
  } catch {
    remainingRecovery = 0;
  }

  const hasTotp = totpFactors.length > 0;
  const recent = await isRecentAuth();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 space-y-1">
        <div className="text-xs text-faint">
          <Link href="/account" className="hover:text-app">
            ← Account
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted">
          Add a second factor and manage recovery codes. Sensitive actions
          (disable 2FA, regenerate codes, delete account) need a fresh
          proof — sign-in alone isn&apos;t enough.
        </p>
      </header>

      {/* Reauth status badge */}
      <section
        className={`mb-6 flex items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
          recent
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-app bg-app-elevated"
        }`}
      >
        <div>
          <div className="font-medium">
            {recent ? "Recent auth: active" : "Recent auth: not set"}
          </div>
          <p className="text-xs text-muted">
            {recent
              ? "Sensitive actions are unlocked for the next few minutes."
              : "You’ll be asked to confirm with a code before any destructive action."}
          </p>
        </div>
        {recent ? null : (
          <Link
            href="/auth/reauth?next=/account/security"
            className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs font-medium hover:bg-app-elevated"
          >
            Verify now
          </Link>
        )}
      </section>

      {/* Authenticator apps */}
      <section className="mb-6 rounded-xl border border-app bg-app-elevated p-5">
        <header className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Authenticator apps
          </h2>
          <p className="mt-1 text-xs text-faint">
            Use any TOTP app — 1Password, Bitwarden, Aegis, Google Authenticator.
            We don&apos;t need anything specific.
          </p>
        </header>

        <FactorList factors={totpFactors} />

        <div className="mt-4">
          <EnrollFactor disabled={hasTotp} />
        </div>
      </section>

      {/* Recovery codes */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <header className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recovery codes
          </h2>
          <p className="mt-1 text-xs text-faint">
            Single-use backup codes. If you lose your authenticator, a
            code lets you sign in once. Generating a new batch invalidates
            any unused codes from before.
          </p>
        </header>

        <RecoveryCodes remaining={remainingRecovery} hasTotp={hasTotp} />
      </section>
    </main>
  );
}
