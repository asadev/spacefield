"use client";

import { useState, type ReactNode } from "react";

/**
 * Two-row expander used by the webhook + agent-runs tabs. The summary
 * row is rendered as <tr>, and clicking it toggles the detail row.
 *
 * `colSpan` must match the number of <th> cells in the host table so
 * the detail panel spans the full table width.
 */
export default function ExpandableRow({
  summary,
  detail,
  colSpan,
}: {
  summary: ReactNode;
  detail: ReactNode;
  colSpan: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-app last:border-b-0 hover:bg-app/40"
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
      </tr>
      {open && (
        <tr className="border-b border-app bg-app-elevated/40">
          <td colSpan={colSpan} className="px-3 py-3">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
