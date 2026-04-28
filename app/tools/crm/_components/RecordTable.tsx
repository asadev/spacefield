"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * RecordTable — the generic primitive shared across ContactsView /
 * CompaniesView / InventoryView.
 *
 * Responsibilities
 * ────────────────
 * - Render a header (sticky on scroll) with: workspace label, search,
 *   filter button, saved-view dropdown stub, "+ New" button,
 *   layout toggle (table/cards), bulk-action dropdown.
 * - Render a sortable, multi-select table with row-hover lift + actions.
 * - Render a card-grid fallback when `layout === "cards"`.
 * - Skeleton / empty / loading states.
 *
 * The component is intentionally presentation-heavy: parents own data
 * fetching, filter state, and persistence. RecordTable just paints + emits
 * callbacks.
 * ───────────────────────────────────────────────────────────────────── */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { RecIcon } from "./_records/Icon";

export interface RecordColumn<T> {
  /** Stable key — used by sort + bulk-edit + saved views. */
  key: string;
  /** Header label. */
  label: string;
  /** Render function for a single cell. */
  render: (row: T) => ReactNode;
  /** If true, header click flips sort direction on this column. */
  sortable?: boolean;
  /** Custom sort accessor (defaults to row[key] string-cast). */
  sortAccessor?: (row: T) => string | number | null | undefined;
  /** Min width in px for the column (used for table-layout: fixed). */
  width?: number;
  /** Right-align numeric/currency cells. */
  align?: "left" | "right";
  /** Hide column on narrow widths (<1024px). */
  hideOnNarrow?: boolean;
}

export type RecordLayout = "table" | "cards";

export interface BulkAction {
  key: string;
  label: string;
  destructive?: boolean;
}

export interface RecordTableProps<T extends { id: string }> {
  rows: T[];
  columns: RecordColumn<T>[];
  loading?: boolean;
  workspaceLabel: string;
  /** Header title — defaults to "Records". */
  title: string;
  /** Header subtitle / count — e.g. "12 contacts". */
  subtitle?: string;
  /** Right-side primary action label. */
  newLabel: string;
  onNew: () => void;
  /** Card renderer for the alternate layout — required when allowCards=true. */
  renderCard?: (row: T) => ReactNode;
  allowCards?: boolean;
  /** Inline quick-add form rendered above the table. */
  quickAdd?: ReactNode;
  /** Header filter-drawer trigger. */
  onFilterClick?: () => void;
  filterCount?: number;
  /** Search input value (controlled). */
  search: string;
  onSearchChange: (q: string) => void;
  /** Row click → open detail. */
  onRowClick: (row: T) => void;
  /** Row actions menu items. */
  rowActions?: (row: T) => Array<{
    key: string;
    label: string;
    onClick: () => void;
    destructive?: boolean;
  }>;
  /** Bulk select. */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  bulkActions?: BulkAction[];
  onBulkAction?: (key: string, ids: string[]) => void;
  /** Empty-state element. */
  empty: ReactNode;
  /** Width of the parent (px) — used for narrow / card breakpoints. */
  width: number;
  /** Saved-view dropdown stub (read-only for Phase 2B). */
  savedViewLabel?: string;
}

const NARROW_BREAKPOINT = 1024;
const MOBILE_BREAKPOINT = 768;

