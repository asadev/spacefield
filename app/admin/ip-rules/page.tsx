import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDate, formatDateTime, inputClass } from "../_lib";
import { actionChipClass, isValidIpv4, matchIpRules } from "./_helpers";
import { toggleRule } from "./_actions";

import type { IpRuleRow } from "../_types";

export const dynamic = "force-dynamic";

type SearchParams = {
  test_ip?: string;
};

export default async function AdminIpRulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ip_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rules = (data ?? []) as IpRuleRow[];

  const stats = computeStats(rules);

  const testIpRaw = sp.test_ip?.trim() ?? "";
  const testIpValid = testIpRaw.length > 0 && isValidIpv4(testIpRaw);
  const matches = testIpValid ? matchIpRules(rules, testIpRaw) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Security
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">IP rules</h1>
          <p className="mt-0.5 text-xs text-muted">
            Allow / block by IPv4 CIDR. Expired rules are skipped at match
            time. Rules cascade — add narrowly-scoped allows above broad
            blocks if you need exceptions.
          </p>
        </div>
        <Link href="/admin/ip-rules/new" className={buttonClass}>
          + New rule
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Enabled" value={stats.enabled} accent="emerald" />
        <StatCard label="Allow" value={stats.allow} accent="emerald" />
        <StatCard label="Block" value={stats.block} accent="rose" />
      </div>

      {/* Tester */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">Quick tester</h2>
          {testIpRaw && (
            <Link
              href="/admin/ip-rules"
              className="text-[11px] text-muted hover:text-app"
            >
              Reset
            </Link>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          Paste an IPv4 to see which enabled rules match it (allow + block).
        </p>
        <form
          method="get"
          action="/admin/ip-rules"
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <input
            type="text"
            name="test_ip"
            defaultValue={testIpRaw}
            placeholder="203.0.113.42"
            className={`${inputClass} max-w-[240px] font-mono`}
          />
          <button type="submit" className={buttonClass}>
            Test
          </button>
        </form>

        {testIpRaw.length > 0 && !testIpValid && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-500">
            Not a valid IPv4 address.
          </div>
        )}

        {testIpValid && (
          <div className="mt-4 rounded-lg border border-app bg-app p-3">
            {matches.length === 0 ? (
              <div className="text-center text-xs text-faint">
                No rules match {testIpRaw}.
              </div>
            ) : (
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li
                    key={m.rule.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-app bg-app-elevated p-2.5 text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <ActionChip action={m.rule.action} />
                      <span className="truncate font-mono text-app">
                        {m.rule.cidr}
                      </span>
                      {m.rule.reason && (
                        <span className="truncate text-muted">
                          — {m.rule.reason}
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/admin/ip-rules/${m.rule.id}`}
                      className="text-tool-accent hover:underline"
                    >
                      Edit
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Index */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Action</th>
              <th className="px-3 py-2 text-left font-normal">CIDR</th>
              <th className="px-3 py-2 text-left font-normal">Reason</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-faint">
                  No IP rules yet.{" "}
                  <Link
                    href="/admin/ip-rules/new"
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
  accent?: "emerald" | "rose";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-500"
      : accent === "rose"
        ? "text-rose-500"
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

function ActionChip({ action }: { action: "allow" | "block" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${actionChipClass(
        action
      )}`}
    >
      {action === "allow" ? "Allow" : "Block"}
    </span>
  );
}

function RuleRow({ rule }: { rule: IpRuleRow }) {
  const expired =
    rule.expires_at &&
    new Date(rule.expires_at).getTime() < Date.now();
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40">
      <td className="px-3 py-2">
        <ActionChip action={rule.action} />
      </td>
      <td className="px-3 py-2 font-mono text-[12px] text-app">{rule.cidr}</td>
      <td className="px-3 py-2 text-[12px] text-secondary">
        {rule.reason ?? <span className="text-faint">—</span>}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {rule.expires_at ? (
          <span className={expired ? "text-rose-500" : "text-secondary"}>
            {formatDate(rule.expires_at)}
            {expired ? " (expired)" : ""}
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
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
        {formatDateTime(rule.created_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/ip-rules/${rule.id}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

function computeStats(rules: IpRuleRow[]) {
  let enabled = 0;
  let allow = 0;
  let block = 0;
  for (const r of rules) {
    if (r.enabled) enabled += 1;
    if (r.action === "allow") allow += 1;
    if (r.action === "block") block += 1;
  }
  return { total: rules.length, enabled, allow, block };
}
