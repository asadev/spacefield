"use client";

/* LaunchpadFilesPane — renders a list of workspace files for the
 * Downloads / Documents / Shared sidebar locations.
 *
 * Each row shows: kind icon, name, size, date, kind label. Clicking
 * a row opens the right editor for the file's kind (documents / sheets
 * / files-manager). Right-click surfaces Open / Reveal in Files
 * Manager / Delete via the parent's context menu callback.
 */

import { useEffect, useState } from "react";
import {
  fetchLaunchpadFiles,
  fileKind,
  kindLabel,
  appForFile,
  fmtSize,
  fmtDate,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpadFiles";

interface Props {
  workspaceId: string;
  limit: number;
  shared?: boolean;
  kinds?: string;
  /* Client-side kind filter — used by Documents to enforce text/sheet
   * only when the API ignores the `kinds` query param. */
  filterKinds?: LaunchpadFileKind[];
  /* Refresh tick — bump from the parent's "Refresh" action to force a
   * re-fetch without unmounting the pane. */
  refreshTick: number;
  emptyTitle: string;
  emptyHint: string;
  onOpenFile: (file: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent, file: LaunchpadFile) => void;
  /* Optional content rendered above the file list (used by Shared to
   * surface communication apps in the same pane). */
  header?: React.ReactNode;
}

export default function LaunchpadFilesPane({
  workspaceId,
  limit,
  shared,
  kinds,
  filterKinds,
  refreshTick,
  emptyTitle,
  emptyHint,
  onOpenFile,
  onContextMenu,
  header,
}: Props) {
  const [files, setFiles] = useState<LaunchpadFile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setFiles([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const items = await fetchLaunchpadFiles({
        workspaceId,
        limit,
        shared,
        kinds,
      });
      if (cancelled) return;
      const filtered = filterKinds
        ? items.filter((f) => filterKinds.includes(fileKind(f)))
        : items;
      setFiles(filtered);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, limit, shared, kinds, filterKinds, refreshTick]);

  const isLoading = files === null;
  const hasFiles = !!files && files.length > 0;

  return (
    <div className="flex h-full flex-col">
      {header}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Loading…
        </div>
      ) : hasFiles ? (
        <div className="flex flex-col">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app bg-app-elevated px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            <span>Name</span>
            <span>Date</span>
            <span>Size</span>
            <span>Kind</span>
          </div>
          <div>
            {files!.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                onOpen={onOpenFile}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
          <div className="text-sm font-medium text-app">{emptyTitle}</div>
          <div className="text-xs text-muted">{emptyHint}</div>
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  onOpen,
  onContextMenu,
}: {
  file: LaunchpadFile;
  onOpen: (f: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent, f: LaunchpadFile) => void;
}) {
  const k = fileKind(file);
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      onContextMenu={(e) => onContextMenu(e, file)}
      className="grid w-full grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app/60 px-3 py-1.5 text-left text-[12px] text-app transition-colors hover:bg-surface"
      title={`Open with ${appForFile(file)}`}
    >
      <span className="flex items-center gap-2 truncate">
        <KindGlyph kind={k} />
        <span className="truncate">{file.name}</span>
      </span>
      <span className="truncate text-secondary">{fmtDate(file.created_at)}</span>
      <span className="truncate text-secondary">{fmtSize(file.size_bytes)}</span>
      <span className="truncate text-secondary">{kindLabel(k)}</span>
    </button>
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
