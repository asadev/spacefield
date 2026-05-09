import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../_lib";
import { toggleRule } from "./_actions";
import {
  ACTION_CHIP_COLORS,
  ACTION_LABELS,
  ACTIONS,
  APPLIES_TO,
  APPLIES_TO_CHIP_COLORS,
  APPLIES_TO_LABELS,
  RULE_KIND_CHIP_COLORS,
  RULE_KIND_LABELS,
  RULE_KINDS,
  severityStars,
  severityToneClass,
  type ModerationRuleKind,
} from "./_helpers";

import type {
  ModerationAction,
  ModerationApplyTo,
  ModerationRuleRow,
} from "../_types";

export const dynamic = "force-dynamic";

type SearchParams = {
  enabled?: "all" | "on" | "off";
  rule_kind?: string;
  action?: string;
  applies_to?: string;
  q?: string;
};

export default async function AdminModerationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const enabledFilter = (
    ["all", "on", "off"].includes(sp.enabled ?? "") ? sp.enabled : "all"
  ) as "all" | "on" | "off";
  const ruleKindFilter = (RULE_KINDS as readonly string[]).includes(
    sp.rule_kind ?? ""
  )
    ? (sp.rule_kind as ModerationRuleKind)
    : null;
  const actionFilter = (ACTIONS as readonly string[]).includes(sp.action ?? "")
    ? (sp.action as ModerationAction)
    : null;
  const appliesToFilter = (APPLIES_TO as readonly string[]).includes(
    sp.applies_to ?? ""
  )
    ? (sp.applies_to as ModerationApplyTo)
    : null;
  const q = (sp.q ?? "").trim();

  const admin = createAdminClient();

  let query = admin
    .from("moderation_rules")
    .select("*", { count: "exact" })
    .order("severity", { ascending: false })
    .order("updated_at", { ascending: false });

  if (enabledFilter === "on") query = query.eq("enabled", true);
  else if (enabledFilter === "off") query = query.eq("enabled", false);
  if (ruleKindFilter) query = query.eq("rule_kind", ruleKindFilter);
  if (actionFilter) query = query.eq("action", actionFilter);
  if (appliesToFilter) query = query.eq("applies_to", appliesToFilter);
  if (q) query = query.ilike("pattern", `%${q}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ModerationRuleRow[];

  // Pull pending queue count for the secondary CTA.
  const { count: pendingCount } = await admin
    .from("moderation_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const stats = {
    total: count ?? rows.length,
    enabled: rows.filter((r) => r.enabled).length,
    block: rows.filter((r) => r.action === "block").length,
    pending: pendingCount ?? 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Security · Trust &amp; safety
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Content moderation
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Banned-word, regex, threshold and length rules. Matched content
            is routed to <code className="font-mono">moderation_queue</code>{" "}
            for review or blocked outright depending on the action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/moderation/queue"
            className={`${buttonGhostClass} relative`}
          >
            Queue
            {stats.pending > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                {stats.pending}
              </span>
            )}
          </Link>
          <Link href="/admin/moderation/new" className={buttonClass}>
            + New rule
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rules" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} accent="emerald" />
        <StatCard label="Blocking" value={stats.block} accent="rose" />
        <StatCard
          label="Pending review"
          value={stats.pending}
          accent="amber"
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        action="/admin/moderation"
        className="grid gap-2 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
      >
        <select
          name="enabled"
          defaultValue={enabledFilter}
          className={`${inputClass} h-9`}
        >
          <option value="all">All states</option>
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
        <select
          name="rule_kind"
          defaultValue={ruleKindFilter ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any kind</option>
          {RULE_KINDS.map((k) => (
            <option key={k} value={k}>
              {RULE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={actionFilter ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any action</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          name="applies_to"
          defaultValue={appliesToFilter ?? ""}
          className={`${inputClass} h-9`}
        >
          <option value="">Any source</option>
          {APPLIES_TO.map((a) => (
            <option key={a} value={a}>
              {APPLIES_TO_LABELS[a]}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Pattern contains..."
          className={`${inputClass} h-9`}
        />
        <button type="submit" className={buttonGhostClass}>
          Filter
        </button>
      </form>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Pattern</th>
              <th className="px-3 py-2 text-left font-normal">Action</th>
              <th className="px-3 py-2 text-left font-normal">Applies to</th>
              <th className="px-3 py-2 text-left font-normal">Severity</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-faint">
                  No rules yet. Create one above.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        RULE_KIND_CHIP_COLORS[r.rule_kind] ??
                        "bg-app text-faint"
                      }`}
                    >
                      {RULE_KIND_LABELS[r.rule_kind] ?? r.rule_kind}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/moderation/${r.id}`}
                      className="block max-w-md truncate font-mono text-xs text-app hover:text-tool-accent"
                      title={r.pattern}
                    >
                      {r.pattern}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        ACTION_CHIP_COLORS[r.action] ??
                        "bg-app text-faint"
                      }`}
                    >
                      {ACTION_LABELS[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        APPLIES_TO_CHIP_COLORS[r.applies_to] ??
                        "bg-app text-faint"
                      }`}
                    >
                      {APPLIES_TO_LABELS[r.applies_to] ?? r.applies_to}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`font-mono text-xs tabular-nums ${severityToneClass(r.severity)}`}
                      title={`Severity ${r.severity}/5`}
                    >
                      {severityStars(r.severity)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.updated_at)}
                  </td>
                  <td className="px-3 py-2">
                    <form action={toggleRule} className="inline-flex">
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={r.enabled ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        title={
                          r.enabled ? "Click to disable" : "Click to enable"
                        }
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
                          r.enabled
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-app text-faint border border-app"
                        }`}
                      >
                        {r.enabled ? "On" : "Off"}
                      </button>
                    </form>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/moderation/${r.id}`}
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
