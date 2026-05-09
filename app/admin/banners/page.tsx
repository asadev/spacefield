import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { BannerVariant, SiteBannerRow } from "../_types";
import { toggleBanner } from "./_actions";

export const dynamic = "force-dynamic";

const VARIANT_CHIP: Record<BannerVariant, string> = {
  info: "bg-tool-accent-soft text-tool-accent",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  success: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  error: "bg-rose-500/15 text-rose-500",
};

function audienceChip(audience: string): string {
  switch (audience) {
    case "all":
      return "bg-app-elevated text-secondary border border-app";
    case "authenticated":
      return "bg-tool-accent-soft text-tool-accent";
    case "tier":
      return "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400";
    case "allowlist":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

function bannerStatus(b: SiteBannerRow): "active" | "scheduled" | "expired" | "off" {
  if (!b.enabled) return "off";
  const now = Date.now();
  const starts = b.starts_at ? new Date(b.starts_at).getTime() : null;
  const ends = b.ends_at ? new Date(b.ends_at).getTime() : null;
  if (starts && now < starts) return "scheduled";
  if (ends && now > ends) return "expired";
  return "active";
}

async function toggleBannerAction(formData: FormData): Promise<void> {
  "use server";
  await toggleBanner(formData);
}

export default async function AdminBannersPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_banners")
    .select("*")
    .order("enabled", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const banners = (data ?? []) as SiteBannerRow[];

  let active = 0;
  let scheduled = 0;
  let expired = 0;
  for (const b of banners) {
    const s = bannerStatus(b);
    if (s === "active") active += 1;
    else if (s === "scheduled") scheduled += 1;
    else if (s === "expired") expired += 1;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Site banners</h1>
          <p className="mt-0.5 text-xs text-muted">
            Top-of-page announcements rendered for visitors. Schedule windows
            and audience are honored at render time.
          </p>
        </div>
        <Link
          href="/admin/banners/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New banner
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value={active} tone="emerald" />
        <StatCard label="Scheduled" value={scheduled} tone="default" />
        <StatCard label="Expired" value={expired} tone="muted" />
        <StatCard label="Total" value={banners.length} />
      </div>

      {error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Message</th>
              <th className="px-3 py-2 text-left font-normal">Variant</th>
              <th className="px-3 py-2 text-left font-normal">Audience</th>
              <th className="px-3 py-2 text-left font-normal">Window</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {banners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No banners yet. Create one to display a top-of-page notice.
                </td>
              </tr>
            ) : (
              banners.map((b) => {
                const status = bannerStatus(b);
                return (
                  <tr
                    key={b.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="max-w-md px-3 py-2">
                      <Link
                        href={`/admin/banners/${b.id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        <span className="line-clamp-1">{b.message}</span>
                      </Link>
                      {b.cta_label && (
                        <div className="mt-0.5 text-[11px] text-faint">
                          CTA: {b.cta_label}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${VARIANT_CHIP[b.variant]}`}
                      >
                        {b.variant}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${audienceChip(b.audience)}`}
                      >
                        {b.audience}
                      </span>
                      {b.audience === "tier" && b.audience_tiers.length > 0 && (
                        <div className="mt-0.5 text-[10px] text-faint">
                          {b.audience_tiers.join(", ")}
                        </div>
                      )}
                      {b.audience === "allowlist" && (
                        <div className="mt-0.5 text-[10px] text-faint">
                          {b.audience_user_ids.length} user
                          {b.audience_user_ids.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      <div>{formatDateTime(b.starts_at)}</div>
                      <div className="text-faint">→ {formatDateTime(b.ends_at)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={status} />
                      <form
                        action={toggleBannerAction}
                        className="mt-1 inline-flex items-center gap-1"
                      >
                        <input type="hidden" name="id" value={b.id} />
                        <input
                          type="hidden"
                          name="next"
                          value={b.enabled ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-app bg-app px-2 py-0.5 text-[10px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          {b.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/banners/${b.id}`}
                        className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "rose" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500"
        : tone === "muted"
          ? "text-secondary"
          : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function StatusChip({
  status,
}: {
  status: "active" | "scheduled" | "expired" | "off";
}) {
  const cfg: Record<typeof status, { label: string; cls: string }> = {
    active: {
      label: "Active",
      cls: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
    },
    scheduled: {
      label: "Scheduled",
      cls: "bg-tool-accent-soft text-tool-accent",
    },
    expired: {
      label: "Expired",
      cls: "bg-app-elevated text-secondary border border-app",
    },
    off: {
      label: "Disabled",
      cls: "bg-rose-500/15 text-rose-500",
    },
  };
  const c = cfg[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
