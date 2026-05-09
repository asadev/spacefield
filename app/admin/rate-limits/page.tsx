import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, buttonGhostClass, formatDateTime, inputClass } from "../_lib";
import {
  describeScopeValue,
  matchRules,
  RATE_LIMIT_SCOPES,
  SCOPE_LABEL,
  scopeChipClass,
} from "./_helpers";
import { toggleRule } from "./_actions";

import type { RateLimitRuleRow, RateLimitScope } from "../_types";
import type { RateLimitTestInput } from "./_helpers";

export const dynamic = "force-dynamic";

type SearchParams = {
  test_user?: string;
  test_tier?: string;
  test_workspace?: string;
  test_route?: string;
};

export default async function AdminRateLimitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("rate_limit_rules")
    .select("*")
    .order("scope", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rules = (data ?? []) as RateLimitRuleRow[];

  // Stats by scope
  const stats = computeStats(rules);

  const testInput: RateLimitTestInput = {
    userId: sp.test_user?.trim() || null,
    tierId: sp.test_tier?.trim() || null,
    workspaceId: sp.test_workspace?.trim() || null,
    route: sp.test_route?.trim() || null,
  };
  const hasTestInput =
    Boolean(testInput.userId) ||
    Boolean(testInput.tierId) ||
    Boolean(testInput.workspaceId) ||
    Boolean(testInput.route);

  const matches = hasTestInput ? matchRules(rules, testInput) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Security
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Rate limits</h1>
          <p className="mt-0.5 text-xs text-muted">
            Per-scope limits enforced at the API edge. More-specific
            scopes win when multiple rules match.
          </p>
        </div>
        <Link href="/admin/rate-limits/new" className={buttonClass}>
          + New rule
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} accent="emerald" />
        <StatCard label="Global" value={stats.byScope.global} />
        <StatCard label="Route" value={stats.byScope.route} accent="amber" />
        <StatCard label="User/Tier/Ws" value={stats.byScope.user + stats.byScope.tier + stats.byScope.workspace} accent="violet" />
      </div>

      {/* Tester */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">Tester</h2>
          {hasTestInput && (
            <Link
              href="/admin/rate-limits"
              className="text-[11px] text-muted hover:text-app"
            >
              Reset
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          Mock identity. Empty fields are ignored. Matches are sorted by
          specificity (route &gt; user &gt; workspace &gt; tier &gt; global).
        </p>
        <form
          method="get"
          action="/admin/rate-limits"
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            type="text"
            name="test_user"
            defaultValue={sp.test_user ?? ""}
            placeholder="user_id (UUID)"
            className={`${inputClass} font-mono`}
          />
          <input
            type="text"
            name="test_tier"
            defaultValue={sp.test_tier ?? ""}
            placeholder="tier (free/pro/team/enterprise)"
            className={inputClass}
          />
          <input
            type="text"
            name="test_workspace"
            defaultValue={sp.test_workspace ?? ""}
            placeholder="workspace_id (UUID)"
            className={`${inputClass} font-mono`}
          />
          <input
            type="text"
            name="test_route"
            defaultValue={sp.test_route ?? ""}
            placeholder="/api/...some/route"
            className={`${inputClass} font-mono`}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className={buttonClass}>
              Test against rules
            </button>
          </div>
        </form>

        {hasTestInput && (
          <div className="mt-4 rounded-lg border border-app bg-app p-3">
            {matches.length === 0 ? (
              <div className="text-center text-xs text-faint">
                No enabled rules match this identity.
              </div>
            ) : (
              <ol className="space-y-2">
                {matches.map((m, i) => (
                  <li
                    key={m.rule.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-app bg-app-elevated p-2.5 text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="font-mono text-[10px] text-faint">
                        #{i + 1}
                      </span>
                      <ScopeChip scope={m.rule.scope} />
                      <span className="truncate text-app">{m.reason}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-secondary">
                        {m.rule.limit_count}/{m.rule.window_sec}s
                      </span>
                      <Link
                        href={`/admin/rate-limits/${m.rule.id}`}
                        className="text-tool-accent hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      {/* Index */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Scope</th>
              <th className="px-3 py-2 text-left font-normal">Value</th>
              <th className="px-3 py-2 text-left font-normal">Route</th>
              <th className="px-3 py-2 text-left font-normal">Limit</th>
              <th className="px-3 py-2 text-left font-normal">Burst</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-faint">
                  No rate-limit rules yet.{" "}
                  <Link
                    href="/admin/rate-limits/new"
                    className="text-tool-accent hover:underline"
                  >
                    Add the first one.
                  </Link>
                </td>
              </tr>
            ) : (
              rules.map((r) => <RuleRow key={r.id} rule={r} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────── components ─────────────────────── */

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

function RuleRow({ rule }: { rule: RateLimitRuleRow }) {
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <ScopeChip scope={rule.scope} />
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-secondary">
        {describeScopeValue(rule)}
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-muted">
        {rule.route_pattern ?? "—"}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums text-app">
        {rule.limit_count}
        <span className="text-faint">/{rule.window_sec}s</span>
      </td>
      <td className="px-3 py-2 font-mono tabular-nums text-secondary">
        {rule.burst_count ?? "—"}
      </td>
      <td className="px-3 py-2">
        <form action={toggleRule} className="inline-flex">
          <input type="hidden" name="id" value={rule.id} />
          <input
            type="hidden"
            name="enabled"
            value={rule.enabled ? "false" : "true"}
          />
          <button
            type="submit"
            title={rule.enabled ? "Click to disable" : "Click to enable"}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${
              rule.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {rule.enabled ? "On" : "Off"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
        {formatDateTime(rule.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/rate-limits/${rule.id}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function ScopeChip({ scope }: { scope: RateLimitScope }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${scopeChipClass(
        scope
      )}`}
    >
      {SCOPE_LABEL[scope]}
    </span>
  );
}

function computeStats(rules: RateLimitRuleRow[]) {
  const byScope: Record<RateLimitScope, number> = {
    global: 0,
    tier: 0,
    user: 0,
    workspace: 0,
    route: 0,
  };
  let enabled = 0;
  for (const r of rules) {
    byScope[r.scope] += 1;
    if (r.enabled) enabled += 1;
  }
  return { total: rules.length, enabled, byScope };
}

// Re-export for new/edit pages — consumers get the same labels.
export { RATE_LIMIT_SCOPES };
