import Link from "next/link";

import { inputClass } from "../_lib";
import { execManagementSql } from "./_helpers";

export const dynamic = "force-dynamic";

type TableRow = {
  table_name: string;
  row_count_estimate: number;
  column_count: number;
};

/**
 * Database browser index.
 *
 * Lists every `public.*` table (relkind in 'r','p') with a fast row
 * estimate from `pg_class.reltuples` (much cheaper than `count(*)`
 * which sequentially scans). Column count comes from `pg_attribute`.
 *
 * Single SELECT under the hood so the entire page is one round-trip
 * to the Management API.
 */
export default async function AdminDatabaseIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim().toLowerCase();

  let tables: TableRow[] = [];
  let loadError: string | null = null;
  try {
    const res = await execManagementSql(
      `select c.relname as table_name,
              c.reltuples::bigint as row_count_estimate,
              (
                select count(*)::int
                from pg_attribute a
                where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
              ) as column_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p')
       order by c.relname asc;`
    );
    tables = (res.rows as Array<Record<string, unknown>>).map((r) => ({
      table_name: String(r.table_name ?? ""),
      row_count_estimate: Number(r.row_count_estimate ?? 0),
      column_count: Number(r.column_count ?? 0),
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const filtered = query
    ? tables.filter((t) => t.table_name.toLowerCase().includes(query))
    : tables;

  const totalRows = tables.reduce((s, t) => s + (t.row_count_estimate || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Database
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Tables
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {tables.length.toLocaleString()} tables · ~
            {totalRows.toLocaleString()} rows estimated
          </p>
        </div>
        <Link
          href="/admin/database/sql"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          SQL runner →
        </Link>
      </div>

      <form
        action="/admin/database"
        className="flex flex-wrap items-end gap-2 rounded-xl border border-app bg-app-elevated p-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="table name contains…"
            className={`${inputClass} h-9 w-72`}
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        {query && (
          <Link
            href="/admin/database"
            className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
          >
            Reset
          </Link>
        )}
      </form>

      {loadError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
          Failed to load table list: {loadError}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Table</th>
              <th className="px-3 py-2 text-right font-normal">~ Rows</th>
              <th className="px-3 py-2 text-right font-normal">Columns</th>
              <th className="px-3 py-2 text-right font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-faint">
                  {loadError ? "—" : "No tables match."}
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr
                  key={t.table_name}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/database/${t.table_name}`}
                      className="font-mono text-xs text-tool-accent hover:underline"
                    >
                      {t.table_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                    {t.row_count_estimate < 0
                      ? "—"
                      : t.row_count_estimate.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                    {t.column_count.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <Link
                      href={`/admin/database/${t.table_name}`}
                      className="text-muted hover:text-app"
                    >
                      open →
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
