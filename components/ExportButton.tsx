"use client";

import { useRef, useState } from "react";

interface ExportButtonProps {
  targetRef: React.RefObject<HTMLElement | null>;
  filename?: string;
}

export default function ExportButton({ targetRef, filename = "result" }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!targetRef.current || exporting) return;
    setExporting(true);

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
    } catch {
      // Silently fail — export is a nice-to-have
    } finally {
      setExporting(false);
    }
  }

  return (
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
  );
}
