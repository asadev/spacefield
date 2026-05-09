"use client";

import { useEffect, useState, useTransition } from "react";

import { exportQuery, runSql } from "../_actions";

/**
 * Result rendered in a fixed-height scroll container so very wide
 * tables don't blow out the page. Cells are stringified JSON for
 * any non-primitive value.
 */
type RowResult = {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  rowCount: number;
  durationMs: number;
};

export default function SqlRunner({
  initialSql,
  initialLabel,
}: {
  initialSql: string;
  initialLabel: string;
}) {
  // Sync to incoming preset selections (?sql=...&label=...). Only when
  // the URL-supplied label changes (selecting a preset from the sidebar)
  // — typing in the textarea must not be clobbered by a re-render.
  const [sql, setSql] = useState(initialSql);
  const [label, setLabel] = useState(initialLabel);
  const [result, setResult] = useState<RowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, startExport] = useTransition();
  const [running, startRun] = useTransition();

  useEffect(() => {
    if (initialLabel !== label) {
      setSql(initialSql);
      setLabel(initialLabel);
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSql, initialLabel]);

  const handleRun = () => {
    setError(null);
    startRun(async () => {
      const fd = new FormData();
      fd.set("sql", sql);
      const res = await runSql(fd);
      if (!res.ok) {
        setError(res.error);
        setResult(null);
        return;
      }
      setResult(res.result);
    });
  };

  const handleExport = () => {
    if (!sql.trim()) return;
    setError(null);
    startExport(async () => {
      const fd = new FormData();
      fd.set("sql", sql);
      const res = await exportQuery(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-app bg-app-elevated p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Query
          </div>
          {label && (
            <div className="font-mono text-[10px] text-faint">{label}</div>
          )}
        </div>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder="select * from public.profiles limit 10;"
          className="mt-2 block w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={running || sql.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running…" : "Run query"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || sql.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50"
          >
            {exporting ? "Preparing CSV…" : "Copy as CSV"}
          </button>
          {result && (
            <span className="font-mono text-[11px] text-faint">
              {result.rowCount.toLocaleString()} rows · {result.durationMs} ms
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {result && !error && (
        <div className="rounded-xl border border-app bg-app-elevated">
          {result.rowCount === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-faint">
              Query returned no rows.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-app-elevated">
                  <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    {result.columns.map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap px-3 py-2 text-left font-mono font-normal"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-app last:border-b-0 hover:bg-app/40 align-top"
                    >
                      {result.columns.map((c) => (
                        <td key={c} className="px-3 py-2 text-xs">
                          <ResultCell value={row[c]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-faint">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className="font-mono text-[11px] text-secondary">
        {value ? "true" : "false"}
      </span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className="font-mono tabular-nums text-secondary">{String(value)}</span>
    );
  }
  if (typeof value === "string") {
    if (value.length > 80) {
      return (
        <span className="text-secondary" title={value}>
          {`${value.slice(0, 79)}…`}
        </span>
      );
    }
    return <span className="text-secondary">{value}</span>;
  }
  let pretty = "";
  try {
    pretty = JSON.stringify(value);
  } catch {
    pretty = String(value);
  }
  if (pretty.length > 80) {
    return (
      <details className="font-mono text-[11px]">
        <summary className="cursor-pointer text-tool-accent">
          {Array.isArray(value) ? `[${(value as unknown[]).length}]` : "{…}"}
        </summary>
        <pre className="mt-1 max-w-md whitespace-pre-wrap break-words rounded bg-app/40 p-2 text-secondary">
          {(() => {
            try {
              return JSON.stringify(value, null, 2);
            } catch {
              return String(value);
            }
          })()}
        </pre>
      </details>
    );
  }
  return (
    <span className="font-mono text-[11px] text-secondary" title={pretty}>
      {pretty}
    </span>
  );
}
