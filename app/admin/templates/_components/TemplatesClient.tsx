"use client";

import { useState, useTransition } from "react";

import { applyTemplate } from "./_actions";

export interface TemplateCardRow {
  slug: string;
  name: string;
  industry: string;
  description: string;
  icon: string;
  summary: string;
  table_counts: Record<string, number>;
}

export interface WorkspaceOption {
  id: string;
  name: string;
}

interface Props {
  templates: TemplateCardRow[];
  workspaces: WorkspaceOption[];
}

export default function TemplatesClient({ templates, workspaces }: Props) {
  const [workspaceId, setWorkspaceId] = useState<string>(
    workspaces[0]?.id ?? ""
  );
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [result, setResult] = useState<
    | null
    | { slug: string; ok: true; rows_inserted: number }
    | { slug: string; ok: false; error: string }
  >(null);
  const [, startTransition] = useTransition();

  function handleApply(slug: string) {
    if (!workspaceId) {
      setResult({ slug, ok: false, error: "Pick a workspace first." });
      return;
    }
    if (
      !confirm(
        `Apply the "${slug}" template to the selected workspace? This inserts seed rows — it cannot be auto-rolled-back.`
      )
    ) {
      return;
    }
    setBusySlug(slug);
    setResult(null);
    startTransition(async () => {
      const r = await applyTemplate({ slug, workspace_id: workspaceId });
      if (r.ok) {
        setResult({ slug, ok: true, rows_inserted: r.rows_inserted });
      } else {
        setResult({ slug, ok: false, error: r.error });
      }
      setBusySlug(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-app bg-app-elevated p-3">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-muted">
          Target workspace
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-9 min-w-[18rem] rounded-lg border border-app bg-app px-2 text-sm text-app outline-none focus:border-tool-accent"
          >
            {workspaces.length === 0 && (
              <option value="">— no workspaces —</option>
            )}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-faint">
          Each template inserts a fresh set of rows. Run multiple times
          only if you intentionally want duplicates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <article
            key={t.slug}
            className="flex flex-col rounded-xl border border-app bg-app-elevated p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                  {t.industry.replace(/_/g, " ")}
                </div>
                <h2 className="mt-0.5 text-base font-semibold text-app">
                  {t.name}
                </h2>
              </div>
              <span
                className="rounded-md border border-app bg-app px-2 py-0.5 text-[10px] font-mono text-secondary"
                title={t.slug}
              >
                {t.icon}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">{t.description}</p>
            <p className="mt-2 text-[11px] text-secondary">{t.summary}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(t.table_counts).map(([tbl, n]) => (
                <li
                  key={tbl}
                  className="rounded-md border border-app bg-app px-2 py-0.5 text-[10px] text-secondary"
                >
                  {tbl} · {n}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => handleApply(t.slug)}
                disabled={busySlug === t.slug || !workspaceId}
                className="inline-flex w-full items-center justify-center rounded-md bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busySlug === t.slug
                  ? "Applying…"
                  : "Apply to workspace"}
              </button>
              {result?.slug === t.slug && result.ok && (
                <p className="mt-2 text-[11px] text-emerald-400">
                  Inserted {result.rows_inserted} rows.
                </p>
              )}
              {result?.slug === t.slug && !result.ok && (
                <p className="mt-2 text-[11px] text-rose-400">
                  {result.error}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
