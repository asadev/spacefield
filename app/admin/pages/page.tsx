import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type {
  AdminPageBlockRow,
  AdminPageLayout,
  AdminPageRow,
  AdminPageSection,
} from "../_types";
import { togglePage } from "./_actions";

export const dynamic = "force-dynamic";

const SECTION_CHIP: Record<AdminPageSection, string> = {
  AI: "bg-tool-accent-soft text-tool-accent",
  Apps: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  People: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400",
  "Data & Ops": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Security: "bg-rose-500/15 text-rose-500",
  Communication: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Experience: "bg-pink-500/15 text-pink-500",
  Money: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Content: "bg-app-elevated text-secondary border border-app",
  Custom: "bg-app text-app border border-app",
};

const LAYOUT_CHIP: Record<AdminPageLayout, string> = {
  single: "bg-app text-secondary border border-app",
  sidebar: "bg-app text-secondary border border-app",
  grid: "bg-app text-secondary border border-app",
  tabbed: "bg-app text-secondary border border-app",
};

/**
 * /admin/pages — list of admin-defined pages.
 *
 * Per-row affordances:
 *   - Title + description, links to the editor.
 *   - Section chip + layout chip.
 *   - Block count (cheap aggregate from a parallel select).
 *   - Toggle enable/disable inline.
 *   - "View" link to /admin/custom/<slug> (only if enabled).
 */
export default async function AdminPagesIndexPage() {
  const sb = createAdminClient();
  const [pagesRes, blockCountsRes] = await Promise.all([
    sb
      .from("admin_pages")
      .select("*")
      .order("section", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    sb
      .from("admin_page_blocks")
      .select("page_id")
      .limit(10000),
  ]);

  const pages = (pagesRes.data ?? []) as AdminPageRow[];
  const counts = new Map<string, number>();
  for (const r of (blockCountsRes.data ?? []) as Array<
    Pick<AdminPageBlockRow, "page_id">
  >) {
    counts.set(r.page_id, (counts.get(r.page_id) ?? 0) + 1);
  }

  const enabledCount = pages.filter((p) => p.enabled).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Apps
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Custom pages</h1>
          <p className="mt-0.5 text-xs text-muted">
            Build admin pages from data — no code required. {pages.length}{" "}
            page{pages.length === 1 ? "" : "s"} · {enabledCount} live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/pages/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            + New page
          </Link>
        </div>
      </div>

      {pagesRes.error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {pagesRes.error.message}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-10 text-center">
          <div className="mx-auto max-w-sm">
            <div className="text-base font-semibold text-app">
              No custom pages yet
            </div>
            <p className="mt-2 text-xs text-muted">
              Custom pages let you compose KPI cards, SQL-driven tables,
              charts, markdown briefs, action buttons and forms — all from
              this panel, no code.
            </p>
            <Link
              href="/admin/pages/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              + New page
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Page</th>
                <th className="px-3 py-2 text-left font-normal">Section</th>
                <th className="px-3 py-2 text-left font-normal">Layout</th>
                <th className="px-3 py-2 text-right font-normal">Blocks</th>
                <th className="px-3 py-2 text-left font-normal">Enabled</th>
                <th className="px-3 py-2 text-left font-normal">Updated</th>
                <th className="px-3 py-2 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const blockCount = counts.get(p.id) ?? 0;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/pages/${encodeURIComponent(p.id)}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        {p.title}
                      </Link>
                      <div className="font-mono text-[10px] text-faint">
                        {p.id}
                      </div>
                      {p.description ? (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-muted">
                          {p.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SECTION_CHIP[p.section]}`}
                      >
                        {p.section}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${LAYOUT_CHIP[p.layout]}`}
                      >
                        {p.layout}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-secondary">
                      {blockCount}
                    </td>
                    <td className="px-3 py-2">
                      <form action={togglePage} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                            p.enabled
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-app text-faint border border-app"
                          }`}
                        >
                          {p.enabled ? "On" : "Off"}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(p.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={`/admin/pages/${encodeURIComponent(p.id)}`}
                          className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          Edit
                        </Link>
                        {p.enabled ? (
                          <Link
                            href={`/admin/custom/${encodeURIComponent(p.id)}`}
                            className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                          >
                            View
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
