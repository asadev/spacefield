"use client";

import { useState, useTransition } from "react";

import { exportTable } from "../_actions";

/**
 * Triggers `exportTable()` and downloads the returned CSV via a
 * temporary `<a>`. Server-side caps at 10k rows so we don't have to
 * stream — a 10k-row CSV easily fits in a string + data: URL.
 */
export default function ExportTableButton({
  table,
  sort,
  dir,
  filtersJson,
}: {
  table: string;
  sort: string;
  dir: string;
  filtersJson: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handle = () => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("table", table);
      fd.set("sort", sort);
      fd.set("dir", dir);
      fd.set("filters", filtersJson);
      const res = await exportTable(fd);
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handle}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50"
      >
        {pending ? "Exporting…" : "Export CSV"}
      </button>
      {error && (
        <span className="max-w-xs truncate text-[11px] text-red-500 dark:text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
