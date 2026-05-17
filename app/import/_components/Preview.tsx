"use client";

import { useMemo } from "react";

import { rowsToRecords } from "@/lib/import/csv";
import type { EntityKey } from "@/lib/import/schemas";
import { SCHEMAS } from "@/lib/import/schemas";
import { summarize } from "@/lib/import/validate";

export interface PreviewProps {
  entity: EntityKey;
  headers: string[];
  rows: string[][];
  mapping: Record<string, string | null>;
}

/**
 * Step 3 — render the first 10 mapped rows + a summary strip showing
 * total / ok / errors and per-column error counts. Pure UI; no posting.
 */
export default function Preview({ entity, headers, rows, mapping }: PreviewProps) {
  const cols = SCHEMAS[entity];

  const { sample, summary, allValidated } = useMemo(() => {
    const records = rowsToRecords(headers, rows);
    const { summary, rows: validated } = summarize(entity, records, mapping);
    return {
      sample: validated.slice(0, 10),
      summary,
      allValidated: validated,
    };
  }, [entity, headers, rows, mapping]);

  const colsInUse = useMemo(
    () =>
      cols.filter((c) =>
        Object.values(mapping).some((m) => m === c.name)
      ),
    [cols, mapping]
  );

  void allValidated; // surfaced via summary, kept for future expansion

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-app bg-app-elevated p-3">
          <div className="text-xs uppercase tracking-wide text-muted">Total rows</div>
          <div className="text-2xl font-semibold text-app">{summary.total}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Ready to import
          </div>
          <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-300">
            {summary.ok}
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
          <div className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-400">
            With errors
          </div>
          <div className="text-2xl font-semibold text-rose-600 dark:text-rose-300">
            {summary.withErrors}
          </div>
        </div>
      </div>

      {Object.keys(summary.errorsByColumn).length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
          <div className="mb-1 font-medium text-rose-700 dark:text-rose-300">
            Errors by column
          </div>
          <ul className="space-y-0.5 text-muted">
            {Object.entries(summary.errorsByColumn).map(([field, count]) => {
              const label = cols.find((c) => c.name === field)?.label ?? field;
              return (
                <li key={field}>
                  <span className="font-medium text-app">{label}</span> — {count}{" "}
                  row{count === 1 ? "" : "s"}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="min-w-full text-sm">
          <thead className="bg-app-elevated text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              {colsInUse.map((c) => (
                <th key={c.name} className="px-3 py-2 text-left">
                  {c.label}
                  {c.required ? " *" : ""}
                </th>
              ))}
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {sample.length === 0 ? (
              <tr>
                <td
                  colSpan={colsInUse.length + 2}
                  className="px-3 py-6 text-center text-muted"
                >
                  No rows to preview.
                </td>
              </tr>
            ) : (
              sample.map((r, idx) => (
                <tr
                  key={idx}
                  className="border-t border-app even:bg-app-elevated/40"
                >
                  <td className="px-3 py-2 text-muted">{idx + 1}</td>
                  {colsInUse.map((c) => (
                    <td
                      key={c.name}
                      className="max-w-[14rem] truncate px-3 py-2 text-app"
                      title={r.data[c.name] ?? ""}
                    >
                      {r.data[c.name] || <em className="text-muted">—</em>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-xs">
                    {r.errors.length === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        OK
                      </span>
                    ) : (
                      <span
                        className="text-rose-600 dark:text-rose-400"
                        title={r.errors.map((e) => e.message).join("; ")}
                      >
                        {r.errors.length} issue{r.errors.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Showing the first {sample.length} of {summary.total} parsed rows.
        Rows with required-field errors are skipped on import.
      </p>
    </div>
  );
}
