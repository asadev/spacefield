import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonClass, formatDateTime, inputClass } from "../../_lib";
import type { HelpCategoryRow } from "../../_types";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "../_actions";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createCategory(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateCategory(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteCategory(formData);
}

async function reorderAction(formData: FormData): Promise<void> {
  "use server";
  // Reuses updateCategory under the hood — the form posts the same fields
  // plus a different sort_order.
  await updateCategory(formData);
}

export default async function AdminHelpCategoriesPage() {
  const admin = createAdminClient();
  const [catsRes, articleCountRes] = await Promise.all([
    admin
      .from("help_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("display_name", { ascending: true }),
    admin
      .from("help_articles")
      .select("category_id"),
  ]);

  const cats = (catsRes.data ?? []) as HelpCategoryRow[];
  const counts = new Map<string, number>();
  for (const r of (articleCountRes.data ?? []) as Array<{
    category_id: string | null;
  }>) {
    if (!r.category_id) continue;
    counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/admin/help"
            className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
          >
            ← Help center
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-app">Categories</h1>
          <p className="mt-0.5 text-xs text-muted">
            {cats.length.toLocaleString()} categories.
          </p>
        </div>
      </div>

      {catsRes.error && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-rose-500">
          Read failed: {catsRes.error.message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Order</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Display name</th>
              <th className="px-3 py-2 text-left font-normal">Description</th>
              <th className="px-3 py-2 text-left font-normal">Icon</th>
              <th className="px-3 py-2 text-left font-normal">Articles</th>
              <th className="px-3 py-2 text-left font-normal">Enabled</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-faint">
                  No categories yet — add one below.
                </td>
              </tr>
            ) : (
              cats.map((c, idx) => {
                const prev = cats[idx - 1];
                const next = cats[idx + 1];
                const articleCount = counts.get(c.id) ?? 0;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40 align-top"
                  >
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      <div className="flex items-center gap-1">
                        <ReorderButton
                          id={c.id}
                          name={c.display_name}
                          description={c.description}
                          icon={c.icon}
                          enabled={c.enabled}
                          newSort={prev ? prev.sort_order - 1 : c.sort_order}
                          disabled={!prev}
                          label="↑"
                        />
                        <span className="w-8 text-center">{c.sort_order}</span>
                        <ReorderButton
                          id={c.id}
                          name={c.display_name}
                          description={c.description}
                          icon={c.icon}
                          enabled={c.enabled}
                          newSort={next ? next.sort_order + 1 : c.sort_order}
                          disabled={!next}
                          label="↓"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {c.id}
                    </td>
                    <td className="px-3 py-2 text-app font-medium">
                      {c.display_name}
                    </td>
                    <td className="px-3 py-2 max-w-md text-xs text-secondary">
                      <span className="line-clamp-2">
                        {c.description || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {c.icon || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs tabular-nums text-secondary">
                      {articleCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          c.enabled
                            ? "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400"
                            : "bg-app-elevated text-secondary border border-app"
                        }`}
                      >
                        {c.enabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-secondary">
                      {formatDateTime(c.updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <details className="inline-block text-left">
                        <summary className="cursor-pointer rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app">
                          Edit
                        </summary>
                        <EditCategoryForm category={c} />
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-app">+ New category</h2>
        <form
          action={createAction}
          className="mt-2 grid gap-3 rounded-xl border border-app bg-app-elevated p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              ID (slug, optional)
            </span>
            <input
              type="text"
              name="id"
              maxLength={60}
              pattern="[a-z0-9-]*"
              placeholder="auto from name if blank"
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Display name
            </span>
            <input
              type="text"
              name="display_name"
              required
              maxLength={120}
              placeholder="Account & billing"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Description
            </span>
            <textarea
              name="description"
              rows={2}
              maxLength={300}
              placeholder="Articles about plans, invoices, refunds, billing portal."
              className={`${inputClass} resize-y`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Icon (emoji or token)
            </span>
            <input
              type="text"
              name="icon"
              maxLength={40}
              placeholder="💳"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Sort order
            </span>
            <input
              type="number"
              name="sort_order"
              defaultValue={0}
              className={`${inputClass} font-mono tabular-nums`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-app sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked />
            Enabled (visible to readers)
          </label>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" className={buttonClass}>
              Create category
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────────── helper components ────────── */

function ReorderButton({
  id,
  name,
  description,
  icon,
  enabled,
  newSort,
  disabled,
  label,
}: {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  enabled: boolean;
  newSort: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-app text-[11px] text-faint opacity-40">
        {label}
      </span>
    );
  }
  return (
    <form action={reorderAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="display_name" value={name} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="icon" value={icon ?? ""} />
      <input type="hidden" name="sort_order" value={newSort} />
      {enabled && <input type="hidden" name="enabled" value="on" />}
      <button
        type="submit"
        className="inline-flex h-5 w-5 items-center justify-center rounded border border-app bg-app text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
      >
        {label}
      </button>
    </form>
  );
}

function EditCategoryForm({ category }: { category: HelpCategoryRow }) {
  return (
    <div className="mt-2 rounded-lg border border-app bg-app p-3">
      <form
        action={updateAction}
        className="grid gap-2 text-left"
      >
        <input type="hidden" name="id" value={category.id} />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Display name
          </span>
          <input
            type="text"
            name="display_name"
            defaultValue={category.display_name}
            required
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Description
          </span>
          <textarea
            name="description"
            defaultValue={category.description}
            rows={2}
            className={`${inputClass} resize-y`}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
              Icon
            </span>
            <input
              type="text"
              name="icon"
              defaultValue={category.icon ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
              Sort order
            </span>
            <input
              type="number"
              name="sort_order"
              defaultValue={category.sort_order}
              className={`${inputClass} font-mono tabular-nums`}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={category.enabled}
          />
          Enabled
        </label>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <button
            type="submit"
            className="rounded-md bg-tool-accent px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </form>
      <form action={deleteAction} className="mt-2">
        <input type="hidden" name="id" value={category.id} />
        <button
          type="submit"
          className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
        >
          Delete category
        </button>
      </form>
    </div>
  );
}
