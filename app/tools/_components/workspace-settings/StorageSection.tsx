"use client";

/* StorageSection — the analytics centerpiece.
 *
 *   - Cap / used / add-on breakdown with a progress bar (preserved from
 *     the previous flat layout).
 *   - SVG donut chart of bytes by file kind.
 *   - List of top contributors with avatars + bytes.
 *   - Top-10 largest files with delete shortcuts.
 *   - Trash card with size + "Empty trash" CTA.
 *   - 30-day mini bar chart of upload volume.
 *
 * No charting library — recharts isn't in the dependency tree, so the
 * shapes are tiny inline SVG.
 */

import { useCallback, useEffect, useState } from "react";
import {
  STORAGE_ADDON_OPTIONS,
  formatStorageBytes,
  formatStorageGb,
  formatStorageMb,
  isValidAddonGb,
} from "@/app/_data/storage-addons";
import { useAuth } from "../useAuth";
import {
  PILL,
  PRIMARY,
  type StorageStatsBody,
  type WorkspaceRole,
} from "./types";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  tierBaseMb: number | null;
  tierName: string;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

// Keep the kind palette aligned with foundation tokens — these are the
// only chart colors. We map kind → token via inline style so dark/light
// flip works automatically.
const KIND_PALETTE: Record<string, string> = {
  image: "var(--tool-accent, #7c3aed)",
  video: "#ec4899",
  audio: "#f59e0b",
  pdf: "#ef4444",
  text: "#10b981",
  archive: "#64748b",
  sheet: "#22c55e",
  document: "#3b82f6",
  other: "#94a3b8",
};

function kindColor(kind: string): string {
  return KIND_PALETTE[kind] ?? KIND_PALETTE.other;
}

