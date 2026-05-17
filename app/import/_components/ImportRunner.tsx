"use client";

import { useState } from "react";

import { rowsToRecords } from "@/lib/import/csv";
import type { EntityKey } from "@/lib/import/schemas";
import type { ImportResult } from "@/lib/import/importers/types";

export interface ImportRunnerProps {
  entity: EntityKey;
  headers: string[];
  rows: string[][];
  mapping: Record<string, string | null>;
  workspaceId?: string;
  onComplete?: (result: ImportResult) => void;
}

const CHUNK_SIZE = 100; // posted per request; the server then batches into Promise.all groups of 10

/**
 * Step 4 — POST rows to /api/import/[entity] in chunks of 100 with a
 * live progress bar. Accumulates the per-chunk results into a final
 * summary card. Errors from any chunk are appended verbatim.
 */
export default function ImportRunner({
  entity,
  headers,
  rows,
  mapping,
  workspaceId,
  onComplete,
}: ImportRunnerProps) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [totals, setTotals] = useState<ImportResult>({
    imported: 0,
    skipped: 0,
    errors: [],
  });

  const total = rows.length;

  const start = async () => {
    setRunning(true);
    setError(null);
    setDone(false);
    setProcessed(0);
    setTotals({ imported: 0, skipped: 0, errors: [] });

    const records = rowsToRecords(headers, rows);
    const running: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch(`/api/import/${entity}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            mapping,
            rows: chunk,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as ImportResult;
        running.imported += data.imported;
        running.skipped += data.skipped;
        // re-base error row indices into the global row index
        for (const e of data.errors) {
          running.errors.push({ ...e, row: e.row + i });
        }
        setTotals({ ...running });
        setProcessed(Math.min(i + chunk.length, total));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setRunning(false);
        return;
      }
    }

    setRunning(false);
    setDone(true);
    onComplete?.(running);
  };

  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {!done && !running && (
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <h3 className="text-sm font-medium text-app">Ready to import</h3>
          <p className="mt-1 text-xs text-muted">
            {total} row{total === 1 ? "" : "s"} will be sent to{" "}
            <code className="rounded bg-app-hover px-1.5 py-0.5 text-[11px]">
              /api/import/{entity}
            </code>
            . Rows that fail validation server-side are skipped, not retried.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            disabled={total === 0}
            className="mt-4 rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Start import
          </button>
        </div>
      )}

      {(running || done) && (
        <div className="rounded-xl border border-app bg-app-elevated p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-app">
              {running ? "Importing…" : "Import complete"}
            </span>
            <span className="text-muted text-xs">
              {processed} / {total} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-app">
            <div
              className="h-full bg-tool-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Imported
              </div>
              <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-300">
                {totals.imported}
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Skipped
              </div>
              <div className="text-xl font-semibold text-amber-600 dark:text-amber-300">
                {totals.skipped}
              </div>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
              <div className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-400">
                Errors
              </div>
              <div className="text-xl font-semibold text-rose-600 dark:text-rose-300">
                {totals.errors.length}
              </div>
            </div>
          </div>

          {totals.errors.length > 0 && (
            <details className="rounded-lg border border-app bg-app p-3 text-xs">
              <summary className="cursor-pointer text-app">
                Show first 20 errors
              </summary>
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-muted">
                {totals.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono text-app">row {e.row + 1}</span>
                    {e.field ? (
                      <>
                        {" · "}
                        <span className="text-app">{e.field}</span>
                      </>
                    ) : null}
                    {" — "}
                    {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">
          Import failed: {error}
        </div>
      )}
    </div>
  );
}
