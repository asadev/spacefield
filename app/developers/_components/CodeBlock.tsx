"use client";

import { useCallback, useState } from "react";

/**
 * Tiny copy-to-clipboard <pre> block used across the /developers page.
 *
 * Pure client component because clipboard access needs `navigator`.
 * Falls back gracefully on environments without the clipboard API:
 * the "Copy" button quietly degrades into a no-op and we never throw.
 */

export function CodeBlock({
  code,
  language = "bash",
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Clipboard write blocked — silently ignore.
    }
  }, [code]);

  return (
    <div className="relative my-3 rounded-lg border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-faint">
        <span>{language}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-faint transition-colors hover:bg-app hover:text-app"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-app">
        <code>{code}</code>
      </pre>
    </div>
  );
}
