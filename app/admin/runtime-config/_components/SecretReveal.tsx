"use client";

import { useState } from "react";

/**
 * Show a masked value with a "Reveal" toggle. Used in the index view to
 * keep `is_secret` rows from leaking to over-the-shoulder readers.
 * Receives the resolved value pre-stringified — the server already
 * decided whether the caller is allowed to see it (admins are).
 */
export default function SecretReveal({
  display,
}: {
  display: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="rounded bg-app px-1.5 py-0.5 font-mono text-[11px] text-app">
        {shown ? display : "••••••••"}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-tool-accent hover:text-app"
      >
        {shown ? "Hide" : "Reveal"}
      </button>
    </div>
  );
}
