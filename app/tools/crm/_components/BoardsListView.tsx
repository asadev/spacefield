"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * BoardsListView — top-level boards grid for a workspace.
 * Renders existing boards as Monday-style cards (color stripe, name,
 * record count, kind tag) plus a "+ New board" tile that opens the
 * gallery. Clicking a card swaps the surface to BoardView; the parent
 * Shell can render this directly without managing state — internal
 * `selectedBoardId` handles the in-section routing.
 * ───────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { BoardSummary } from "../_boards/types";
import { useBoards, createBoard, deleteBoard } from "./useBoards";
import BoardGalleryDialog from "./BoardGalleryDialog";
import BoardView from "./BoardView";

interface Props {
  workspaceId: string;
  workspaceLabel: string;
}

export default function BoardsListView({
  workspaceId,
  workspaceLabel,
}: Props) {
  const { boards, loading, error, refresh } = useBoards(workspaceId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);

  // Single-board outlet
  if (selectedId) {
    return (
      <BoardView
        boardId={selectedId}
        workspaceId={workspaceId}
        onBack={() => {
          setSelectedId(null);
          void refresh();
        }}
      />
    );
  }

  const onPickTemplate = async (templateId: string | null): Promise<void> => {
    if (creating) return;
    setCreating(true);
    try {
      const newBoard = await createBoard(
        templateId
          ? { workspace_id: workspaceId, template_id: templateId }
          : { workspace_id: workspaceId, kind: "custom" }
      );
      setGalleryOpen(false);
      await refresh();
      setSelectedId(newBoard.id);
    } catch {
      setGalleryOpen(false);
      await refresh();
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (board: BoardSummary): Promise<void> => {
    if (!confirm(`Archive "${board.name}"?`)) return;
    try {
      await deleteBoard(board.id, workspaceId);
      await refresh();
    } catch {
      await refresh();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      <header
        className="flex shrink-0 items-center justify-between border-b border-app bg-app-elevated px-3 py-2"
        style={{ minHeight: 48 }}
      >
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-app">Boards</h2>
          <p className="text-xs text-secondary">
            {workspaceLabel} ·{" "}
            {boards.length === 0
              ? "no boards yet"
              : `${boards.length} board${boards.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] hover:opacity-90"
          style={{ color: "var(--bg)" }}
        >
          + New board
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && boards.length === 0 ? (
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            loading boards…
          </div>
        ) : error ? (
          <div className="rounded border border-app bg-app-elevated p-4 text-sm text-secondary">
            {error}
          </div>
        ) : boards.length === 0 ? (
          <EmptyState onCreate={() => setGalleryOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                onOpen={() => setSelectedId(b.id)}
                onArchive={() => void onDelete(b)}
              />
            ))}
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="flex h-full min-h-[140px] items-center justify-center rounded-lg border border-dashed border-app bg-app text-sm text-secondary hover:border-tool-accent hover:text-app"
            >
              + New board
            </button>
          </div>
        )}
      </div>

      <BoardGalleryDialog
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={(tplId) => void onPickTemplate(tplId)}
        busy={creating}
      />
    </div>
  );
}

function BoardCard({
  board,
  onOpen,
  onArchive,
}: {
  board: BoardSummary;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const accent = board.color ?? "var(--tool-accent)";
  return (
    <div className="group relative overflow-hidden rounded-lg border border-app bg-app-elevated transition-colors hover:border-tool-accent">
      <div
        aria-hidden
        className="h-1 w-full"
        style={{ backgroundColor: accent }}
      />
      <button
        type="button"
        onClick={onOpen}
        className="block w-full p-4 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-app">
            {board.name}
          </h3>
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            {board.kind}
          </span>
        </div>
        {board.description && (
          <p className="mt-1 line-clamp-2 text-xs text-secondary">
            {board.description}
          </p>
        )}
        <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
          {board.record_count} item{board.record_count === 1 ? "" : "s"}
        </p>
      </button>
      <button
        type="button"
        onClick={onArchive}
        aria-label="Archive board"
        title="Archive"
        className="absolute right-2 top-3 rounded px-1.5 py-0.5 text-[0.6rem] text-secondary opacity-0 transition-opacity hover:bg-surface hover:text-app group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-md rounded-xl border border-dashed border-app bg-app-elevated p-6">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.boards
        </div>
        <h2 className="mt-2 text-lg font-semibold text-app">
          Spin up a flexible board
        </h2>
        <p className="mt-2 text-sm text-secondary">
          Boards are spreadsheet-style collections you fully customize —
          marketing campaigns, project trackers, customer onboarding flows,
          anything you invent.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] hover:opacity-90"
          style={{ color: "var(--bg)" }}
        >
          + New board
        </button>
      </div>
    </div>
  );
}
