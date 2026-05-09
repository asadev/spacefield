"use client";

import { useState } from "react";

import { resolveError } from "./_actions";

import type { ErrorEventRow, ErrorLevel } from "../_types";

/**
 * Per-event expandable row. Click the row to toggle the expanded panel
 * showing stack, context, url, user_agent. Lives inside `<tbody>` so we
 * render `<tr>` with a single full-width `<td colSpan>` underneath.
 */

export type ExpandableEventProps = {
  event: ErrorEventRow;
  levelChipClass: string;
  formattedOccurredAt: string;
};

export default function ExpandableErrorRow({
  event,
  levelChipClass,
  formattedOccurredAt,
}: ExpandableEventProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-app last:border-b-0 hover:bg-app/40"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 align-top text-xs">
          <span
            aria-hidden
            className={`inline-block w-3 transition-transform ${
              open ? "rotate-90" : ""
            } text-faint`}
          >
            ▶
          </span>
        </td>
        <td className="px-3 py-2 align-top">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${levelChipClass}`}
          >
            {event.level}
          </span>
        </td>
        <td className="px-3 py-2 align-top">
          <div className="line-clamp-2 max-w-2xl text-sm text-app">
            {event.message}
          </div>
          {event.fingerprint && (
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
              {event.fingerprint}
            </div>
          )}
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-secondary">
          {event.source ?? "—"}
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs tabular-nums text-secondary">
          {formattedOccurredAt}
        </td>
        <td className="px-3 py-2 align-top">
          {event.resolved_at ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
              resolved
            </span>
          ) : (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-500">
              open
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-app/30">
          <td colSpan={6} className="px-3 py-3">
            <ExpandedDetail event={event} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetail({ event }: { event: ErrorEventRow }) {
  return (
    <div className="grid gap-3 text-xs">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="URL" value={event.url} />
        <DetailField label="Request ID" value={event.request_id} mono />
        <DetailField label="User ID" value={event.user_id} mono />
        <DetailField label="Workspace ID" value={event.workspace_id} mono />
      </div>
      <DetailField label="User-agent" value={event.user_agent} mono multiline />

      {event.stack && (
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Stack
          </div>
          <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[11px] leading-relaxed text-app">
            {event.stack}
          </pre>
        </div>
      )}

      {event.context && Object.keys(event.context).length > 0 && (
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Context
          </div>
          <pre className="mt-1 max-h-60 overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[11px] leading-relaxed text-app">
            {JSON.stringify(event.context, null, 2)}
          </pre>
        </div>
      )}

      {!event.resolved_at && (
        <div>
          <form action={resolveError} className="inline-flex">
            <input type="hidden" name="id" value={event.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Resolve this event
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={[
          "mt-0.5",
          mono ? "font-mono text-[11px]" : "text-xs",
          multiline ? "break-all" : "truncate",
          value ? "text-app" : "text-faint",
        ].join(" ")}
      >
        {value || "—"}
      </div>
    </div>
  );
}

// Re-export a no-op so `_actions.ts` import isn't tree-shaken when the
// component is used. (No actual export needed, but TS doesn't complain
// about unused imports thanks to React's JSX usage.)
export type { ErrorLevel };
