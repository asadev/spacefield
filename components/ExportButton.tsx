"use client";

import { useState } from "react";

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLElement | null>;
  filename?: string;
}

export default function ExportButton({ targetRef, filename = "result" }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    if (!targetRef.current) {
      setError("Nothing to export yet.");
      return;
    }
    setExporting(true);
    setError(null);

    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: "#0a0a0a",
        scale: 2,
      });

      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-2 border border-white/[0.10] bg-white/[0.05] px-4 py-2 text-[0.65rem] uppercase tracking-[0.15em] text-gray-400 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-current">
          <path d="M7 1V9M7 9L4 6M7 9L10 6M2 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {exporting ? "Exporting..." : "Export"}
      </button>
      {error && (
        <span role="status" className="text-[0.65rem] text-rose-400">
          {error}
        </span>
      )}
    </span>
  );
}
