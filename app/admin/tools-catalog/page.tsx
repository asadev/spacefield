import Link from "next/link";

import { loadAllTools, type ToolSource } from "./_data";
import SourceChip from "./_components/SourceChip";

export const dynamic = "force-dynamic";

/**
 * Tool catalog index — every tool the platform exposes, merged across
 * three sources (app_registry, code skills, custom skills). Filters are
 * server-side via search params so the page stays an RSC.
 */

const PER_PAGE_DEFAULT = 50;
const SOURCE_VALUES: ToolSource[] = [
  "app-registry",
  "skill-code",
  "skill-custom",
];

type SearchParams = {
  q?: string;
  source?: string;
  category?: string;
  page?: string;
};

export default async function ToolsCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterQ = (params.q ?? "").trim().toLowerCase();
  const filterSource =
    params.source && SOURCE_VALUES.includes(params.source as ToolSource)
      ? (params.source as ToolSource)
      : "";
  const filterCategory = (params.category ?? "").trim();
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const { rows, categories, counts } = await loadAllTools();

  const filtered = rows.filter((r) => {
    if (filterSource && r.source !== filterSource) return false;
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterQ) {
      const hay =
        `${r.name} ${r.display_name} ${r.description} ${r.source_id}`.toLowerCase();
      if (!hay.includes(filterQ)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE_DEFAULT));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PER_PAGE_DEFAULT;
  const pageRows = filtered.slice(start, start + PER_PAGE_DEFAULT);

  // Pagination URL helper. Preserves all current filters.
  const buildPageHref = (p: number) => {
    const u = new URLSearchParams();
    if (filterQ) u.set("q", filterQ);
    if (filterSource) u.set("source", filterSource);
    if (filterCategory) u.set("category", filterCategory);
    if (p > 1) u.set("page", String(p));
    const qs = u.toString();
    return qs ? `/admin/tools-catalog?${qs}` : "/admin/tools-catalog";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Tool catalog</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} tools · {counts.appRegistry} app-registry ·{" "}
            {counts.skillCode} skill-code · {counts.skillCustom} skill-custom.
            Every tool the agent runtime, OS shell, and AI skills can call —
            in one place.
          </p>
        </div>
      </div>

      {/* Filters — plain GET form so the page stays an RSC. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-app bg-app-elevated p-3"
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={filterQ}
            placeholder="name, description, source"
            className="h-9 w-56 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
          />
        </FilterField>
        <FilterField label="Source">
          <select
            name="source"
            defaultValue={filterSource}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="app-registry">app-registry</option>
            <option value="skill-code">skill-code</option>
            <option value="skill-custom">skill-custom</option>
          </select>
        </FilterField>
        <FilterField label="Category">
          <select
            name="category"
            defaultValue={filterCategory}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FilterField>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/tools-catalog"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Tool</th>
              <th className="px-3 py-2 text-left font-normal">Source</th>
              <th className="px-3 py-2 text-left font-normal">Source id</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Description</th>
              <th className="px-3 py-2 text-right font-normal">Used by</th>
              <th className="px-3 py-2 text-right font-normal">Overrides</th>
              <th className="px-3 py-2 text-right font-normal">Open</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-faint"
                >
                  {filtered.length === 0 && rows.length > 0
                    ? "No tools match the current filters."
                    : "No tools registered yet."}
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const href = `/admin/tools-catalog/${encodeURIComponent(
                  r.source
                )}/${encodeURIComponent(r.name)}`;
                const sourceHref =
                  r.source === "app-registry"
                    ? `/admin/apps/${encodeURIComponent(r.source_id)}`
                    : `/admin/skills/${encodeURIComponent(r.source_id)}`;
                return (
                  <tr
                    key={`${r.source}|${r.source_id}|${r.name}`}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={href}
                        className="font-mono text-xs text-app tabular-nums hover:text-tool-accent"
                      >
                        {r.name}
                      </Link>
                      {r.read_only && (
                        <span className="ml-2 rounded-full border border-app bg-app px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">
                          read-only
                        </span>
                      )}
                      {r.requires_confirmation && (
                        <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          confirms
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SourceChip source={r.source} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      <Link
                        href={sourceHref}
                        className="hover:text-tool-accent"
                      >
                        {r.source_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.category}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.description ? (
                        <span className="line-clamp-2 max-w-md">
                          {r.description}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {r.used_by_count}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {r.override_count > 0 ? (
                        <span className="text-tool-accent">
                          {r.override_count}
                        </span>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={href}
                        className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <div>
            Page {safePage} of {totalPages} · {filtered.length} matching tools
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={buildPageHref(Math.max(1, safePage - 1))}
              aria-disabled={safePage <= 1}
              className={`rounded-md border border-app bg-app-elevated px-3 py-1 text-[11px] transition-colors ${
                safePage <= 1
                  ? "pointer-events-none opacity-40"
                  : "hover:border-tool-accent hover:text-app"
              }`}
            >
              ← Prev
            </Link>
            <Link
              href={buildPageHref(Math.min(totalPages, safePage + 1))}
              aria-disabled={safePage >= totalPages}
              className={`rounded-md border border-app bg-app-elevated px-3 py-1 text-[11px] transition-colors ${
                safePage >= totalPages
                  ? "pointer-events-none opacity-40"
                  : "hover:border-tool-accent hover:text-app"
              }`}
            >
              Next →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted">
      {label}
      {children}
    </label>
  );
}
