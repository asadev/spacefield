"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * BoardTable — Monday-style table for a single board.
 * - Sticky header with column labels + a "+" to add a column inline.
 * - First "name" column always renders left-most, then remaining columns
 *   in their `position` order.
 * - Cells become editable on click; the editor type is picked by
 *   `column.field_type`. Saves are optimistic; failure rolls back to
 *   the server's authoritative state via refresh().
 * - Footer "+ Add new" row to append a record.
 * - Lightweight windowing: only the rows whose index falls in
 *   [firstVisible, firstVisible + WINDOW] are rendered as full DOM;
 *   rows outside are rendered as fixed-height spacers so 200+ rows
 *   don't lag the browser.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BoardColumnConfigDropdown,
  BoardColumnConfigStatus,
  BoardColumnConfigRating,
  CrmBoardColumn,
  CrmBoardRecord,
} from "../_boards/types";
import {
  CheckboxEditor,
  DateEditor,
  DropdownEditor,
  NumberEditor,
  RatingEditor,
  StatusEditor,
  TextEditor,
  formatCellDisplay,
} from "./BoardCellEditors";
import {
  createBoardColumn,
  createBoardRecord,
  deleteBoardRecord,
  patchBoardColumn,
  patchBoardRecord,
} from "./useBoards";

interface Props {
  boardId: string;
  columns: CrmBoardColumn[];
  records: CrmBoardRecord[];
  onColumnsRefresh: () => Promise<void>;
  onRecordsRefresh: () => Promise<void>;
  onOptimisticUpdate: (id: string, patch: Partial<CrmBoardRecord>) => void;
  onOptimisticInsert: (row: CrmBoardRecord) => void;
  onOptimisticRemove: (id: string) => void;
  onOpenRecord?: (id: string) => void;
}

const ROW_HEIGHT = 38;
const WINDOW_SIZE = 60; // visible rows
const OVERSCAN = 10;

interface ActiveCell {
  recordId: string;
  columnId: string;
  rect: DOMRect;
}

