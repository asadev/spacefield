"use client";

import { useState } from "react";

const BTN =
  "inline-flex items-center rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app";

export function SecretReveal({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const masked = "•".repeat(Math.max(8, Math.min(secret.length, 48)));

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code
        className="block max-w-full overflow-x-auto rounded-md border border-app bg-app px-2 py-1 font-mono text-[11px] text-app"
        // Wrap so the box keeps a stable height and doesn't collapse on
        // mask. `break-all` keeps it from punching through layout when
        // the secret is long and shown.
        style={{ wordBreak: "break-all" }}
      >
        {shown ? secret : masked}
      </code>
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        className={BTN}
      >
        {shown ? "Hide" : "Reveal"}
      </button>
      <button type="button" onClick={copy} className={BTN}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
