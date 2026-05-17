import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import { getActiveAccountDeletion } from "@/lib/lifecycle";

import EmailChangeCard from "./_components/EmailChangeCard";
import DangerZoneCard from "./_components/DangerZoneCard";

/* /account — User-facing account settings.
 *
 * Three sections:
 *   1. Profile  — current email + sign-out info (read-only summary;
 *      the in-app SettingsPanel handles avatar/name/bio editing).
 *   2. Security → Email change (Supabase Auth round-trip).
 *   3. Danger zone — Delete account (30-day grace).
 *
 * Auth gating: redirect to /signin if there's no session. We don't
 * 401 — the page is a stable, link-shareable URL, so a redirect is
 * the expected UX.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account — Space Field",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect("/signin?next=/account");
  }
  const user = userData.user;
  const email = user.email ?? "(no email)";

  const pendingDeletion = await getActiveAccountDeletion();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted">
          Email, security, and deletion. Profile picture, name, and bio are
          edited inside the app — open Settings from your avatar there.
        </p>
      </header>

      {/* Profile summary */}
      <section className="mb-6 rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Profile
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-faint">Email</dt>
            <dd className="mt-0.5 font-medium">{email}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">User ID</dt>
            <dd className="mt-0.5 truncate font-mono text-xs">{user.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Joined</dt>
            <dd className="mt-0.5">
              {user.created_at
                ? new Date(user.created_at).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {/* Security — email change */}
      <section className="mb-6 rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Security
        </h2>
        <p className="mt-1 mb-4 text-xs text-faint">
          Changing your email sends a confirmation link to the new address.
          The change only takes effect after you click that link.
        </p>
        <EmailChangeCard currentEmail={email} />
      </section>

      {/* Danger zone */}
      <DangerZoneCard
        currentEmail={email}
        pendingDeletion={pendingDeletion}
      />
    </main>
  );
}