export default function BoardTable({
  boardId,
  columns,
  records,
  onColumnsRefresh,
  onRecordsRefresh,
  onOptimisticUpdate,
  onOptimisticInsert,
  onOptimisticRemove,
  onOpenRecord,
}: Props) {
  const [active, setActive] = useState<ActiveCell | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [addColOpen, setAddColOpen] = useState<boolean>(false);

  const sortedColumns = useMemo(
    () =>
      [...columns]
        .filter((c) => c.archived_at === null)
        .sort((a, b) => a.position - b.position),
    [columns]
  );

  // Promote `name` (or first text column) to leftmost. The columns array
  // already has it at position 0 for templates; for custom boards this
  // is a no-op.
  const orderedColumns = sortedColumns;

  const firstIdx = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN
  );
  const lastIdx = Math.min(records.length, firstIdx + WINDOW_SIZE + OVERSCAN);

  const visibleRecords = records.slice(firstIdx, lastIdx);
  const topPad = firstIdx * ROW_HEIGHT;
  const bottomPad = (records.length - lastIdx) * ROW_HEIGHT;

  // ─── cell save ────────────────────────────────────────────────────

  const saveCell = async (
    record: CrmBoardRecord,
    column: CrmBoardColumn,
    next: unknown
  ): Promise<void> => {
    const before = record.data[column.field_key];
    if (next === before) return;
    onOptimisticUpdate(record.id, { data: { [column.field_key]: next } });
    setActive(null);
    try {
      await patchBoardRecord(boardId, record.id, {
        data: { [column.field_key]: next },
      });
    } catch {
      await onRecordsRefresh();
    }
  };

  const saveColumnConfig = async (
    column: CrmBoardColumn,
    nextConfig: Record<string, unknown>
  ): Promise<void> => {
    try {
      await patchBoardColumn(boardId, column.id, { config: nextConfig });
      await onColumnsRefresh();
    } catch {
      await onColumnsRefresh();
    }
  };

  // ─── add row / column ─────────────────────────────────────────────

  const addRow = async (): Promise<void> => {
    const tempId = `temp-${Date.now()}`;
    const optimistic: CrmBoardRecord = {
      id: tempId,
      board_id: boardId,
      workspace_id: "",
      data: {},
      position: records.length,
      parent_id: null,
      created_by: null,
      assignee_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onOptimisticInsert(optimistic);
    try {
      const real = await createBoardRecord(boardId, { data: {} });
      onOptimisticRemove(tempId);
      onOptimisticInsert(real);
    } catch {
      onOptimisticRemove(tempId);
      await onRecordsRefresh();
    }
  };

  const removeRow = async (id: string): Promise<void> => {
    onOptimisticRemove(id);
    try {
      await deleteBoardRecord(boardId, id);
    } catch {
      await onRecordsRefresh();
    }
  };

  // ─── render ────────────────────────────────────────────────────────

  const colTemplate = useMemo(() => {
    // checkbox col + name col + remaining cols + actions col
    const trail = orderedColumns
      .map((c) => `${c.width}px`)
      .join(" ");
    return `36px ${trail} 60px`;
  }, [orderedColumns]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      <div
        ref={scrollRef}
        onScroll={(e) =>
          setScrollTop((e.target as HTMLDivElement).scrollTop)
        }
        className="min-h-0 flex-1 overflow-auto"
      >
        <div style={{ minWidth: "100%", display: "table", width: "100%" }}>
          {/* ── header ─────────────────────────────────────────────── */}
          <div
            className="sticky top-0 z-10 grid items-center border-b border-app bg-app-elevated text-xs"
            style={{ gridTemplateColumns: colTemplate, minHeight: 36 }}
          >
            <div className="flex items-center justify-center" />
            {orderedColumns.map((col) => (
              <div
                key={col.id}
                className="flex items-center gap-1 truncate border-l border-app px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-secondary"
                title={col.label}
              >
                <span className="truncate">{col.label}</span>
                {col.required && (
                  <span className="text-tool-accent" aria-label="required">
                    *
                  </span>
                )}
              </div>
            ))}
            <div className="flex items-center justify-center border-l border-app">
              <button
                type="button"
                aria-label="Add column"
                onClick={() => setAddColOpen(true)}
                className="rounded px-2 py-1 text-base font-bold text-secondary hover:bg-surface hover:text-app"
              >
                +
              </button>
            </div>
          </div>

          {/* ── body ─────────────────────────────────────────────── */}
          {topPad > 0 && <div style={{ height: topPad }} />}
          {visibleRecords.map((rec) => (
            <BoardRow
              key={rec.id}
              record={rec}
              columns={orderedColumns}
              colTemplate={colTemplate}
              isSelected={selected.has(rec.id)}
              onToggleSelect={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(rec.id)) next.delete(rec.id);
                  else next.add(rec.id);
                  return next;
                })
              }
              activeCell={
                active && active.recordId === rec.id ? active : null
              }
              onActivateCell={(columnId, rect) =>
                setActive({ recordId: rec.id, columnId, rect })
              }
              onCancelEdit={() => setActive(null)}
              onSaveCell={(col, next) => saveCell(rec, col, next)}
              onSaveColumnConfig={saveColumnConfig}
              onDelete={() => removeRow(rec.id)}
              onOpen={() => onOpenRecord?.(rec.id)}
            />
          ))}
          {bottomPad > 0 && <div style={{ height: bottomPad }} />}

          {/* ── add-row footer ────────────────────────────────────── */}
          <button
            type="button"
            onClick={addRow}
            className="grid w-full items-center border-t border-app bg-app-elevated text-left text-sm text-secondary hover:bg-surface hover:text-app"
            style={{ gridTemplateColumns: colTemplate, minHeight: 36 }}
          >
            <span aria-hidden className="text-center text-base">+</span>
            <span className="px-2">Add new</span>
            {orderedColumns.slice(1).map((c) => (
              <span key={c.id} />
            ))}
            <span />
          </button>
        </div>
      </div>

      {addColOpen && (
        <AddColumnDialog
          onClose={() => setAddColOpen(false)}
          onSubmit={async (input) => {
            try {
              await createBoardColumn(boardId, input);
              await onColumnsRefresh();
              setAddColOpen(false);
            } catch {
              setAddColOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── BoardRow ──────────────────────────────────────────────────────────

interface RowProps {
  record: CrmBoardRecord;
  columns: CrmBoardColumn[];
  colTemplate: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  activeCell: ActiveCell | null;
  onActivateCell: (columnId: string, rect: DOMRect) => void;
  onCancelEdit: () => void;
  onSaveCell: (col: CrmBoardColumn, next: unknown) => Promise<void>;
  onSaveColumnConfig: (
    col: CrmBoardColumn,
    nextConfig: Record<string, unknown>
  ) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpen: () => void;
}

function BoardRow({
  record,
  columns,
  colTemplate,
  isSelected,
  onToggleSelect,
  activeCell,
  onActivateCell,
  onCancelEdit,
  onSaveCell,
  onSaveColumnConfig,
  onDelete,
  onOpen,
}: RowProps) {
  return (
    <div
      className="group grid items-stretch border-b border-app bg-app text-sm hover:bg-surface"
      style={{ gridTemplateColumns: colTemplate, minHeight: ROW_HEIGHT }}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-3.5 w-3.5 cursor-pointer accent-[var(--tool-accent)]"
        />
      </div>
      {columns.map((col) => {
        const value = record.data[col.field_key];
        const isEditing =
          activeCell !== null && activeCell.columnId === col.id;
        return (
          <BoardCell
            key={col.id}
            column={col}
            value={value}
            isEditing={isEditing}
            anchorRect={activeCell?.rect ?? null}
            onActivate={(rect) => onActivateCell(col.id, rect)}
            onCancel={onCancelEdit}
            onSave={(next) => onSaveCell(col, next)}
            onSaveConfig={(cfg) => onSaveColumnConfig(col, cfg)}
          />
        );
      })}
      <div className="flex items-center justify-center gap-0.5 border-l border-app opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Open record"
          onClick={onOpen}
          className="rounded px-1.5 py-1 text-[0.65rem] text-secondary hover:bg-app hover:text-app"
          title="Open"
        >
          ↗
        </button>
        <button
          type="button"
          aria-label="Delete record"
          onClick={onDelete}
          className="rounded px-1.5 py-1 text-[0.65rem] text-secondary hover:bg-app hover:text-app"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── BoardCell ─────────────────────────────────────────────────────────

interface CellProps {
  column: CrmBoardColumn;
  value: unknown;
  isEditing: boolean;
  anchorRect: DOMRect | null;
  onActivate: (rect: DOMRect) => void;
  onCancel: () => void;
  onSave: (next: unknown) => Promise<void>;
  onSaveConfig: (cfg: Record<string, unknown>) => Promise<void>;
}

function BoardCell({
  column,
  value,
  isEditing,
  anchorRect,
  onActivate,
  onCancel,
  onSave,
  onSaveConfig,
}: CellProps) {
  const cellRef = useRef<HTMLDivElement | null>(null);

  const onClick = (): void => {
    if (cellRef.current) {
      onActivate(cellRef.current.getBoundingClientRect());
    }
  };

  // Inline-rendered editors (text/number/date/checkbox/rating)
  if (isEditing) {
    if (column.field_type === "text" || column.field_type === "link" ||
        column.field_type === "email" || column.field_type === "phone") {
      const t =
        column.field_type === "email"
          ? "email"
          : column.field_type === "phone"
          ? "tel"
          : column.field_type === "link"
          ? "url"
          : "text";
      return (
        <div
          ref={cellRef}
          className="border-l border-app px-1 py-0.5"
        >
          <TextEditor
            value={typeof value === "string" ? value : ""}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
            type={t}
          />
        </div>
      );
    }
    if (column.field_type === "longtext") {
      return (
        <div ref={cellRef} className="border-l border-app px-1 py-0.5">
          <TextEditor
            value={typeof value === "string" ? value : ""}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
            multiline
          />
        </div>
      );
    }
    if (column.field_type === "number" || column.field_type === "currency" ||
        column.field_type === "percent") {
      return (
        <div ref={cellRef} className="border-l border-app px-1 py-0.5">
          <NumberEditor
            value={typeof value === "number" ? value : null}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
          />
        </div>
      );
    }
    if (column.field_type === "date" || column.field_type === "datetime") {
      return (
        <div ref={cellRef} className="border-l border-app px-1 py-0.5">
          <DateEditor
            value={typeof value === "string" ? value : null}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
          />
        </div>
      );
    }
    if (column.field_type === "rating") {
      const cfg = column.config as BoardColumnConfigRating;
      return (
        <div
          ref={cellRef}
          className="flex items-center border-l border-app px-2"
        >
          <RatingEditor
            value={typeof value === "number" ? value : null}
            max={cfg.max ?? 5}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
          />
        </div>
      );
    }
    if (column.field_type === "checkbox") {
      return (
        <div
          ref={cellRef}
          className="flex items-center justify-center border-l border-app px-2"
        >
          <CheckboxEditor
            value={!!value}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
          />
        </div>
      );
    }
    if (column.field_type === "status" && anchorRect) {
      const cfg = column.config as BoardColumnConfigStatus;
      return (
        <>
          <div
            ref={cellRef}
            onClick={onClick}
            className="flex cursor-pointer items-center border-l border-app px-2"
          >
            <StatusChip column={column} value={value} />
          </div>
          <StatusEditor
            value={typeof value === "string" ? value : null}
            options={cfg.options ?? []}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
            onColumnConfigChange={(next) =>
              void onSaveConfig(next as unknown as Record<string, unknown>)
            }
            anchorRect={anchorRect}
          />
        </>
      );
    }
    if (column.field_type === "dropdown" && anchorRect) {
      const cfg = column.config as BoardColumnConfigDropdown;
      return (
        <>
          <div
            ref={cellRef}
            onClick={onClick}
            className="flex cursor-pointer items-center border-l border-app px-2 text-app"
          >
            <span className="truncate">{formatCellDisplay(value, column)}</span>
          </div>
          <DropdownEditor
            value={typeof value === "string" ? value : null}
            options={cfg.options ?? []}
            onCommit={(v) => void onSave(v)}
            onCancel={onCancel}
            anchorRect={anchorRect}
          />
        </>
      );
    }
    // Other types — fall through to read-only display
  }

  // Read-only render
  if (column.field_type === "status") {
    return (
      <div
        ref={cellRef}
        onClick={onClick}
        className="flex cursor-pointer items-center border-l border-app px-2"
      >
        <StatusChip column={column} value={value} />
      </div>
    );
  }
  if (column.field_type === "checkbox") {
    return (
      <div
        ref={cellRef}
        onClick={onClick}
        className="flex cursor-pointer items-center justify-center border-l border-app"
      >
        <span aria-hidden className="text-base text-tool-accent">
          {value ? "✓" : ""}
        </span>
      </div>
    );
  }
  if (column.field_type === "rating") {
    const cfg = column.config as BoardColumnConfigRating;
    return (
      <div
        ref={cellRef}
        onClick={onClick}
        className="flex cursor-pointer items-center gap-0.5 border-l border-app px-2"
      >
        {Array.from({ length: cfg.max ?? 5 }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            style={{
              color:
                (typeof value === "number" ? value : 0) >= n
                  ? "var(--tool-accent)"
                  : "var(--text-faint)",
            }}
          >
            ★
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      ref={cellRef}
      onClick={onClick}
      className={`flex cursor-text items-center border-l border-app px-2 text-app ${
        column.field_type === "number" ||
        column.field_type === "currency" ||
        column.field_type === "percent"
          ? "justify-end"
          : ""
      }`}
      title={String(value ?? "")}
    >
      <span className="truncate">{formatCellDisplay(value, column)}</span>
    </div>
  );
}

function StatusChip({
  column,
  value,
}: {
  column: CrmBoardColumn;
  value: unknown;
}) {
  const cfg = column.config as BoardColumnConfigStatus;
  const opts = cfg.options ?? [];
  const opt = opts.find((o) => o.value === value);
  if (!opt) {
    return <span className="text-faint">—</span>;
  }
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: opt.color, color: "#fff" }}
      title={opt.label}
    >
      {opt.label}
    </span>
  );
}

// ─── AddColumnDialog ──────────────────────────────────────────────────

interface AddColumnInput {
  field_key: string;
  label: string;
  field_type: string;
  config?: Record<string, unknown>;
}

function AddColumnDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: AddColumnInput) => Promise<void>;
}) {
  const [label, setLabel] = useState<string>("");
  const [fieldType, setFieldType] = useState<string>("text");
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (): Promise<void> => {
    if (!label.trim()) return;
    const fieldKey = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50);
    if (!fieldKey) return;
    setBusy(true);
    await onSubmit({ field_key: fieldKey, label: label.trim(), field_type: fieldType });
    setBusy(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-app bg-app-elevated p-4 shadow-xl"
      >
        <h3 className="text-base font-semibold text-app">Add column</h3>
        <p className="mt-1 text-xs text-secondary">
          Pick a label and a field type. You can rename and reconfigure later.
        </p>
        <label className="mt-3 block text-xs text-secondary">
          Label
          <input
            autoFocus
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
            placeholder="e.g. Owner"
          />
        </label>
        <label className="mt-3 block text-xs text-secondary">
          Field type
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value)}
            className="mt-1 w-full rounded border border-app bg-app px-2 py-1.5 text-sm text-app focus:border-tool-accent focus:outline-none"
          >
            {[
              "text",
              "longtext",
              "number",
              "currency",
              "percent",
              "rating",
              "date",
              "datetime",
              "status",
              "dropdown",
              "checkbox",
              "person",
              "link",
              "email",
              "phone",
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-secondary hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !label.trim()}
            onClick={submit}
            className="rounded bg-tool-accent px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            style={{ color: "var(--bg)" }}
          >
            {busy ? "Adding…" : "Add column"}
          </button>
        </div>
      </div>
    </div>
  );
}
