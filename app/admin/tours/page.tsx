import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../_lib";
import type { ProductTourRow } from "../_types";
import StatusChip from "./_components/StatusChip";
import TriggerKindChip from "./_components/TriggerKindChip";

export const dynamic = "force-dynamic";

/**
 * Index of every row in `public.product_tours`. A tour is an array of
 * spotlight steps that anchor onto DOM selectors at runtime. Steps live
 * inline on the row as JSON. Per-tour editor at `/admin/tours/[id]`.
 *
 * Filters are server-side via search params so the page stays a server
 * component.
 */

type SearchParams = {
  status?: string;
  trigger?: string;
  q?: string;
};

const STATUSES = new Set(["live", "draft", "archived"]);
const TRIGGER_KINDS = new Set([
  "manual",
  "first_visit",
  "feature_flag",
  "dom_query",
]);

export default async function AdminToursPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterStatus = STATUSES.has(params.status ?? "")
    ? (params.status as "live" | "draft" | "archived")
    : "";
  const filterTrigger = TRIGGER_KINDS.has(params.trigger ?? "")
    ? (params.trigger as ProductTourRow["trigger_kind"])
    : "";
  const filterQ = (params.q ?? "").trim().toLowerCase();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_tours")
    .select(
      "id, display_name, description, trigger_route, trigger_kind, steps, status, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load tours: {error.message}
      </div>
    );
  }

  type Row = Pick<
    ProductTourRow,
    | "id"
    | "display_name"
    | "description"
    | "trigger_route"
    | "trigger_kind"
    | "steps"
    | "status"
    | "updated_at"
  >;
  const allRows = (data ?? []) as Row[];

  const filtered = allRows.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterTrigger && r.trigger_kind !== filterTrigger) return false;
    if (filterQ) {
      const hay = `${r.id} ${r.display_name} ${r.description} ${
        r.trigger_route ?? ""
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Communication
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Product tours</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} tour{counts.total === 1 ? "" : "s"} ·{" "}
            {counts.live} live · {counts.draft} draft · {counts.archived}{" "}
            archived. Each tour is a JSON array of spotlight steps that
            anchor on DOM selectors.
          </p>
        </div>
        <Link
          href="/admin/tours/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New tour
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-app bg-app-elevated p-3"
      >
        <FilterField label="Search">
          <input
            type="search"
            name="q"
            defaultValue={filterQ}
            placeholder="id, name, route"
            className="h-9 w-52 rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-app outline-none transition-colors focus:border-tool-accent placeholder:text-faint"
          />
        </FilterField>
        <FilterField label="Trigger">
          <select
            name="trigger"
            defaultValue={filterTrigger}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="manual">manual</option>
            <option value="first_visit">first_visit</option>
            <option value="feature_flag">feature_flag</option>
            <option value="dom_query">dom_query</option>
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
          href="/admin/tours"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Tour</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Trigger</th>
              <th className="px-3 py-2 text-left font-normal">Route</th>
              <th className="px-3 py-2 text-left font-normal">Steps</th>
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
                    ? "No product tours yet — click \"+ New tour\" to add one."
                    : "No tours match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/tours/${encodeURIComponent(r.id)}`}
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
                    <td className="px-3 py-2">
                      <TriggerKindChip kind={r.trigger_kind} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {r.trigger_route ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-secondary">
                      {stepCount}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/tours/${encodeURIComponent(r.id)}`}
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
