import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import BulkActionBar, { type BulkAction } from "../_components/BulkActionBar";
import { BulkActionProvider } from "../_components/BulkActionContext";
import BulkRowCheckbox, {
  BulkSelectAllCheckbox,
} from "../_components/BulkRowCheckbox";
import { formatDateTime } from "../_lib";
import type { AiSkillRow, SkillKind, SkillStatus } from "../_types";
import BulkImportPanel from "./_components/BulkImportPanel";
import KindChip from "./_components/KindChip";
import StatusChip from "./_components/StatusChip";

export const dynamic = "force-dynamic";

const SKILL_BULK_ACTIONS: BulkAction[] = [
  {
    id: "set_status_disabled",
    label: "Set status: Disabled",
    confirmText: "Disable {n} skills?",
  },
  {
    id: "set_status_live",
    label: "Set status: Live",
    confirmText: "Mark {n} skills live?",
  },
  {
    id: "delete",
    label: "Delete skills",
    kind: "destructive",
    confirmText:
      "Delete {n} skills? Only custom skills can be removed; code skills will fail.",
  },
  {
    id: "export_csv",
    label: "Export selected as CSV",
    kind: "export",
  },
];

/**
 * Index of every row in `public.ai_skills`. the maintainer's ask: "Skills clickable +
 * editable + add new ones." Each row is a Link to the per-skill editor;
 * the "+ New custom skill" button up top adds an admin-defined skill
 * (kind='custom') with arbitrary RPC/HTTP-backed tools.
 *
 * Filters are server-side via search params so the page stays a server
 * component — no client state needed for browse.
 */

type SearchParams = {
  category?: string;
  status?: string;
  kind?: string;
  q?: string;
};

const STATUS_VALUES = new Set<SkillStatus>(["live", "draft", "disabled"]);
const KIND_VALUES = new Set<SkillKind>(["code", "custom"]);

export default async function AdminSkillsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filterCategory = params.category?.trim() || "";
  const filterStatus = STATUS_VALUES.has(params.status as SkillStatus)
    ? (params.status as SkillStatus)
    : "";
  const filterKind = KIND_VALUES.has(params.kind as SkillKind)
    ? (params.kind as SkillKind)
    : "";
  const filterQ = (params.q ?? "").trim().toLowerCase();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select(
      "id, kind, display_name, description, status, category, sort_order, tools_json, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load skills: {error.message}
      </div>
    );
  }

  type Row = Pick<
    AiSkillRow,
    | "id"
    | "kind"
    | "display_name"
    | "description"
    | "status"
    | "category"
    | "sort_order"
    | "tools_json"
    | "updated_at"
  >;
  const allRows = (data ?? []) as Row[];

  const filtered = allRows.filter((r) => {
    if (filterCategory && r.category !== filterCategory) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterKind && r.kind !== filterKind) return false;
    if (filterQ) {
      const hay = `${r.id} ${r.display_name} ${r.description}`.toLowerCase();
      if (!hay.includes(filterQ)) return false;
    }
    return true;
  });

  const counts = {
    total: allRows.length,
    live: allRows.filter((r) => r.status === "live").length,
    draft: allRows.filter((r) => r.status === "draft").length,
    disabled: allRows.filter((r) => r.status === "disabled").length,
    code: allRows.filter((r) => r.kind === "code").length,
    custom: allRows.filter((r) => r.kind === "custom").length,
  };

  const categories = Array.from(
    new Set(allRows.map((r) => r.category).filter(Boolean))
  ).sort();

  const pageIds = filtered.map((r) => r.id);

  return (
    <BulkActionProvider scope="skills">
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Skills</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} skills · {counts.live} live · {counts.draft} draft ·{" "}
            {counts.disabled} disabled · {counts.code} code-defined ·{" "}
            {counts.custom} custom. Each row is a tool family the agent
            runtime can call.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BulkImportPanel />
          <Link
            href="/admin/skills/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            + New custom skill
          </Link>
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
            placeholder="id, name, description"
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
        <FilterField label="Kind">
          <select
            name="kind"
            defaultValue={filterKind}
            className="h-9 rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
          >
            <option value="">all</option>
            <option value="code">code</option>
            <option value="custom">custom</option>
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
            <option value="disabled">disabled</option>
          </select>
        </FilterField>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
        <Link
          href="/admin/skills"
          className="text-[11px] text-faint transition-colors hover:text-app"
        >
          Reset
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="w-8 px-3 py-2 text-left font-normal">
                <BulkSelectAllCheckbox
                  ids={pageIds}
                  label="Select all skills on page"
                />
              </th>
              <th className="px-3 py-2 text-left font-normal">Skill</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Category</th>
              <th className="px-3 py-2 text-left font-normal">Tools</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-faint"
                >
                  {allRows.length === 0
                    ? "No skills yet — the v2 migration seeds the registry from ALL_SKILLS. Check that the migration ran."
                    : "No skills match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const toolCount = Array.isArray(r.tools_json)
                  ? r.tools_json.length
                  : 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 align-middle">
                      <BulkRowCheckbox
                        id={r.id}
                        label={`Select skill ${r.display_name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/skills/${encodeURIComponent(r.id)}`}
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
                      <KindChip kind={r.kind} />
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.category}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-secondary">
                      {r.kind === "code" ? (
                        <span className="text-faint">in source</span>
                      ) : (
                        toolCount
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={r.status} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/skills/${encodeURIComponent(r.id)}`}
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

      <BulkActionBar scope="skills" actions={SKILL_BULK_ACTIONS} />
    </div>
    </BulkActionProvider>
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
