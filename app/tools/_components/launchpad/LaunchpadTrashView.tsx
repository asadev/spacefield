"use client";

/* LaunchpadTrashView — the Launchpad's port of the Files Manager Trash
 * pane.
 *
 * Lists every soft-deleted file in the current workspace (deleted_at
 * not null), with per-row Restore + Delete-forever actions and a top
 * banner that opens an "Empty Trash" confirmation. Files older than 30
 * days are auto-purged server-side; we just surface the rule.
 *
 * Reads workspace_files directly via the supabase client (the same
 * approach files-manager/_app.tsx uses) because /api/files/list filters
 * trash out. Mutations go through:
 *
 *   POST   /api/files/restore                { fileId }
 *   DELETE /api/files/permanently-delete     { fileId }
 *   POST   /api/files/empty-trash-older-than { workspaceId, days }
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { invalidate } from "@/lib/cache/swr";
import {
  fileKind,
  kindLabel,
  fmtSize,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpadFiles";

interface TrashRow extends LaunchpadFile {
  deleted_at: string | null;
}

interface Props {
  workspaceId: string;
  refreshTick: number;
  onContextMenu?: (e: React.MouseEvent, file: LaunchpadFile) => void;
}

const FILES_LIST_PREFIX = "/api/files/list";

export default function LaunchpadTrashView({
  workspaceId,
  refreshTick,
  onContextMenu,
}: Props) {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setRows([]);
      return;
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("workspace_files")
      .select(
        "id, name, size_bytes, content_type, created_at, deleted_at"
      )
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) {
      setRows([]);
      return;
    }
    setRows((data ?? []) as TrashRow[]);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshTick]);

  const onRestore = useCallback(
    async (id: string) => {
      setBusyId(id);
      // Optimistic — drop the row from view.
      setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
      try {
        await fetch("/api/files/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id }),
        });
        invalidate({ prefix: FILES_LIST_PREFIX });
      } catch {
        // Re-pull on failure so the row reappears if restore didn't land.
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const onPermanentDelete = useCallback(
    async (id: string) => {
      setBusyId(id);
      setRows((prev) => (prev ?? []).filter((r) => r.id !== id));
      try {
        await fetch("/api/files/permanently-delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: id }),
        });
        invalidate({ prefix: FILES_LIST_PREFIX });
      } catch {
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const onEmptyTrash = useCallback(async () => {
    if (!workspaceId) return;
    setConfirmingEmpty(false);
    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) return;
    setRows([]);
    try {
      await fetch("/api/files/empty-trash-older-than", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, days: 0 }),
      });
      invalidate({ prefix: FILES_LIST_PREFIX });
    } finally {
      void refresh();
    }
  }, [workspaceId, rows, refresh]);

  const isLoading = rows === null;
  const list = rows ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Top banner — matches the Files Manager copy */}
      <div className="flex flex-wrap items-center gap-3 border-b border-app/40 bg-app/30 px-4 py-2.5 text-[12px] text-secondary backdrop-blur-md">
        <span>
          {list.length === 0
            ? "Trash is empty."
            : `${list.length} file${list.length === 1 ? "" : "s"} in Trash. Files older than 30 days are deleted automatically.`}
        </span>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingEmpty(true)}
            className="ml-auto rounded-md border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-500 transition-colors hover:bg-rose-500/10"
          >
            Empty Trash
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
          <div className="text-sm font-medium text-app">Trash is empty</div>
          <div className="text-xs text-muted">
            Files you delete from Home, Downloads, or Documents land here.
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 border-b border-app bg-app-elevated px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            <span>Name</span>
            <span>Deleted</span>
            <span>Size</span>
            <span>Kind</span>
            <span className="text-right">Actions</span>
          </div>
          <div>
            {list.map((f) => (
              <TrashRowView
                key={f.id}
                file={f}
                busy={busyId === f.id}
                onRestore={() => void onRestore(f.id)}
                onPermanentDelete={() => void onPermanentDelete(f.id)}
                onContextMenu={
                  onContextMenu
                    ? (e) =>
                        onContextMenu(e, {
                          id: f.id,
                          name: f.name,
                          size_bytes: f.size_bytes,
                          content_type: f.content_type,
                          created_at: f.created_at,
                        })
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {confirmingEmpty && (
        <div
          role="dialog"
          aria-label="Empty Trash"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmingEmpty(false);
          }}
        >
          <div className="sf-glass-window w-full max-w-sm rounded-2xl p-5">
            <h3 className="text-base font-bold text-app">Empty Trash?</h3>
            <p className="mt-1 text-xs text-secondary">
              This permanently removes every file currently in the Trash and
              frees their storage. This can&apos;t be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingEmpty(false)}
                className="rounded-lg border border-app px-3 py-1.5 text-xs font-semibold text-secondary hover:text-app"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onEmptyTrash()}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Empty Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TrashRowViewProps {
  file: TrashRow;
  busy: boolean;
  onRestore: () => void;
  onPermanentDelete: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function TrashRowView({
  file,
  busy,
  onRestore,
  onPermanentDelete,
  onContextMenu,
}: TrashRowViewProps) {
  const k = fileKind(file);
  const deletedAt = file.deleted_at
    ? new Date(file.deleted_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div
      onContextMenu={onContextMenu}
      className="grid w-full grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-2 border-b border-app/60 px-3 py-1.5 text-[12px] text-app transition-colors hover:bg-surface"
    >
      <span className="flex items-center gap-2 truncate">
        <KindGlyph kind={k} />
        <span className="truncate" title={file.name}>
          {file.name}
        </span>
      </span>
      <span className="truncate text-secondary">{deletedAt}</span>
      <span className="truncate text-secondary">{fmtSize(file.size_bytes)}</span>
      <span className="truncate text-secondary">{kindLabel(k)}</span>
      <span className="flex shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={onRestore}
          className="rounded-md border border-app/60 px-2 py-0.5 text-[11px] text-secondary transition-colors hover:bg-surface hover:text-app disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onPermanentDelete}
          className="rounded-md border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
        >
          Delete forever
        </button>
      </span>
    </div>
  );
}

function KindGlyph({ kind }: { kind: LaunchpadFileKind }) {
  const path =
    kind === "document"
      ? "M7 3h7l4 4v14H7z"
      : kind === "sheet"
        ? "M4 5h16v14H4z M4 10h16 M4 15h16"
        : kind === "image"
          ? "M4 5h16v14H4z M4 16l4-4 3 3 5-5 4 4"
          : kind === "video"
            ? "M4 5h12v14H4z M16 9l4-2v10l-4-2z"
            : kind === "audio"
              ? "M9 18V6l10-2v12"
              : kind === "archive"
                ? "M4 5h16v14H4z M12 5v14"
                : "M7 3h10l3 3v15H7z";
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-secondary"
    >
      <path d={path} />
    </svg>
  );
}
