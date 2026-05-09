import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../_lib";
import { toggleIntegration } from "./_actions";
import {
  INTEGRATION_STATUSES,
  STATUS_CHIP_CLASS,
  firstLetterAvatar,
  parseStatus,
  readRequiredEnv,
  type IntegrationFilters,
} from "./_helpers";

import type { IntegrationRow } from "../_types";

export const dynamic = "force-dynamic";

type RawSearchParams = {
  category?: string;
  status?: string;
  q?: string;
};

export default async function AdminIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters: IntegrationFilters = {
    category: sp.category?.trim() || undefined,
    status: parseStatus(sp.status) ?? undefined,
    search: sp.q?.trim() || undefined,
  };

  const admin = createAdminClient();
  let query = admin
    .from("integrations")
    .select("*", { count: "exact" })
    .order("category", { ascending: true })
    .order("display_name", { ascending: true });

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) {
    const needle = `%${filters.search}%`;
    query = query.or(
      `display_name.ilike.${needle},description.ilike.${needle},id.ilike.${needle}`
    );
  }

  const { data, count, error } = await query;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load integrations: {error.message}
      </div>
    );
  }
  const rows = (data ?? []) as IntegrationRow[];

  // Distinct categories for the filter dropdown — pulled from the
  // unfiltered superset so the dropdown stays stable across filters.
  const allCategoriesRes = await admin
    .from("integrations")
    .select("category")
    .order("category", { ascending: true });
  const allCategories = Array.from(
    new Set(
      (allCategoriesRes.data ?? []).map((r) => String(r.category ?? ""))
    )
  ).filter(Boolean);

  const stats = {
    total: count ?? rows.length,
    available: rows.filter((r) => r.status === "available").length,
    beta: rows.filter((r) => r.status === "beta").length,
    enabled: rows.filter((r) => r.enabled).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Integrations</h1>
          <p className="mt-0.5 text-xs text-muted">
            Third-party catalog. Status drives the marketing UI; enabled
            drives runtime availability. Edit per-row to manage{" "}
            <code className="rounded bg-app px-1 text-[11px]">oauth_config</code>{" "}
            and required env vars.
          </p>
        </div>
        <Link href="/admin/integrations/new" className={buttonClass}>
          + New integration
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Available" value={stats.available} accent="emerald" />
        <StatCard label="Beta" value={stats.beta} accent="amber" />
        <StatCard label="Enabled" value={stats.enabled} accent="violet" />
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/integrations"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
      >
        <input
          type="text"
          name="q"
          defaultValue={filters.search ?? ""}
          placeholder="Search id / name / description"
          className={`${inputClass} h-9`}
        />
        <select
          name="category"
          defaultValue={filters.category ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any category</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any status</option>
          {INTEGRATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Link href="/admin/integrations" className={buttonGhostClass}>
          Clear
        </Link>
        <button type="submit" className={buttonClass}>
          Apply
        </button>
      </form>

      {/* Index table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="w-12 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-normal">Integration</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-right font-normal">Env vars</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-faint">
                  No integrations match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => <IntegrationRowEl key={r.id} row={r} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────── components ───────────────────── */

function IntegrationRowEl({ row }: { row: IntegrationRow }) {
  const requiredEnv = readRequiredEnv(row.required_env);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2 align-middle">
        <Logo url={row.logo_url} name={row.display_name} />
      </td>
      <td className="px-3 py-2">
        <Link
          href={`/admin/integrations/${encodeURIComponent(row.id)}`}
          className="block font-medium text-app hover:text-tool-accent"
        >
          {row.display_name}
        </Link>
        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
          {row.id}
        </div>
        {row.description && (
          <div className="mt-0.5 line-clamp-2 max-w-md text-[11px] text-muted">
            {row.description}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex w-fit items-center rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium text-secondary border border-app">
          {row.category}
        </span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            STATUS_CHIP_CLASS[row.status]
          }`}
        >
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        {requiredEnv.length === 0 ? (
          <span className="text-faint text-xs">—</span>
        ) : (
          <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium text-tool-accent">
            {requiredEnv.length}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <form action={toggleIntegration} className="inline-flex">
          <input type="hidden" name="id" value={row.id} />
          <input
            type="hidden"
            name="enabled"
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
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(row.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/integrations/${encodeURIComponent(row.id)}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function Logo({
  url,
  name,
  size = 32,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-md border border-app bg-app object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex items-center justify-center rounded-md border border-app bg-app-elevated text-sm font-semibold text-secondary"
      style={{ width: size, height: size }}
    >
      {firstLetterAvatar(name)}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "rose" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
        : accent === "rose"
          ? "text-rose-500"
          : accent === "violet"
            ? "text-tool-accent"
            : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
