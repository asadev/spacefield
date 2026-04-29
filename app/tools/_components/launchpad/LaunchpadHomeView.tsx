"use client";

/* LaunchpadHomeView — the workspace's full drive view.
 *
 * Two-pane layout:
 *   ┌──────────────┬──────────────────────────────┐
 *   │ folder tree  │ files inside selected folder │
 *   └──────────────┴──────────────────────────────┘
 *
 * Folders are derived from each file's name (if it contains `/`, the
 * segment before the first slash becomes the folder; otherwise the
 * file drops into "Loose files"). The right pane mirrors the
 * Downloads / Documents row layout so behavior is consistent.
 *
 * Click a file → opens via the parent's `onOpenFile` (which routes to
 * documents / sheets / files-manager based on kind). Right-click is
 * forwarded to the parent's context-menu handler.
 */

import { useEffect, useMemo, useState } from "react";
import {
  fetchLaunchpadFiles,
  fileKind,
  kindLabel,
  appForFile,
  fmtSize,
  fmtDate,
  groupFilesByFolder,
  leafName,
  LOOSE_FOLDER,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpadFiles";

interface Props {
  workspaceId: string;
  refreshTick: number;
  onOpenFile: (file: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent, file: LaunchpadFile) => void;
  onFileFocus?: (file: LaunchpadFile) => void;
}

export default function LaunchpadHomeView({
  workspaceId,
  refreshTick,
  onOpenFile,
  onContextMenu,
  onFileFocus,
}: Props) {
  const [files, setFiles] = useState<LaunchpadFile[] | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

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
        limit: 200,
      });
      if (cancelled) return;
      setFiles(items);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  const folders = useMemo(
    () => (files ? groupFilesByFolder(files) : []),
    [files]
  );

  // Default-select the first folder once data lands.
  useEffect(() => {
    if (selectedFolder) return;
    if (folders.length === 0) return;
    setSelectedFolder(folders[0].name);
  }, [folders, selectedFolder]);

  const visibleFiles = useMemo(() => {
    if (!selectedFolder) return [];
    const f = folders.find((g) => g.name === selectedFolder);
    return f?.files ?? [];
  }, [folders, selectedFolder]);

  const isLoading = files === null;
  const isEmpty = !isLoading && folders.length === 0;

  return (
    <div className="flex h-full">
      {/* Folder tree (left) */}
      <div className="flex w-48 shrink-0 flex-col overflow-y-auto border-r border-app/60 bg-app/30 py-2">
        <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Folders
        </div>
        {isLoading ? (
          <div className="px-3 py-2 text-xs text-muted">Loading…</div>
        ) : folders.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted">No folders</div>
        ) : (
          folders.map((g) => {
            const isSelected = selectedFolder === g.name;
            return (
              <button
                key={g.name}
                type="button"
                onClick={() => setSelectedFolder(g.name)}
                aria-current={isSelected ? "page" : undefined}
                className={
                  "mx-1 flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition-colors " +
                  (isSelected
                    ? "bg-tool-accent text-white shadow-sm"
                    : "text-app hover:bg-surface")
                }
              >
                <span
                  className={
                    "flex h-4 w-4 items-center justify-center " +
                    (isSelected ? "text-white" : "text-secondary")
                  }
                >
                  {g.name === LOOSE_FOLDER ? <FilesGlyph /> : <FolderGlyph />}
                </span>
                <span className="truncate flex-1">{g.name}</span>
                <span
                  className={
                    "text-[10px] " +
                    (isSelected ? "text-white/80" : "text-muted")
                  }
                >
                  {g.files.length}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Files in selected folder (right) */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <div className="text-sm font-medium text-app">Nothing here yet</div>
            <div className="text-xs text-muted">
              Files saved to this workspace will appear in Home.
            </div>
          </div>
        ) : visibleFiles.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
            <div className="text-sm font-medium text-app">Empty folder</div>
            <div className="text-xs text-muted">
              Pick a different folder on the left.
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app bg-app/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted backdrop-blur-md">
              <span>Name</span>
              <span>Date</span>
              <span>Size</span>
              <span>Kind</span>
            </div>
            <div>
              {visibleFiles.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  onOpen={onOpenFile}
                  onContextMenu={onContextMenu}
                  onFocus={onFileFocus}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  onOpen,
  onContextMenu,
  onFocus,
}: {
  file: LaunchpadFile;
  onOpen: (f: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent, f: LaunchpadFile) => void;
  onFocus?: (f: LaunchpadFile) => void;
}) {
  const k = fileKind(file);
  return (
    <button
      type="button"
      onClick={() => onOpen(file)}
      onFocus={onFocus ? () => onFocus(file) : undefined}
      onMouseEnter={onFocus ? () => onFocus(file) : undefined}
      onContextMenu={(e) => onContextMenu(e, file)}
      className="grid w-full grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app/60 px-3 py-1.5 text-left text-[12px] text-app transition-colors hover:bg-surface"
      title={appForFile(file) ? `Open with ${appForFile(file)}` : "Open"}
    >
      <span className="flex items-center gap-2 truncate">
        <KindGlyph kind={k} />
        <span className="truncate">{leafName(file)}</span>
      </span>
      <span className="truncate text-secondary">{fmtDate(file.created_at)}</span>
      <span className="truncate text-secondary">{fmtSize(file.size_bytes)}</span>
      <span className="truncate text-secondary">{kindLabel(k)}</span>
    </button>
  );
}

function FolderGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function FilesGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
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
