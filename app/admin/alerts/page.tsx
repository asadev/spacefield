import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../_lib";
import { setAlertEnabled } from "./_actions";
import { CONDITION_LABELS, CONDITION_TYPES } from "./_helpers";

import type { AdminAlertRow, AlertConditionType } from "../_types";

export const dynamic = "force-dynamic";

type SearchParams = {
  enabled?: "all" | "on" | "off";
  condition_type?: string;
};

const CONDITION_CHIP_COLORS: Record<AlertConditionType, string> = {
  signup_drop: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  webhook_failures: "bg-rose-500/15 text-rose-500",
  error_rate: "bg-rose-500/15 text-rose-500",
  cron_missed: "bg-amber-500/15 text-amber-500",
  low_credit: "bg-amber-500/15 text-amber-500",
  custom_query: "bg-app-elevated text-secondary border border-app",
  agent_failures: "bg-rose-500/15 text-rose-500",
  storage_pct: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const CHANNEL_CHIP_COLORS: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  telegram: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  whatsapp: "bg-emerald-500/15 text-emerald-500",
};

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const enabledFilter = (["all", "on", "off"].includes(sp.enabled ?? "")
    ? sp.enabled
    : "all") as "all" | "on" | "off";
  const conditionTypeFilter = (
    CONDITION_TYPES as readonly string[]
  ).includes(sp.condition_type ?? "")
    ? (sp.condition_type as AlertConditionType)
    : null;

  const admin = createAdminClient();

  let query = admin
    .from("admin_alerts")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (enabledFilter === "on") query = query.eq("enabled", true);
  else if (enabledFilter === "off") query = query.eq("enabled", false);
  if (conditionTypeFilter) query = query.eq("condition_type", conditionTypeFilter);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AdminAlertRow[];

  const stats = {
    total: count ?? rows.length,
    enabled: rows.filter((r) => r.enabled).length,
    triggered24h: rows.filter(
      (r) =>
        r.last_triggered_at &&
        Date.now() - new Date(r.last_triggered_at).getTime() <
          24 * 60 * 60 * 1000
    ).length,
    sumTriggers: rows.reduce((acc, r) => acc + (r.trigger_count ?? 0), 0),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Ops
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Admin alerts</h1>
          <p className="mt-0.5 text-xs text-muted">
            Conditional rules that watch the platform and fire on
            email/Telegram/WhatsApp. Cooldowns prevent spam; events are
            logged in <code className="font-mono">admin_alert_events</code>.
          </p>
        </div>
        <Link href="/admin/alerts/new" className={buttonClass}>
          + New alert
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} accent="emerald" />
        <StatCard
          label="Triggered (24h)"
          value={stats.triggered24h}
          accent="amber"
        />
        <StatCard
          label="Triggers all-time"
          value={stats.sumTriggers}
          accent="violet"
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/alerts"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <select
          name="enabled"
          defaultValue={enabledFilter}
          className={`${inputClass} h-9`}
        >
          <option value="all">All</option>
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
        <select
          name="condition_type"
          defaultValue={conditionTypeFilter ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any condition type</option>
          {CONDITION_TYPES.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonGhostClass}>
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Alert</th>
              <th className="px-3 py-2 text-left font-normal">Condition</th>
              <th className="px-3 py-2 text-left font-normal">Channels</th>
              <th className="px-3 py-2 text-left font-normal">Cooldown</th>
              <th className="px-3 py-2 text-left font-normal">Last fired</th>
              <th className="px-3 py-2 text-left font-normal">Triggers</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-faint">
                  No alerts yet. Create one above.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/alerts/${a.id}`}
                      className="block font-medium text-app hover:text-tool-accent"
                    >
                      {a.name}
                    </Link>
                    {a.description && (
                      <div className="mt-0.5 max-w-md truncate text-[11px] text-muted">
                        {a.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        CONDITION_CHIP_COLORS[a.condition_type] ??
                        "bg-app text-faint"
                      }`}
                    >
                      {CONDITION_LABELS[a.condition_type] ?? a.condition_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(a.action_channels ?? []).length === 0 ? (
                        <span className="text-xs text-faint">—</span>
                      ) : (
                        (a.action_channels ?? []).map((c) => (
                          <span
                            key={c}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              CHANNEL_CHIP_COLORS[c] ??
                              "bg-app-elevated text-secondary"
                            }`}
                          >
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {a.cooldown_minutes}m
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(a.last_triggered_at)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {a.trigger_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <form action={setAlertEnabled} className="inline-flex">
                      <input type="hidden" name="id" value={a.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={a.enabled ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        title={a.enabled ? "Click to disable" : "Click to enable"}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
                          a.enabled
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-app text-faint border border-app"
                        }`}
                      >
                        {a.enabled ? "On" : "Off"}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/alerts/${a.id}`}
                      className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
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
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber" | "violet";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "amber"
        ? "text-amber-500"
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