export default function StorageSection({
  workspaceId,
  role,
  tierBaseMb,
  tierName,
  onError,
  onSuccess,
}: Props) {
  const { supabase } = useAuth();
  const [stats, setStats] = useState<StorageStatsBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftAddonGb, setDraftAddonGb] = useState<number>(0);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/storage-stats?workspaceId=${encodeURIComponent(
          workspaceId
        )}`,
        { cache: "no-store" }
      );
      const body = (await res.json()) as StorageStatsBody | { error?: string };
      if (!res.ok) {
        throw new Error(
          (body as { error?: string }).error || `Load failed (${res.status})`
        );
      }
      const s = body as StorageStatsBody;
      setStats(s);
      setDraftAddonGb(s.addon);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAddon = async () => {
    if (!stats) return;
    if (!isValidAddonGb(draftAddonGb)) {
      onError("Invalid storage add-on selection.");
      return;
    }
    if (stats.addon === draftAddonGb) {
      onSuccess("No change to apply.");
      return;
    }
    setBusy("addon");
    try {
      const res = await fetch("/api/workspaces/storage-addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, addonGb: draftAddonGb }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `Update failed (${res.status})`);
      onSuccess(
        draftAddonGb === 0
          ? "Storage add-on removed."
          : "Storage add-on applied (mock — payment coming soon)."
      );
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const deleteFile = async (fileId: string, name: string) => {
    if (!confirm(`Move "${name}" to trash?`)) return;
    setBusy(`file:${fileId}`);
    try {
      const { error } = await supabase
        .from("workspace_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", fileId);
      if (error) throw error;
      onSuccess("Moved to trash.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  };

  const emptyTrash = async () => {
    if (!stats || stats.trash.file_count === 0) return;
    if (
      !confirm(
        `Permanently delete ${stats.trash.file_count} file${
          stats.trash.file_count === 1 ? "" : "s"
        } from trash? This frees ${formatStorageBytes(
          stats.trash.total_bytes
        )} but cannot be undone.`
      )
    )
      return;
    setBusy("trash");
    try {
      const { error } = await supabase
        .from("workspace_files")
        .delete()
        .eq("workspace_id", workspaceId)
        .not("deleted_at", "is", null);
      if (error) throw error;
      onSuccess("Trash emptied.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Empty trash failed");
    } finally {
      setBusy(null);
    }
  };

  if (loading || !stats) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
        <div className="h-40 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  const cap = stats.cap;
  const used = stats.used;
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const baseLabel = tierBaseMb !== null ? formatStorageMb(tierBaseMb) : "Base";
  const addonLabel = formatStorageGb(stats.addon);

  return (
    <div className="space-y-5">
      {/* Cap + used + add-on */}
      <div className="rounded-xl border border-app bg-app p-4">
        <div className="flex items-center justify-between text-xs text-secondary">
          <span>
            {formatStorageBytes(used)} of {formatStorageBytes(cap)} used
          </span>
          <span className="text-muted tabular-nums">{pct.toFixed(0)}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-tool-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-[0.7rem] text-muted">
          {stats.addon > 0
            ? `Base ${baseLabel} + Add-on ${addonLabel} = ${formatStorageBytes(
                cap
              )}`
            : `Base ${baseLabel} included with ${tierName}.`}
        </div>

        {role === "owner" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
              Storage add-on
              <select
                value={draftAddonGb}
                onChange={(e) => setDraftAddonGb(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-app bg-app-elevated px-2.5 py-1.5 text-xs font-medium text-app focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft"
              >
                {STORAGE_ADDON_OPTIONS.map((opt) => (
                  <option key={opt.gb} value={opt.gb}>
                    {opt.label} — {opt.price}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={PRIMARY}
              disabled={
                draftAddonGb === stats.addon || busy === "addon"
              }
              onClick={saveAddon}
              title="Payment integration ships next; this stores your selection."
            >
              {busy === "addon"
                ? "Saving…"
                : draftAddonGb === stats.addon
                  ? "Update"
                  : draftAddonGb === 0
                    ? "Remove add-on"
                    : "Upgrade (mock)"}
            </button>
          </div>
        )}
      </div>

      {/* By kind */}
      <ByKindCard rows={stats.by_kind} totalBytes={used} />

      {/* By user */}
      <ByUserCard rows={stats.by_user} />

      {/* Top files */}
      <TopFilesCard
        rows={stats.top_files}
        canDelete={role === "owner" || role === "admin"}
        onDelete={deleteFile}
        busyId={busy}
      />

      {/* Trash */}
      <TrashCard
        bytes={stats.trash.total_bytes}
        count={stats.trash.file_count}
        oldestAt={stats.trash.oldest_at}
        canEmpty={role === "owner" || role === "admin"}
        busy={busy === "trash"}
        onEmpty={emptyTrash}
      />

      {/* Trend */}
      <TrendCard rows={stats.trend} />
    </div>
  );
}

/* ─────────── By kind donut ─────────── */

function ByKindCard({
  rows,
  totalBytes,
}: {
  rows: StorageStatsBody["by_kind"];
  totalBytes: number;
}) {
  if (rows.length === 0 || totalBytes === 0) {
    return (
      <Card title="Storage by file type">
        <p className="text-xs text-muted">
          No files uploaded yet.
        </p>
      </Card>
    );
  }
  // Build donut arcs.
  const radius = 38;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * radius;
  let acc = 0;
  const segments = rows.map((r) => {
    const frac = totalBytes > 0 ? r.total_bytes / totalBytes : 0;
    const length = circ * frac;
    const seg = {
      kind: r.kind,
      length,
      offset: -acc,
      bytes: r.total_bytes,
      count: r.file_count,
    };
    acc += length;
    return seg;
  });

  return (
    <Card title="Storage by file type">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
        <svg viewBox="0 0 100 100" className="h-28 w-28 mx-auto sm:mx-0">
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--surface, rgba(0,0,0,0.08))"
            strokeWidth={14}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={kindColor(s.kind)}
              strokeWidth={14}
              strokeDasharray={`${s.length} ${circ - s.length}`}
              strokeDashoffset={s.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          ))}
        </svg>
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <li
              key={r.kind}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex items-center gap-2 text-secondary capitalize">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: kindColor(r.kind) }}
                />
                {r.kind}
              </span>
              <span className="tabular-nums text-muted">
                {formatStorageBytes(r.total_bytes)} ·{" "}
                {r.file_count} {r.file_count === 1 ? "file" : "files"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ─────────── Top contributors ─────────── */

function ByUserCard({ rows }: { rows: StorageStatsBody["by_user"] }) {
  if (rows.length === 0) {
    return (
      <Card title="Top contributors">
        <p className="text-xs text-muted">No uploads yet.</p>
      </Card>
    );
  }
  const max = Math.max(...rows.map((r) => r.total_bytes), 1);
  return (
    <Card title="Top contributors">
      <ul className="space-y-2">
        {rows.slice(0, 8).map((r) => {
          const name = r.full_name || r.username || r.user_id.slice(0, 8);
          const pct = (r.total_bytes / max) * 100;
          return (
            <li key={r.user_id} className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tool-accent text-[0.7rem] font-semibold text-white">
                {r.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  name.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-app">{name}</span>
                  <span className="tabular-nums text-muted">
                    {formatStorageBytes(r.total_bytes)}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-tool-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ─────────── Top files ─────────── */

function TopFilesCard({
  rows,
  canDelete,
  onDelete,
  busyId,
}: {
  rows: StorageStatsBody["top_files"];
  canDelete: boolean;
  onDelete: (id: string, name: string) => void;
  busyId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Card title="Largest files">
        <p className="text-xs text-muted">No files yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Largest files">
      <ul className="divide-y divide-app">
        {rows.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-app">{f.name}</div>
              <div className="truncate text-muted">
                {f.uploader_name ?? "Unknown"} ·{" "}
                {f.content_type ?? "binary/octet-stream"}
              </div>
            </div>
            <div className="shrink-0 tabular-nums text-muted">
              {formatStorageBytes(f.size_bytes)}
            </div>
            {canDelete && (
              <button
                type="button"
                className={PILL}
                disabled={busyId === `file:${f.id}`}
                onClick={() => onDelete(f.id, f.name)}
                title="Move to trash"
              >
                Trash
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ─────────── Trash ─────────── */

function TrashCard({
  bytes,
  count,
  oldestAt,
  canEmpty,
  busy,
  onEmpty,
}: {
  bytes: number;
  count: number;
  oldestAt: string | null;
  canEmpty: boolean;
  busy: boolean;
  onEmpty: () => void;
}) {
  return (
    <Card title="Trash">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs">
          <div className="text-app">
            {count === 0
              ? "Trash is empty."
              : `${count} item${count === 1 ? "" : "s"} · ${formatStorageBytes(
                  bytes
                )}`}
          </div>
          {oldestAt && (
            <div className="mt-0.5 text-muted">
              Oldest: {new Date(oldestAt).toLocaleDateString()}
            </div>
          )}
          <div className="mt-1 text-muted">
            Trashed files still count against storage. Empty to free space.
          </div>
        </div>
        {canEmpty && count > 0 && (
          <button
            type="button"
            className={PILL}
            disabled={busy}
            onClick={onEmpty}
          >
            {busy ? "Emptying…" : "Empty trash"}
          </button>
        )}
      </div>
    </Card>
  );
}

/* ─────────── Trend ─────────── */

function TrendCard({ rows }: { rows: StorageStatsBody["trend"] }) {
  if (rows.length === 0) {
    return (
      <Card title="Last 30 days">
        <p className="text-xs text-muted">No uploads in the past 30 days.</p>
      </Card>
    );
  }
  // Build a 30-day grid so missing days render as zero bars.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: Array<{ day: string; bytes: number; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const match = rows.find((r) => r.day.slice(0, 10) === iso);
    days.push({
      day: iso,
      bytes: match ? match.total_bytes : 0,
      count: match ? match.file_count : 0,
    });
  }
  const max = Math.max(...days.map((d) => d.bytes), 1);
  const totalBytes = days.reduce((sum, d) => sum + d.bytes, 0);
  const totalCount = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card title="Last 30 days">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-secondary">
          {totalCount} uploads · {formatStorageBytes(totalBytes)}
        </span>
        <span className="text-muted">daily</span>
      </div>
      <div className="flex h-16 items-end gap-[2px]">
        {days.map((d) => (
          <div
            key={d.day}
            className="flex-1 rounded-sm bg-tool-accent transition-opacity hover:opacity-70"
            style={{
              height: `${Math.max(2, (d.bytes / max) * 100)}%`,
              opacity: d.bytes === 0 ? 0.25 : 1,
            }}
            title={`${d.day} · ${formatStorageBytes(d.bytes)}`}
          />
        ))}
      </div>
    </Card>
  );
}

/* ─────────── Card primitive ─────────── */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app p-4">
      <h4 className="mb-3 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {title}
      </h4>
      {children}
    </div>
  );
}
