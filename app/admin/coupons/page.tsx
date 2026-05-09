import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, inputClass } from "../_lib";
import type { CouponKind, CouponRow } from "../_types";
import { toggleCoupon } from "./_actions";
import {
  COUPON_KIND_LABELS,
  couponKindChipClass,
  couponSchedule,
  couponScheduleChipClass,
  formatCouponValue,
} from "./_helpers";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type SearchParams = {
  page?: string;
  q?: string;
  kind?: string;
  enabled?: string;
};

export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim();
  const kindRaw = (sp.kind ?? "").trim();
  const kind: CouponKind | "" =
    kindRaw === "percent" ||
    kindRaw === "fixed" ||
    kindRaw === "tier_upgrade" ||
    kindRaw === "free_months"
      ? kindRaw
      : "";
  const enabledFilterRaw = (sp.enabled ?? "").trim();
  const enabledFilter =
    enabledFilterRaw === "true" || enabledFilterRaw === "false"
      ? enabledFilterRaw
      : "";

  const admin = createAdminClient();

  const buildBase = () => {
    let query = admin.from("coupons").select("*", { count: "exact" });
    if (kind) query = query.eq("kind", kind);
    if (enabledFilter) {
      query = query.eq("enabled", enabledFilter === "true");
    }
    if (q) {
      const escaped = q.replace(/,/g, " ").replace(/\*/g, "");
      query = query.or(
        `code.ilike.%${escaped.toUpperCase()}%,description.ilike.%${escaped}%`
      );
    }
    return query;
  };

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const [pageRes, statsRes] = await Promise.all([
    buildBase()
      .order("created_at", { ascending: false })
      .range(from, to),
    admin.from("coupons").select("code, redemption_count, enabled"),
  ]);

  const rows = (pageRes.data ?? []) as CouponRow[];
  const total = pageRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  type StatRow = Pick<CouponRow, "code" | "redemption_count" | "enabled">;
  const stats = (statsRes.data ?? []) as StatRow[];
  const totalCoupons = stats.length;
  const activeCoupons = stats.filter((s) => s.enabled).length;
  const totalRedemptions = stats.reduce(
    (acc, s) => acc + (s.redemption_count ?? 0),
    0
  );
  const top = [...stats]
    .sort((a, b) => (b.redemption_count ?? 0) - (a.redemption_count ?? 0))
    .find((s) => (s.redemption_count ?? 0) > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Coupons</h1>
          <p className="mt-0.5 text-xs text-muted">
            Promo codes redeemable by users — percent off, fixed amount, tier
            upgrade, or free months. Track redemptions and schedule windows.
          </p>
        </div>
        <Link href="/admin/coupons/new" className={buttonClass}>
          + New coupon
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total coupons" value={totalCoupons.toLocaleString()} />
        <StatCard
          label="Active"
          value={activeCoupons.toLocaleString()}
          tone="emerald"
        />
        <StatCard
          label="Total redemptions"
          value={totalRedemptions.toLocaleString()}
          tone="violet"
        />
        <StatCard
          label="Top by redemptions"
          value={
            top
              ? `${top.code} (${(top.redemption_count ?? 0).toLocaleString()})`
              : "—"
          }
          tone="muted"
          mono
        />
      </div>

      {/* Filters */}
      <form
        action="/admin/coupons"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-3 sm:grid-cols-[1fr_180px_140px_auto]"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search code or description"
          className={`${inputClass} h-9`}
        />
        <select
          name="kind"
          defaultValue={kind}
          className={`${inputClass} h-9`}
        >
          <option value="">All kinds</option>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount</option>
          <option value="tier_upgrade">Tier upgrade</option>
          <option value="free_months">Free months</option>
        </select>
        <select
          name="enabled"
          defaultValue={enabledFilter}
          className={`${inputClass} h-9`}
        >
          <option value="">All</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
      </form>

      <p className="text-xs text-muted">
        {total.toLocaleString()} match{total === 1 ? "" : "es"} · page {page} of{" "}
        {totalPages}
      </p>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Code</th>
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Value</th>
              <th className="px-3 py-2 text-left font-normal">Redemptions</th>
              <th className="px-3 py-2 text-left font-normal">Schedule</th>
              <th className="px-3 py-2 text-left font-normal">Tiers</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-faint">
                  No coupons match.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <CouponRowView key={row.code} row={row} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink
          page={page - 1}
          disabled={page <= 1}
          q={q}
          kind={kind}
          enabled={enabledFilter}
        >
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          page={page + 1}
          disabled={page >= totalPages}
          q={q}
          kind={kind}
          enabled={enabledFilter}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

function CouponRowView({ row }: { row: CouponRow }) {
  const schedule = couponSchedule(row.enabled, row.starts_at, row.ends_at);
  const encoded = encodeURIComponent(row.code);
  const max = row.max_redemptions;
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/coupons/${encoded}`}
          className="font-mono text-xs font-semibold text-app hover:text-tool-accent"
        >
          {row.code}
        </Link>
        {row.description && (
          <div className="mt-0.5 truncate text-[11px] text-muted">
            {row.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${couponKindChipClass(
            row.kind
          )}`}
        >
          {COUPON_KIND_LABELS[row.kind]}
        </span>
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-app">
        {formatCouponValue(row.kind, row.value)}
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {(row.redemption_count ?? 0).toLocaleString()}
        {max !== null && (
          <span className="text-faint"> / {max.toLocaleString()}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${couponScheduleChipClass(
            schedule.tone
          )}`}
        >
          {schedule.label}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-secondary">
        {row.applies_to_tiers.length === 0 ? (
          <span className="text-faint">all</span>
        ) : (
          row.applies_to_tiers.join(", ")
        )}
      </td>
      <td className="px-3 py-2">
        <form action={toggleCoupon} className="inline-flex items-center gap-2">
          <input type="hidden" name="code" value={row.code} />
          <input
            type="hidden"
            name="next"
            value={row.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            title={row.enabled ? "Click to disable" : "Click to enable"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
              row.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {row.enabled ? "On" : "Off"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/coupons/${encoded}`}
          className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "rose" | "muted" | "violet";
  mono?: boolean;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-500 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-500"
        : tone === "muted"
          ? "text-secondary"
          : tone === "violet"
            ? "text-tool-accent"
            : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate text-2xl font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-base" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PageLink({
  page,
  disabled,
  q,
  kind,
  enabled,
  children,
}: {
  page: number;
  disabled?: boolean;
  q?: string;
  kind?: CouponKind | "";
  enabled?: string;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (enabled) params.set("enabled", enabled);
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={`/admin/coupons?${params.toString()}`} className={cls}>
      {children}
    </Link>
  );
}

