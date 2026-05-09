import Link from "next/link";

import { SQL_PRESETS } from "../_presets";
import SqlRunner from "./_SqlRunner";

export const dynamic = "force-dynamic";

/**
 * SQL runner page. The interactive form is in `_SqlRunner.tsx`. Sidebar
 * is plain server-rendered links — clicking a preset uses a query
 * string `?sql=…&label=…` so deep-linking works.
 */
export default async function AdminDatabaseSqlPage({
  searchParams,
}: {
  searchParams: Promise<{ sql?: string; label?: string }>;
}) {
  const sp = await searchParams;
  const initialSql = (sp.sql ?? "").trim();
  const initialLabel = (sp.label ?? "").trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            <Link href="/admin/database" className="hover:text-app">
              Database
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">SQL runner</h1>
          <p className="mt-0.5 text-xs text-muted">
            SELECT-only. Audited. Result limit suggested via LIMIT.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-xl border border-app bg-app-elevated p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Saved queries
          </div>
          <ul className="mt-2 space-y-1">
            {SQL_PRESETS.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/database/sql?sql=${encodeURIComponent(p.sql)}&label=${encodeURIComponent(p.label)}`}
                  className={`block rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    initialLabel === p.label
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:bg-app/40 hover:text-app"
                  }`}
                  title={p.description}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <SqlRunner initialSql={initialSql} initialLabel={initialLabel} />
      </div>
    </div>
  );
}
