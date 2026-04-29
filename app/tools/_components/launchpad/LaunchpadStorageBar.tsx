"use client";

/* LaunchpadStorageBar — workspace storage usage indicator that lives at
 * the bottom of the Launchpad sidebar (above the status bar). Renders
 * "<used> / <cap>" + a horizontal progress bar that flips amber at 80%
 * and rose at 95% so the user knows when they're about to wedge.
 *
 * Pulls from /api/workspaces/storage-stats (cached via cachedFetch). If
 * the endpoint errors or returns nothing, the bar renders an empty
 * state instead of throwing.
 *
 * Clicking the bar fires the parent's `onOpenStorageSettings` so it can
 * route to Settings → Workspaces (which has a Storage section). The
 * caller decides what that means in its environment (Desktop opens the
 * settings panel; mobile shell opens the workspaces sheet).
 */

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/cache/swr";

/* Shape returned by /api/workspaces/storage-stats. Earlier iterations
 * of this bar expected `cap` to be an object `{cap_bytes, used_bytes}`,
 * but the route flattened those into top-level `cap` + `used` numbers
 * — every reader of the bar then saw cap = 0 and rendered the
 * "Storage unavailable" empty state. Match the route exactly. */
interface StorageStats {
  cap?: number;
  used?: number;
}

interface Props {
  workspaceId: string;
  refreshTick?: number;
  onOpenStorageSettings?: () => void;
}

const STORAGE_PREFIX = "/api/workspaces/storage-stats";

function fmtBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export default function LaunchpadStorageBar({
  workspaceId,
  refreshTick = 0,
  onOpenStorageSettings,
}: Props) {
  const [used, setUsed] = useState<number>(0);
  const [cap, setCap] = useState<number>(0);
  const [loaded, setLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const url = `${STORAGE_PREFIX}?workspaceId=${encodeURIComponent(
          workspaceId
        )}`;
        const j = await cachedFetch<StorageStats>(url);
        if (cancelled) return;
        setUsed(Number(j.used ?? 0));
        setCap(Number(j.cap ?? 0));
      } catch {
        if (!cancelled) {
          setUsed(0);
          setCap(0);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const tone =
    pct >= 95 ? "rose" : pct >= 80 ? "amber" : "emerald";
  const fillClass =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-emerald-500";

  const Wrapper = onOpenStorageSettings ? "button" : "div";
  const wrapperProps = onOpenStorageSettings
    ? {
        type: "button" as const,
        onClick: onOpenStorageSettings,
        title: "Manage storage",
      }
    : {};

  return (
    <div className="border-t border-app/40 bg-app/30 px-3 py-2 backdrop-blur-md">
      <Wrapper
        {...wrapperProps}
        className={
          "flex w-full flex-col gap-1 text-left transition-colors " +
          (onOpenStorageSettings
            ? "cursor-pointer hover:opacity-90"
            : "")
        }
      >
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted">
          <span>Storage</span>
          {loaded && cap > 0 && (
            <span className="text-[10px] text-secondary">
              {Math.round(pct)}%
            </span>
          )}
        </div>
        <div
          aria-hidden="true"
          className="relative h-1.5 overflow-hidden rounded-full bg-app-elevated"
        >
          <div
            className={`absolute inset-y-0 left-0 ${fillClass} transition-[width]`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[11px] text-secondary">
          {loaded
            ? cap > 0
              ? `${fmtBytes(used)} / ${fmtBytes(cap)}`
              : "Storage unavailable"
            : "Loading…"}
        </div>
      </Wrapper>
    </div>
  );
}
