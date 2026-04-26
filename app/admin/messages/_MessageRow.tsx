"use client";

import { useState, useTransition } from "react";

import { markMessageResolved } from "../_actions";

export type MessageRow = {
  id: string;
  name: string | null;
  email: string;
  topic: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
};

export default function MessageRow({
  m,
  formattedCreated,
}: {
  m: MessageRow;
  formattedCreated: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const resolved = Boolean(m.resolved_at);

  return (
    <>
      <tr
        className={`cursor-pointer border-b border-app last:border-b-0 hover:bg-app/40 ${
          resolved ? "opacity-60" : ""
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary whitespace-nowrap">
          {formattedCreated}
        </td>
        <td className="px-3 py-2">
          <span className="rounded-full bg-app-elevated border border-app px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
            {m.topic}
          </span>
        </td>
        <td className="px-3 py-2 text-app">{m.name || "—"}</td>
        <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
          {m.email}
        </td>
        <td className="px-3 py-2">
          <span className="line-clamp-1 text-secondary">{m.message}</span>
        </td>
        <td className="px-3 py-2">
          {resolved ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500 dark:text-emerald-400">
              resolved
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              open
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-app bg-app-elevated/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="whitespace-pre-wrap text-sm text-app">
              {m.message}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("id", m.id);
                  fd.set("resolved", resolved ? "false" : "true");
                  startTransition(() => {
                    void markMessageResolved(fd);
                  });
                }}
                className="rounded-lg border border-app bg-app px-2.5 py-1 text-xs text-app transition-colors hover:border-tool-accent disabled:opacity-50"
              >
                {resolved ? "Mark unresolved" : "Mark resolved"}
              </button>
              <a
                href={`mailto:${m.email}?subject=Re:%20${encodeURIComponent(m.topic)}`}
                className="rounded-lg border border-app bg-app px-2.5 py-1 text-xs text-app transition-colors hover:border-tool-accent"
              >
                Reply by email
              </a>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
