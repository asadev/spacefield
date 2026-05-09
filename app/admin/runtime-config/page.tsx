import Link from "next/link";

import { listRuntimeConfig } from "@/lib/runtime-config";

import { buttonClass, formatDateTime, inputClass } from "../_lib";
import type {
  RuntimeConfigRow,
  RuntimeConfigValueType,
} from "../_types";

import SecretReveal from "./_components/SecretReveal";
import { createConfig } from "./_actions";

export const dynamic = "force-dynamic";

const VALUE_TYPE_OPTIONS: {
  id: RuntimeConfigValueType;
  label: string;
  hint: string;
}[] = [
  { id: "string", label: "string", hint: "Plain text." },
  { id: "number", label: "number", hint: "Finite numeric value." },
  { id: "boolean", label: "boolean", hint: "true / false toggle." },
  { id: "json", label: "json", hint: "Any JSON-parseable structure." },
  { id: "secret", label: "secret", hint: "Treated as a secret string (masked)." },
];

export default async function AdminRuntimeConfigPage() {
  const rows = await listRuntimeConfig();
  const grouped = groupByCategory(rows);
  const stats = computeStats(rows);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Data &amp; Ops
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Runtime config
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Env-like flags that code reads via{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            getRuntimeConfig(&quot;key&quot;)
          </code>
          . Set values here without redeploying. Cached for 30s in
          process; mutations bust the cache automatically.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total keys" value={stats.total} />
        <StatCard label="Secrets" value={stats.secrets} accent="amber" />
        <StatCard label="Categories" value={stats.categories} accent="violet" />
        <StatCard label="Booleans on" value={stats.booleansOn} accent="emerald" />
      </div>

      {/* Create form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">+ New config</h2>
        <p className="mt-0.5 text-xs text-muted">
          Keys: lowercase letters, digits, dots, underscores, hyphens.
          Pick the type carefully — code coerces from it.
        </p>
        <form
          action={createConfig}
          className="mt-3 grid gap-3 lg:grid-cols-2"
        >
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Key
            </label>
            <input
              type="text"
              name="key"
              required
              placeholder="domain.flag_name"
              pattern="^[a-z][a-z0-9_.\\-]*$"
              className={`mt-1 ${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Category
            </label>
            <input
              type="text"
              name="category"
              defaultValue="general"
              placeholder="general"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Description
            </label>
            <input
              type="text"
              name="description"
              placeholder="What this controls. Other admins read this."
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Value type
            </label>
            <select name="value_type" className={`mt-1 ${inputClass}`} defaultValue="string">
              {VALUE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} — {opt.hint}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted">
              Initial value
            </label>
            <input
              type="text"
              name="value"
              placeholder="e.g. 5000  or  true  or  {}"
              className={`mt-1 ${inputClass} font-mono`}
            />
            <p className="mt-1 text-[11px] text-muted">
              For booleans use <code>true</code> / <code>false</code>. For JSON
              type, paste a parseable expression. Edit later for richer
              inputs.
            </p>
          </div>
          <label className="lg:col-span-2 flex items-center gap-3 rounded-lg border border-app bg-app px-3 py-2 text-sm text-app">
            <input
              type="checkbox"
              name="is_secret"
              className="h-4 w-4 rounded border-app accent-tool-accent"
            />
            <span className="flex flex-col">
              <span className="text-xs">Mark as secret</span>
              <span className="text-[11px] text-muted">
                Masks value in the index, hides from non-admin reads via the
                resolver.
              </span>
            </span>
          </label>
          <div className="lg:col-span-2">
            <button type="submit" className={buttonClass}>
              + Create config
            </button>
          </div>
        </form>
      </section>

      {/* Index, grouped by category */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-app bg-app-elevated p-6 text-center text-sm text-muted">
          No runtime config rows yet. The migration seeds 8 defaults — if
          you don&apos;t see them, run{" "}
          <code className="rounded bg-app px-1 text-[11px]">
            supabase db push
          </code>
          .
        </div>
      ) : (
        grouped.map(([category, items]) => (
          <section
            key={category}
            className="overflow-x-auto rounded-xl border border-app bg-app-elevated"
          >
            <div className="flex items-center gap-2 border-b border-app px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-app">
                {category}
              </h3>
              <span className="rounded-full bg-app px-2 py-0.5 text-[10px] font-medium text-muted border border-app">
                {items.length}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <th className="px-3 py-2 text-left">Key</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Value</th>
                  <th className="px-3 py-2 text-left">Updated</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <ConfigRowView key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}

/* ───────────────────── components ───────────────────── */

function ConfigRowView({ row }: { row: RuntimeConfigRow }) {
  const encodedKey = encodeURIComponent(row.key);
  return (
    <tr className="border-b border-app last:border-b-0 hover:bg-app/40 align-top">
      <td className="px-3 py-2 font-mono text-xs text-app">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/admin/runtime-config/${encodedKey}`}
            className="hover:text-tool-accent"
          >
            {row.key}
          </Link>
          {row.is_secret && (
            <span
              title="Marked secret — value masked"
              className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400"
            >
              🔒 secret
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-[12px] text-muted max-w-[26rem]">
        {row.description || <span className="text-faint">—</span>}
      </td>
      <td className="px-3 py-2">
        <ValueTypeChip valueType={row.value_type} />
      </td>
      <td className="px-3 py-2 text-xs text-app">
        <ValueRender row={row} />
      </td>
      <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
        {formatDateTime(row.updated_at)}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/runtime-config/${encodedKey}`}
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Edit
        </Link>
      </td>
    </tr>
  );
}

/** Render the row's value per its type. Secrets are always masked
 *  here, even though the resolver would have returned the real value
 *  to an admin caller. */
function ValueRender({ row }: { row: RuntimeConfigRow }) {
  if (row.is_secret) {
    return <SecretReveal display={renderForDisplay(row)} />;
  }
  if (row.value_type === "boolean") {
    const truthy = row.value === true || row.value === "true";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
          truthy
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-app text-faint border border-app"
        }`}
      >
        {truthy ? "true" : "false"}
      </span>
    );
  }
  if (row.value_type === "json") {
    let stringified: string;
    try {
      stringified = JSON.stringify(row.value, null, 2);
    } catch {
      stringified = String(row.value);
    }
    return (
      <pre className="max-w-[24rem] overflow-x-auto rounded bg-app p-2 font-mono text-[10.5px] text-app">
        {stringified}
      </pre>
    );
  }
  return (
    <code className="rounded bg-app px-1.5 py-0.5 font-mono text-[11px] text-app">
      {renderForDisplay(row)}
    </code>
  );
}

function renderForDisplay(row: RuntimeConfigRow): string {
  if (row.value === null || row.value === undefined) return "—";
  if (typeof row.value === "string") return row.value;
  try {
    return JSON.stringify(row.value);
  } catch {
    return String(row.value);
  }
}

function ValueTypeChip({
  valueType,
}: {
  valueType: RuntimeConfigValueType;
}) {
  const styles: Record<RuntimeConfigValueType, string> = {
    string: "bg-tool-accent-soft text-tool-accent",
    number: "bg-emerald-500/15 text-emerald-500",
    boolean: "bg-violet-500/15 text-violet-500",
    json: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    secret: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[valueType]}`}
    >
      {valueType}
    </span>
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

/* ───────────────────── helpers ───────────────────── */

function groupByCategory(
  rows: RuntimeConfigRow[]
): [string, RuntimeConfigRow[]][] {
  const map = new Map<string, RuntimeConfigRow[]>();
  for (const row of rows) {
    const cat = row.category || "general";
    const list = map.get(cat) ?? [];
    list.push(row);
    map.set(cat, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function computeStats(rows: RuntimeConfigRow[]) {
  const cats = new Set<string>();
  let secrets = 0;
  let booleansOn = 0;
  for (const r of rows) {
    cats.add(r.category || "general");
    if (r.is_secret) secrets += 1;
    if (
      r.value_type === "boolean" &&
      (r.value === true || r.value === "true")
    ) {
      booleansOn += 1;
    }
  }
  return {
    total: rows.length,
    secrets,
    categories: cats.size,
    booleansOn,
  };
}
