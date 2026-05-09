import Link from "next/link";
import { notFound } from "next/navigation";

import { inputClass } from "../../_lib";
import {
  execManagementSql,
  filterKindForColumn,
  isUuid,
  quoteLiteral,
  truncateText,
  validateIdent,
  type ColumnFilterKind,
} from "../_helpers";
import ExportTableButton from "./_ExportTableButton";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const FILTER_PREFIX = "f_";

type ColumnMeta = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  ordinal_position: number;
};

/**
 * Per-table viewer.
 *
 * Sort: `?sort=col&dir=asc|desc`. We validate `col` against the actual
 * column list to defeat SQL injection.
 *
 * Filter: any `?f_<col>=value` becomes a WHERE clause. We pick the
 * operator based on the column's data type:
 *   - text-ish → `col ilike '%value%'`
 *   - numeric  → `col = value` (only if value parses as a number)
 *   - boolean  → `col = true|false`
 *   - uuid     → `col::text ilike '%value%'`
 *
 * Pagination: `?page=N`, 50/page, OFFSET via Management API.
 */
export default async function AdminDatabaseTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { table: tableRaw } = await params;
  const sp = await searchParams;

  let table: string;
  try {
    table = validateIdent(tableRaw);
  } catch {
    notFound();
  }

  // Confirm the table exists in `public` and pull columns.
  const colsRes = await execManagementSql(
    `select column_name, data_type, is_nullable, ordinal_position
     from information_schema.columns
     where table_schema = 'public' and table_name = ${quoteLiteral(table)}
     order by ordinal_position asc;`
  );
  const columns = (colsRes.rows as Array<Record<string, unknown>>).map(
    (r) =>
      ({
        column_name: String(r.column_name ?? ""),
        data_type: String(r.data_type ?? ""),
        is_nullable: String(r.is_nullable ?? "YES"),
        ordinal_position: Number(r.ordinal_position ?? 0),
      } as ColumnMeta)
  );
  if (columns.length === 0) {
    notFound();
  }

  const colNames = columns.map((c) => c.column_name);
  const colKinds: Record<string, ColumnFilterKind> = {};
  for (const c of columns) colKinds[c.column_name] = filterKindForColumn(c.data_type);

  // Sort
  const sortColRaw = pickFirst(sp.sort);
  const sortDirRaw = pickFirst(sp.dir);
  const sortCol = sortColRaw && colNames.includes(sortColRaw) ? sortColRaw : null;
  const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

  // Filters: collect every `f_<col>=value` where `<col>` is a real column.
  const filters: Array<{ col: string; kind: ColumnFilterKind; value: string }> = [];
  for (const [k, v] of Object.entries(sp)) {
    if (!k.startsWith(FILTER_PREFIX)) continue;
    const col = k.slice(FILTER_PREFIX.length);
    const value = pickFirst(v);
    if (!value || !colNames.includes(col)) continue;
    const kind = colKinds[col];
    if (kind === "none") continue;
    filters.push({ col, kind, value });
  }

  const whereClauses: string[] = [];
  for (const f of filters) {
    if (f.kind === "text" || f.kind === "uuid") {
      whereClauses.push(
        `${f.col}::text ilike ${quoteLiteral(`%${f.value}%`)}`
      );
    } else if (f.kind === "numeric") {
      const n = Number(f.value);
      if (Number.isFinite(n)) {
        whereClauses.push(`${f.col} = ${n}`);
      }
    } else if (f.kind === "boolean") {
      if (f.value === "true" || f.value === "false") {
        whereClauses.push(`${f.col} = ${f.value}`);
      }
    }
  }
  const whereSql = whereClauses.length > 0 ? ` where ${whereClauses.join(" and ")}` : "";

  // Page
  const pageRaw = Number(pickFirst(sp.page));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const offset = (page - 1) * PER_PAGE;
  const orderSql = sortCol ? ` order by ${sortCol} ${sortDir}` : "";

  // Two parallel queries: count + page.
  let rows: Array<Record<string, unknown>> = [];
  let total = 0;
  let queryError: string | null = null;
  try {
    const [countRes, pageRes] = await Promise.all([
      execManagementSql(
        `select count(*)::bigint as c from public.${table}${whereSql};`
      ),
      execManagementSql(
        `select * from public.${table}${whereSql}${orderSql} limit ${PER_PAGE} offset ${offset};`
      ),
    ]);
    const countRow = (countRes.rows[0] ?? {}) as { c?: number | string };
    total = Number(countRow.c ?? 0);
    rows = pageRes.rows as Array<Record<string, unknown>>;
  } catch (err) {
    queryError = err instanceof Error ? err.message : String(err);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Filter-preserving param builder used for sort links + pagination.
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const p = new URLSearchParams();
    if (sortCol) p.set("sort", sortCol);
    if (sortCol && sortDir !== "asc") p.set("dir", sortDir);
    if (page > 1) p.set("page", String(page));
    for (const f of filters) p.set(`${FILTER_PREFIX}${f.col}`, f.value);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return `/admin/database/${table}${s ? `?${s}` : ""}`;
  };

  // Sort link toggle: clicking the same column toggles direction.
  const sortHref = (col: string): string => {
    if (sortCol === col) {
      const next = sortDir === "asc" ? "desc" : "asc";
      return buildHref({ sort: col, dir: next, page: undefined });
    }
    return buildHref({ sort: col, dir: "asc", page: undefined });
  };

  // Filter form posts back as a GET so the URL holds the state.
  const filterFormPath = `/admin/database/${table}`;

  // Serialized filter set for the export action.
  const filtersForExport = JSON.stringify(filters);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            <Link href="/admin/database" className="hover:text-app">
              Database
            </Link>
          </div>
          <h1 className="mt-1 font-mono text-xl font-semibold text-app">
            {table}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {total.toLocaleString()} matching rows · page {page} of {totalPages} ·{" "}
            {columns.length} columns
          </p>
        </div>
        <ExportTableButton
          table={table}
          sort={sortCol ?? ""}
          dir={sortDir}
          filtersJson={filtersForExport}
        />
      </div>

      {/* Filter form */}
      <form
        action={filterFormPath}
        className="rounded-xl border border-app bg-app-elevated p-3"
      >
        <div className="text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Filters
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {columns
            .filter((c) => filterKindForColumn(c.data_type) !== "none")
            .map((c) => {
              const kind = filterKindForColumn(c.data_type);
              const current =
                filters.find((f) => f.col === c.column_name)?.value ?? "";
              return (
                <label
                  key={c.column_name}
                  className="flex flex-col gap-1"
                  title={c.data_type}
                >
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                    {c.column_name}
                  </span>
                  {kind === "boolean" ? (
                    <select
                      name={`${FILTER_PREFIX}${c.column_name}`}
                      defaultValue={current}
                      className={`${inputClass} h-9 w-32`}
                    >
                      <option value="">Any</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={kind === "numeric" ? "number" : "search"}
                      name={`${FILTER_PREFIX}${c.column_name}`}
                      defaultValue={current}
                      placeholder={kind === "numeric" ? "= value" : "contains…"}
                      className={`${inputClass} h-9 ${kind === "numeric" ? "w-32" : "w-44"}`}
                    />
                  )}
                </label>
              );
            })}
          {sortCol && <input type="hidden" name="sort" value={sortCol} />}
          {sortCol && sortDir !== "asc" && (
            <input type="hidden" name="dir" value={sortDir} />
          )}
          <button
            type="submit"
            className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
          >
            Apply
          </button>
          {filters.length > 0 && (
            <Link
              href={filterFormPath}
              className="h-9 rounded-lg border border-transparent px-3 py-1.5 text-sm text-muted transition-colors hover:border-app hover:text-app"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      {queryError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
          Query error: {queryError}
        </div>
      )}

      {/* Data table */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              {columns.map((c) => {
                const isSorted = sortCol === c.column_name;
                const arrow = isSorted ? (sortDir === "asc" ? "↑" : "↓") : "";
                return (
                  <th
                    key={c.column_name}
                    className="px-3 py-2 text-left font-normal whitespace-nowrap"
                    title={c.data_type}
                  >
                    <Link
                      href={sortHref(c.column_name)}
                      className={`inline-flex items-center gap-1 font-mono ${isSorted ? "text-app" : "hover:text-app"}`}
                    >
                      {c.column_name}
                      {arrow && <span className="text-tool-accent">{arrow}</span>}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length || 1}
                  className="px-3 py-8 text-center text-faint"
                >
                  {queryError ? "—" : "No rows match."}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-app last:border-b-0 hover:bg-app/40 align-top"
                >
                  {columns.map((c) => (
                    <td key={c.column_name} className="px-3 py-2 text-xs">
                      <Cell value={row[c.column_name]} dataType={c.data_type} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <PageLink href={buildHref({ page: String(Math.max(1, page - 1)) })} disabled={page <= 1}>
          ← Prev
        </PageLink>
        <span className="font-mono tabular-nums text-muted">
          {page} / {totalPages}
        </span>
        <PageLink
          href={buildHref({ page: String(Math.min(totalPages, page + 1)) })}
          disabled={page >= totalPages}
        >
          Next →
        </PageLink>
      </div>
    </div>
  );
}

/* ──────────────────── Cell renderer ──────────────────── */

function Cell({ value, dataType }: { value: unknown; dataType: string }) {
  if (value === null || value === undefined) {
    return <span className="text-faint">—</span>;
  }
  // jsonb / json: pretty-print collapsed
  const t = dataType.toLowerCase();
  if (t === "jsonb" || t === "json") {
    let pretty = "";
    try {
      pretty = JSON.stringify(value, null, 2);
    } catch {
      pretty = String(value);
    }
    return (
      <details className="font-mono text-[11px]">
        <summary className="cursor-pointer text-tool-accent">
          {Array.isArray(value)
            ? `[${(value as unknown[]).length}]`
            : "{…}"}
        </summary>
        <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-app/40 p-2 text-secondary">
          {pretty}
        </pre>
      </details>
    );
  }
  if (typeof value === "boolean") {
    return (
      <span className="font-mono text-[11px] text-secondary">
        {value ? "true" : "false"}
      </span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className="font-mono tabular-nums text-secondary">{String(value)}</span>
    );
  }
  if (typeof value === "string") {
    if (t === "uuid" || isUuid(value)) {
      return (
        <span
          className="font-mono text-[11px] text-secondary"
          title={value}
        >
          {value.slice(0, 8)}…{value.slice(-4)}
        </span>
      );
    }
    if (
      t.startsWith("timestamp") ||
      t === "date" ||
      t === "time" ||
      t.startsWith("time")
    ) {
      return (
        <span className="font-mono text-[11px] tabular-nums text-secondary" title={value}>
          {value}
        </span>
      );
    }
    if (value.length > 60) {
      return (
        <span className="text-secondary" title={value}>
          {truncateText(value, 60)}
        </span>
      );
    }
    return <span className="text-secondary">{value}</span>;
  }
  // Fallback (objects, arrays returned untyped, etc.)
  let pretty = "";
  try {
    pretty = JSON.stringify(value);
  } catch {
    pretty = String(value);
  }
  return (
    <span className="font-mono text-[11px] text-secondary" title={pretty}>
      {truncateText(pretty, 60)}
    </span>
  );
}

/* ──────────────────── small helpers ──────────────────── */

function pickFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "rounded-lg border border-app px-2.5 py-1 transition-colors " +
    (disabled
      ? "pointer-events-none opacity-40 text-faint"
      : "bg-app-elevated text-app hover:border-tool-accent");
  if (disabled) return <span className={cls}>{children}</span>;
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
