"use client";

import { useState } from "react";

/**
 * SC-005: client-side reveal button for a single employee document.
 * Calls POST /api/people/documents/[id]/reveal — the route enforces
 * HR-role / doc-owner authz and writes an audit_log entry.
 *
 * Default state shows the masked last-4 hint. Click → fetches the
 * plaintext; second click hides again.
 */
export default function RevealDocNumber({
  docId,
  masked,
}: {
  docId: string;
  masked: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick(): Promise<void> {
    if (shown) {
      setShown(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/people/documents/${encodeURIComponent(docId)}/reveal`,
        { method: "POST" },
      );
      if (r.status === 403) {
        setErr("not authorised");
        return;
      }
      if (!r.ok) {
        setErr(`error ${r.status}`);
        return;
      }
      const j = (await r.json()) as { number: string | null };
      setShown(j.number ?? "—");
    } catch {
      setErr("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
      <span className="text-secondary">{shown ?? masked}</span>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded border border-app px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint hover:text-app disabled:opacity-50"
      >
        {busy ? "…" : shown ? "hide" : "reveal"}
      </button>
      {err && <span className="text-[10px] text-red-500">{err}</span>}
    </span>
  );
}
