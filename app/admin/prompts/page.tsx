import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { PromptLibraryRow } from "../_types";
import StatusChip from "./_components/StatusChip";

export const dynamic = "force-dynamic";

/**
 * Index of every row in `public.prompt_library`. Each prompt has a chain
 * of versions in `prompt_versions` keyed by `(prompt_id, version)`. The
 * `current_version` column on the library row points at the in-use
 * version; admins promote new versions from the per-prompt page.
 *
 * Filters are server-side via search params so the page stays a server
 * component — no client state needed for browse.
 */

type SearchParams = {
  category?: string;
  status?: string;
  q?: string;
};

const STATUSES = new Set(["live", "draft", "archived"]);

export default async function AdminPromptsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterCategory = params.category?.trim() || "";
  const filterStatus = STATUSES.has(params.status ?? "")
    ? (params.status as "live" | "draft" | "archived")
    : "";
  const filterQ = (params.q ?? "").trim().toLowerCase();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_library")
    .select(
      "id, display_name, description, category, tags, current_version, status, created_at, updated_at"
    )
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load prompts: {error.message}
      </div>
    );
  }

  type Row = Pick<
    PromptLibraryRow,
    | "id"
    | "display_name"
    | "description"
    | "category"
    | "tags"
    | "current_version"
    | "status"
    | "created_at"
    | "updated_at"
  >;
  const allRows = (data ?? []) as Row[];

  const filtered = allRows.filter((r) => {
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterQ) {
      const hay = `${r.id} ${r.display_name} ${r.description} ${
        Array.isArray(r.tags) ? r.tags.join(" ") : ""
      }`.toLowerCase();
      if (!hay.includes(filterQ)) return false;
    }
    return true;
  });

  const counts = {
    total: allRows.length,
    live: allRows.filter((r) => r.status === "live").length,
    draft: allRows.filter((r) => r.status === "draft").length,
    archived: allRows.filter((r) => r.status === "archived").length,
  };

  const categories = Array.from(
    new Set(allRows.map((r) => r.category).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Prompt library
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} prompts · {counts.live} live · {counts.draft} draft ·{" "}
            {counts.archived} archived. Each prompt has a versioned body —
            edit creates a new version row, promote flips{" "}
            <code className="font-mono">current_version</code>.
          </p>
        </div>
        <Link
          href="/admin/prompts/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New prompt
        </Link>
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
            placeholder="id, name, description, tags"
            className="h-9 w-52 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
          />
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
        <FilterField label="Status">
          <select
            name="status"
            defaultValue={filterStatus}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="live">live</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/prompts"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Prompt</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Tags</th>
              <th className="px-3 py-2 text-left font-normal">Version</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-faint">
                  {allRows.length === 0
                    ? "No prompts yet — click \"+ New prompt\" to add one."
                    : "No prompts match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const tagList = Array.isArray(r.tags) ? r.tags : [];
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/prompts/${encodeURIComponent(r.id)}`}
                        className="text-app hover:text-tool-accent"
                      >
                        <div className="font-medium">{r.display_name}</div>
                        {r.description && (
                          <div className="mt-0.5 max-w-xl truncate text-[11px] text-muted">
                            {r.description}
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {r.id}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.category}
                    </td>
                    <td className="px-3 py-2">
                      {tagList.length === 0 ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tagList.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-app bg-app px-1.5 py-0.5 text-[10px] text-secondary"
                            >
                              {t}
                            </span>
                          ))}
                          {tagList.length > 3 && (
                            <span className="text-[10px] text-faint">
                              +{tagList.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-mono tabular-nums text-tool-accent">
                        v{r.current_version}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/prompts/${encodeURIComponent(r.id)}`}
                        className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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
