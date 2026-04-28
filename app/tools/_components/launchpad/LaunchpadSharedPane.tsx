"use client";

/* LaunchpadSharedPane — renders files shared TO the active workspace
 * from other workspaces. Wired to GET /api/files/shares/incoming.
 *
 * Each row carries a "from <source workspace>" badge; hovering the
 * badge shows the full share metadata (sender, date, message).
 *
 * The empty state matches the spec's copy.
 */

import { useEffect, useState } from "react";
import {
  fileKind,
  kindLabel,
  appForFile,
  fmtSize,
  fmtDate,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpadFiles";
import {
  fetchIncomingShares,
  type LaunchpadShareMeta,
  type LaunchpadSharedFile,
} from "./launchpadShares";

interface Props {
  workspaceId: string;
  refreshTick: number;
  onOpenFile: (file: LaunchpadFile) => void;
  onContextMenu: (
    e: React.MouseEvent,
    file: LaunchpadFile,
    share: LaunchpadShareMeta
  ) => void;
}

export default function LaunchpadSharedPane({
  workspaceId,
  refreshTick,
  onOpenFile,
  onContextMenu,
}: Props) {
  const [files, setFiles] = useState<LaunchpadSharedFile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setFiles([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const items = await fetchIncomingShares({ workspaceId, limit: 60 });
      if (cancelled) return;
      setFiles(items);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  const isLoading = files === null;
  const hasFiles = !!files && files.length > 0;

  return (
    <div className="flex h-full flex-col">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Loading…
        </div>
      ) : hasFiles ? (
        <div className="flex flex-col">
          <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr] gap-2 border-b border-app bg-app-elevated px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            <span>Name</span>
            <span>From</span>
            <span>Date</span>
            <span>Size</span>
            <span>Kind</span>
          </div>
          <div>
            {files!.map((f) => (
              <SharedFileRow
                key={f.share.id}
                file={f}
                onOpen={onOpenFile}
                onContextMenu={(e) => onContextMenu(e, f, f.share)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
          <div className="text-sm font-medium text-app">
            No files shared with this workspace yet.
          </div>
          <div className="text-xs text-muted">
            Files others share with you will appear here.
          </div>
        </div>
      )}
    </div>
  );
}

function SharedFileRow({
  file,
  onOpen,
  onContextMenu,
}: {
  file: LaunchpadSharedFile;
  onOpen: (f: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const k = fileKind(file);
  const sourceName = file.share.source_workspace_name ?? "another workspace";
  const sharer =
    file.share.shared_by_name ??
    file.share.shared_by_email ??
    "Someone";
  const tooltip = file.share.message
    ? `${sharer} on ${fmtDate(file.share.created_at)} — “${file.share.message}”`
    : `${sharer} on ${fmtDate(file.share.created_at)}`;
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      onContextMenu={onContextMenu}
      className="grid w-full grid-cols-[2fr_1.2fr_1fr_1fr_1fr] gap-2 border-b border-app/60 px-3 py-1.5 text-left text-[12px] text-app transition-colors hover:bg-surface"
      title={appForFile(file) ? `Open with ${appForFile(file)}` : "Open"}
    >
      <span className="flex items-center gap-2 truncate">
        <KindGlyph kind={k} />
        <span className="truncate">{file.name}</span>
      </span>
      <span className="truncate" title={tooltip}>
        <span
          className="inline-flex items-center gap-1 rounded bg-tool-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-tool-accent"
        >
          <FromIcon />
          <span className="truncate">{sourceName}</span>
        </span>
      </span>
      <span className="truncate text-secondary">
        {fmtDate(file.share.created_at)}
      </span>
      <span className="truncate text-secondary">{fmtSize(file.size_bytes)}</span>
      <span className="truncate text-secondary">{kindLabel(k)}</span>
    </button>
  );
}

function FromIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 8l-5 4 5 4" />
      <path d="M4 12h12" />
      <circle cx="20" cy="12" r="1.6" />
    </svg>
  );
}

function KindGlyph({ kind }: { kind: LaunchpadFileKind }) {
  const path =
    kind === "document"
      ? "M7 3h7l4 4v14H7z M14 3v4h4"
      : kind === "sheet"
        ? "M4 5h16v14H4z M4 10h16 M4 15h16 M9 5v14 M14 5v14"
        : kind === "image"
          ? "M4 5h16v14H4z M4 16l4-4 3 3 5-5 4 4"
          : kind === "video"
            ? "M4 5h12v14H4z M16 9l4-2v10l-4-2z"
            : kind === "audio"
              ? "M9 18V6l10-2v12 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z"
              : kind === "archive"
                ? "M4 5h16v14H4z M12 5v14"
                : "M7 3h10l3 3v15H7z";
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
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
