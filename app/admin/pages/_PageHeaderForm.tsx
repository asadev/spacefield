import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type {
  AdminPageLayout,
  AdminPageRow,
  AdminPageSection,
  AdminRoleRow,
} from "../_types";
import { createPage, updatePage } from "./_actions";

const SECTIONS: ReadonlyArray<AdminPageSection> = [
  "AI", "Apps", "People", "Data & Ops", "Security",
  "Communication", "Experience", "Money", "Content", "Custom",
];

const LAYOUTS: ReadonlyArray<{ value: AdminPageLayout; label: string }> = [
  { value: "single", label: "Single column" },
  { value: "sidebar", label: "Sidebar (TOC + main)" },
  { value: "grid", label: "2-column grid" },
  { value: "tabbed", label: "Tabbed (block.config.tab)" },
];

/**
 * Shared header form for /admin/pages/new and the editor's "Page details"
 * section. Server-component — passes one of two server actions.
 */
export function PageHeaderForm({
  mode,
  page,
  roles,
}: {
  mode: "create" | "edit";
  page: AdminPageRow | null;
  roles: AdminRoleRow[];
}) {
  const action = mode === "create" ? createPage : updatePage;
  const submitLabel = mode === "create" ? "Create page" : "Save details";

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && page ? (
        <input type="hidden" name="id" value={page.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Title
          </span>
          <input
            type="text"
            name="title"
            defaultValue={page?.title ?? ""}
            required
            maxLength={140}
            placeholder="Storage health"
            className={inputClass}
          />
        </label>

        {mode === "create" ? (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Slug (id) — leave blank to derive from title
            </span>
            <input
              type="text"
              name="id"
              placeholder="storage-health"
              maxLength={80}
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Slug
            </span>
            <input
              type="text"
              value={page?.id ?? ""}
              disabled
              className={`${inputClass} font-mono text-xs opacity-60`}
            />
          </label>
        )}

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Description
          </span>
          <input
            type="text"
            name="description"
            defaultValue={page?.description ?? ""}
            maxLength={300}
            placeholder="What this page is about. Shown to admins."
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Section
          </span>
          <select
            name="section"
            defaultValue={page?.section ?? "Custom"}
            className={inputClass}
          >
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Layout
          </span>
          <select
            name="layout"
            defaultValue={page?.layout ?? "single"}
            className={inputClass}
          >
            {LAYOUTS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Icon (emoji or single char)
          </span>
          <input
            type="text"
            name="icon"
            defaultValue={page?.icon ?? ""}
            maxLength={4}
            placeholder=""
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Sort order (lower = earlier)
          </span>
          <input
            type="number"
            name="sort_order"
            defaultValue={page?.sort_order ?? 0}
            className={`${inputClass} font-mono`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Required role (blank = any admin)
          </span>
          <select
            name="required_role"
            defaultValue={page?.required_role ?? ""}
            className={inputClass}
          >
            <option value="">Any admin</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 self-end text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={page?.enabled ?? true}
          />
          Enabled (visible at /admin/custom/&lt;slug&gt;)
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/admin/pages" className={buttonGhostClass}>
          Cancel
        </Link>
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
