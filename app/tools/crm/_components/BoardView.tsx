"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * BoardView — single-board outlet.
 * Header: editable name, color stripe, view tabs (Table is wired; Kanban /
 * Calendar / Timeline are shown as disabled chips so the future surfaces
 * have a clear home).
 * Body: BoardTable for the active table view; placeholder card for the
 * other view types until later agents wire them.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CrmBoardView } from "../_boards/types";
import { useBoard, useBoardRecords, patchBoard } from "./useBoards";
import BoardTable from "./BoardTable";

interface Props {
  boardId: string;
  workspaceId: string;
  onBack: () => void;
}

export default function BoardView({ boardId, workspaceId, onBack }: Props) {
  const board = useBoard(boardId);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>("");

  // Pick the default view (or first) when the board loads.
  useEffect(() => {
    if (board.board && activeViewId === null) {
      const views = board.board.views;
      const def = views.find((v) => v.is_default) ?? views[0] ?? null;
      setActiveViewId(def?.id ?? null);
    }
  }, [board.board, activeViewId]);

  const activeView = useMemo<CrmBoardView | null>(() => {
    if (!board.board || !activeViewId) return null;
    return board.board.views.find((v) => v.id === activeViewId) ?? null;
  }, [board.board, activeViewId]);

  // Records load against the active view so server-side filters apply.
  const recordsHook = useBoardRecords(
    boardId,
    activeView?.view_type === "table" ? activeView.id : null
  );

  if (board.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-app text-sm text-secondary">
        loading board…
      </div>
    );
  }
  if (!board.board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-app p-6">
        <p className="text-sm text-secondary">Board not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-app bg-app-elevated px-3 py-1.5 text-xs text-app"
        >
          Back to boards
        </button>
      </div>
    );
  }

  const { board: boardRow, views } = board.board;
  const accent = boardRow.color ?? "var(--tool-accent)";

  const renameSubmit = async (): Promise<void> => {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === boardRow.name) return;
    try {
      await patchBoard(boardId, workspaceId, { name: trimmed });
      await board.refresh();
    } catch {
      await board.refresh();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      {/* ── header ─────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-app bg-app-elevated px-3 py-2"
        style={{ minHeight: 52 }}
      >
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-xs text-secondary hover:bg-surface hover:text-app"
          aria-label="Back to boards"
        >
          ← Boards
        </button>
        <span
          aria-hidden
          className="h-6 w-1 rounded-full"
          style={{ backgroundColor: accent }}
        />
        {editingName ? (
          <input
            autoFocus
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => void renameSubmit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void renameSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingName(false);
              }
            }}
            className="rounded border border-app bg-app px-2 py-1 text-base font-semibold text-app focus:border-tool-accent focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(boardRow.name);
              setEditingName(true);
            }}
            className="rounded px-1 py-0.5 text-base font-semibold text-app hover:bg-surface"
          >
            {boardRow.name}
          </button>
        )}
        <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
          {boardRow.kind}
        </span>
      </div>

      {/* ── view tabs ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-app bg-app px-2 py-1.5">
        {views.map((v) => {
          const isActive = v.id === activeViewId;
          const wired = v.view_type === "table";
          return (
            <button
              key={v.id}
              type="button"
              disabled={!wired}
              onClick={() => wired && setActiveViewId(v.id)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent text-secondary hover:bg-surface hover:text-app"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={
                wired
                  ? v.name
                  : `${v.view_type} view — coming soon`
              }
            >
              <span>{v.name}</span>
              {!wired && (
                <span className="ml-1 text-[0.5rem] uppercase">
                  · soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── body ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1">
        {activeView?.view_type === "table" && (
          <BoardTable
            boardId={boardId}
            columns={board.board.columns}
            records={recordsHook.records}
            onColumnsRefresh={board.refresh}
            onRecordsRefresh={recordsHook.refresh}
            onOptimisticUpdate={recordsHook.optimisticUpdate}
            onOptimisticInsert={recordsHook.optimisticInsert}
            onOptimisticRemove={recordsHook.optimisticRemove}
          />
        )}
        {activeView && activeView.view_type !== "table" && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-dashed border-app bg-app-elevated p-6 text-center">
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                {activeView.view_type} view
              </p>
              <p className="mt-2 text-sm text-secondary">
                Not wired yet — switch to the Table view to edit records.
                Future agents will turn this on.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
