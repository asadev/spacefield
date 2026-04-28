"use client";

/* LaunchpadStatusBar — bottom strip with item count + storage availability.
 *
 * Pulls free-space stats from /api/workspaces/storage-stats?workspaceId=<id>.
 * Best-effort: if the user is signed out, the workspace is brand new, or
 * the request fails for any reason, we just show the item count and skip
 * the GB readout — same way Finder hides the indicator when the volume
 * is unavailable.
 */

import { useEffect, useState } from "react";

interface Stats {
  cap: number;
  used: number;
  addon?: number;
}

interface Props {
  itemCount: number;
  workspaceId: string;
  /** When the preview pane is open, the parent passes the focused
   * item's name here so the status bar can echo it on the right. */
  focusedName?: string | null;
}

function fmtGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 100) return `${gb.toFixed(0)} GB`;
  if (gb >= 10) return `${gb.toFixed(1)} GB`;
  return `${gb.toFixed(2)} GB`;
}

export default function LaunchpadStatusBar({
  itemCount,
  workspaceId,
  focusedName,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/workspaces/storage-stats?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const j = (await r.json()) as Partial<Stats>;
        if (cancelled) return;
        if (typeof j.cap === "number" && typeof j.used === "number") {
          setStats({ cap: j.cap, used: j.used });
        }
      } catch {
        /* ignore — status bar collapses to "X items" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const free = stats ? Math.max(0, stats.cap - stats.used) : null;
  return (
    <div className="grid h-6 grid-cols-3 items-center border-t border-app bg-app-elevated px-3 text-[11px] text-muted">
      <span className="justify-self-start truncate">
        {focusedName ? "" : ""}
      </span>
      <span className="justify-self-center flex items-center gap-2">
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        {free !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>{fmtGB(free)} available</span>
          </>
        )}
      </span>
      <span className="justify-self-end truncate text-app">
        {focusedName ?? ""}
      </span>
    </div>
  );
}
