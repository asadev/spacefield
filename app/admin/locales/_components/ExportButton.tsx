"use client";

import { useState } from "react";

/**
 * Triggers a download of all strings for the locale as a JSON object.
 * Hits the GET endpoint at /api/admin/locales/export?code=… which is
 * admin-guarded server-side. The response sets a content-disposition
 * header so the browser downloads instead of navigating.
 */
export default function ExportButton({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/locales/export?code=${encodeURIComponent(code)}`,
        { method: "GET" }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Export failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `locale-${code}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="text-[11px] text-red-500" title={error}>
          {error.slice(0, 60)}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export JSON"}
      </button>
    </div>
  );
}