export function RecordTable<T extends { id: string }>(
  props: RecordTableProps<T>
) {
  const {
    rows,
    columns,
    loading,
    workspaceLabel,
    title,
    subtitle,
    newLabel,
    onNew,
    renderCard,
    allowCards,
    quickAdd,
    onFilterClick,
    filterCount,
    search,
    onSearchChange,
    onRowClick,
    rowActions,
    selectedIds,
    onSelectionChange,
    bulkActions,
    onBulkAction,
    empty,
    width,
    savedViewLabel,
  } = props;

  const [layout, setLayout] = useState<RecordLayout>("table");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const bulkRef = useRef<HTMLDivElement | null>(null);
  const savedRef = useRef<HTMLDivElement | null>(null);

  const narrow = width < NARROW_BREAKPOINT;
  const mobile = width < MOBILE_BREAKPOINT;
  const effectiveLayout: RecordLayout =
    allowCards && (layout === "cards" || mobile) ? "cards" : "table";

  // Close popovers on outside click / Escape.
  useEffect(() => {
    if (!bulkOpen && !savedOpen && !openRowMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (bulkRef.current && !bulkRef.current.contains(e.target as Node)) {
        setBulkOpen(false);
      }
      if (savedRef.current && !savedRef.current.contains(e.target as Node)) {
        setSavedOpen(false);
      }
      setOpenRowMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setBulkOpen(false);
        setSavedOpen(false);
        setOpenRowMenu(null);
      }
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onEsc);
    };
  }, [bulkOpen, savedOpen, openRowMenu]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !narrow || !c.hideOnNarrow),
    [columns, narrow]
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const accessor =
      col.sortAccessor ??
      ((r: T) => (r as unknown as Record<string, string | number | null>)[col.key]);
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return sortDir === "asc" ? -1 : 1;
      if (bv === null || bv === undefined) return sortDir === "asc" ? 1 : -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc" ? 1 : -1;
    });
    return arr;
  }, [rows, columns, sortKey, sortDir]);

  const allSelected =
    sortedRows.length > 0 && sortedRows.every((r) => selectedIds.includes(r.id));
  const someSelected = !allSelected && selectedIds.length > 0;

  const toggleAll = () => {
    if (allSelected) onSelectionChange([]);
    else onSelectionChange(sortedRows.map((r) => r.id));
  };

  const toggleRow = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const onHeaderClick = (col: RecordColumn<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-app text-app">
      {/* ── header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <span className="rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {workspaceLabel}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-app">{title}</div>
          {subtitle && (
            <div className="truncate font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
              {subtitle}
            </div>
          )}
        </div>

        {/* search */}
        <div className="relative ml-auto flex w-full items-center md:ml-2 md:w-auto md:flex-1">
          <span
            className="pointer-events-none absolute left-2 text-faint"
            aria-hidden="true"
          >
            <RecIcon name="search" size={13} />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search…"
            className="h-8 w-full rounded-md border border-app bg-app py-1 pl-7 pr-3 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
          />
        </div>

        {/* filter */}
        {onFilterClick && (
          <button
            type="button"
            onClick={onFilterClick}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-app bg-app px-2 text-xs text-secondary hover:text-app hover:border-tool-accent"
            title="Filters"
          >
            <RecIcon name="filter" size={13} />
            <span className="hidden sm:inline">Filters</span>
            {filterCount && filterCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-tool-accent px-1.5 font-mono text-[0.55rem] font-semibold" style={{ color: "var(--bg)" }}>
                {filterCount}
              </span>
            ) : null}
          </button>
        )}

        {/* saved views (stub) */}
        <div className="relative" ref={savedRef}>
          <button
            type="button"
            onClick={() => setSavedOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-app bg-app px-2 text-xs text-secondary hover:text-app hover:border-tool-accent"
            aria-haspopup="menu"
            aria-expanded={savedOpen}
            title="Saved views"
          >
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.16em]">
              {savedViewLabel ?? "All"}
            </span>
            <RecIcon name="chevron_down" size={11} />
          </button>
          {savedOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-app bg-app-elevated p-1 shadow-lg"
            >
              <div className="rounded-md px-2 py-1.5 text-left text-xs text-secondary">
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                  Saved views
                </div>
                <div className="mt-1 text-app">All records</div>
              </div>
              <div className="border-t border-app pt-1 text-[0.6rem] text-faint">
                <div className="px-2 py-1.5">
                  Saved-view manager arrives in Phase 2C. For now the URL holds
                  your filters and you can copy the link to share.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* layout toggle */}
        {allowCards && !mobile && (
          <div className="inline-flex h-8 overflow-hidden rounded-md border border-app">
            <button
              type="button"
              onClick={() => setLayout("table")}
              aria-pressed={effectiveLayout === "table"}
              className={`px-2 ${
                effectiveLayout === "table"
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "bg-app text-secondary hover:text-app"
              }`}
              title="Table view"
            >
              <RecIcon name="layout_table" size={13} />
            </button>
            <button
              type="button"
              onClick={() => setLayout("cards")}
              aria-pressed={effectiveLayout === "cards"}
              className={`border-l border-app px-2 ${
                effectiveLayout === "cards"
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "bg-app text-secondary hover:text-app"
              }`}
              title="Card view"
            >
              <RecIcon name="layout_card" size={13} />
            </button>
          </div>
        )}

        {/* bulk */}
        {bulkActions && bulkActions.length > 0 && selectedIds.length > 0 && (
          <div className="relative" ref={bulkRef}>
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-tool-accent bg-tool-accent-soft px-2 text-xs font-semibold text-tool-accent"
              aria-haspopup="menu"
              aria-expanded={bulkOpen}
            >
              {selectedIds.length} selected
              <RecIcon name="chevron_down" size={11} />
            </button>
            {bulkOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border border-app bg-app-elevated shadow-lg"
              >
                {bulkActions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onBulkAction?.(action.key, selectedIds);
                      setBulkOpen(false);
                    }}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                      action.destructive
                        ? "text-red-500 hover:bg-red-500/10"
                        : "text-secondary hover:bg-surface hover:text-app"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* + new */}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-tool-accent px-3 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
          style={{ color: "var(--bg)" }}
        >
          <RecIcon name="plus" size={11} />
          {newLabel}
        </button>
      </div>

      {/* ── quick add ─────────────────────────────────────────────────── */}
      {quickAdd}

      {/* ── body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <SkeletonRows columns={visibleColumns} layout={effectiveLayout} />
        ) : sortedRows.length === 0 ? (
          <div className="p-6">{empty}</div>
        ) : effectiveLayout === "cards" && renderCard ? (
          <div
            className="grid gap-3 p-3"
            style={{
              gridTemplateColumns: mobile
                ? "1fr"
                : "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {sortedRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onRowClick(row)}
                className="overflow-hidden rounded-lg border border-app bg-app-elevated text-left transition-all hover:-translate-y-0.5 hover:border-tool-accent hover:shadow-md"
              >
                {renderCard(row)}
              </button>
            ))}
          </div>
        ) : mobile ? (
          // Mobile: card-style rows (always single column)
          <div className="flex flex-col divide-y divide-app">
            {sortedRows.map((row) => (
              <MobileRow
                key={row.id}
                row={row}
                columns={visibleColumns}
                onClick={() => onRowClick(row)}
                selected={selectedIds.includes(row.id)}
                onToggleSelect={() => toggleRow(row.id)}
              />
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-app bg-app-elevated text-left">
                <th
                  className="sticky top-0 z-[1] w-8 bg-app-elevated px-3 py-2"
                  style={{ verticalAlign: "middle" }}
                >
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-current"
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className="sticky top-0 z-[1] bg-app-elevated px-3 py-2 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-secondary"
                    style={
                      {
                        textAlign: col.align ?? "left",
                        cursor: col.sortable ? "pointer" : "default",
                        minWidth: col.width,
                      } as CSSProperties
                    }
                    onClick={() => onHeaderClick(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        <RecIcon
                          name={sortDir === "asc" ? "arrow_up" : "arrow_down"}
                          size={10}
                        />
                      )}
                    </span>
                  </th>
                ))}
                <th className="sticky top-0 z-[1] w-10 bg-app-elevated" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const checked = selectedIds.includes(row.id);
                const actions = rowActions ? rowActions(row) : [];
                const menuOpen = openRowMenu === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`group border-b border-app transition-colors ${
                      checked
                        ? "bg-tool-accent-soft/40"
                        : "hover:bg-surface"
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={checked}
                        onChange={() => toggleRow(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 cursor-pointer accent-current"
                      />
                    </td>
                    {visibleColumns.map((col) => (
                      <td
                        key={col.key}
                        onClick={() => onRowClick(row)}
                        className="cursor-pointer truncate px-3 py-2 align-middle text-app"
                        style={{
                          textAlign: col.align ?? "left",
                          maxWidth: col.width ?? 280,
                        }}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    <td className="relative px-2 align-middle">
                      {actions.length > 0 && (
                        <button
                          type="button"
                          aria-label="Row actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRowMenu(menuOpen ? null : row.id);
                          }}
                          className="invisible inline-flex h-6 w-6 items-center justify-center rounded-md border border-app bg-app text-secondary group-hover:visible hover:text-app hover:border-tool-accent"
                        >
                          <RecIcon name="more" size={12} />
                        </button>
                      )}
                      {menuOpen && (
                        <div
                          role="menu"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-2 z-30 mt-1 w-44 overflow-hidden rounded-md border border-app bg-app-elevated shadow-lg"
                        >
                          {actions.map((a) => (
                            <button
                              key={a.key}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                a.onClick();
                                setOpenRowMenu(null);
                              }}
                              className={`flex w-full items-center px-3 py-2 text-left text-xs transition-colors ${
                                a.destructive
                                  ? "text-red-500 hover:bg-red-500/10"
                                  : "text-secondary hover:bg-surface hover:text-app"
                              }`}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SkeletonRows<T>({
  columns,
  layout,
}: {
  columns: RecordColumn<T>[];
  layout: RecordLayout;
}) {
  const placeholders = Array.from({ length: 8 });
  if (layout === "cards") {
    return (
      <div className="grid gap-3 p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {placeholders.map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border border-app bg-app-elevated"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="divide-y divide-app">
      {placeholders.map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="h-3.5 w-3.5 shrink-0 rounded border border-app" />
          {columns.map((c) => (
            <div
              key={c.key}
              className="h-3 animate-pulse rounded bg-surface"
              style={{ width: c.width ?? 120, maxWidth: "20%" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MobileRow<T extends { id: string }>({
  row,
  columns,
  onClick,
  selected,
  onToggleSelect,
}: {
  row: T;
  columns: RecordColumn<T>[];
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [primary, ...rest] = columns;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`flex min-h-[60px] cursor-pointer items-start gap-3 px-4 py-3 ${
        selected ? "bg-tool-accent-soft/40" : "active:bg-surface"
      }`}
    >
      <input
        type="checkbox"
        aria-label="Select row"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 h-4 w-4 accent-current"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-app">
          {primary?.render(row)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary">
          {rest.slice(0, 4).map((c) => (
            <span key={c.key} className="truncate">
              {c.render(row)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
