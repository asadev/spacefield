import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MaintenanceStateRow } from "@/app/admin/_types";

import { RetryButton } from "./_RetryButton";

/* Public maintenance page. The middleware redirects all non-system
 * traffic here when maintenance_active() returns true. We render the
 * message admins set in the maintenance_state row.
 *
 * Force-dynamic so we never serve a stale message after admins flip the
 * toggle off — they expect refresh-and-it-works behavior. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "We'll be back shortly",
  description: "Space Field is undergoing scheduled maintenance.",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  let row: MaintenanceStateRow | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("maintenance_state")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    row = (data as MaintenanceStateRow | null) ?? null;
  } catch {
    row = null;
  }

  const message =
    row?.message?.trim() ||
    "Space Field is undergoing scheduled maintenance. We'll be back shortly.";
  const readOnly = row?.read_only ?? false;
  const endsAt = row?.ends_at ?? null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050507] px-6">
      <div className="max-w-md text-center">
        <p className="mb-4 text-[0.6rem] uppercase tracking-[0.25em] text-gray-500">
          Maintenance
        </p>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-white">
          We&apos;ll be back shortly
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-gray-400">{message}</p>
        {readOnly && (
          <p className="mb-6 text-xs leading-relaxed text-amber-400/90">
            The site is currently in read-only mode. Browsing and signed-in
            sessions still work, but new edits are paused.
          </p>
        )}
        {endsAt && <ExpectedReturn endsAt={endsAt} />}
        <div className="flex flex-wrap justify-center gap-3">
          <RetryButton />
          <a
            href="https://status.spacefield.co"
            className="border border-transparent px-7 py-4 text-[0.75rem] uppercase tracking-[0.15em] text-gray-400 transition-colors hover:text-white"
          >
            Status page
          </a>
        </div>
      </div>
    </main>
  );
}

function ExpectedReturn({ endsAt }: { endsAt: string }) {
  const ts = new Date(endsAt);
  if (Number.isNaN(ts.getTime())) return null;
  const formatted = ts.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <p className="mb-6 text-xs leading-relaxed text-gray-500">
      Expected back by {formatted}.
    </p>
  );
}
