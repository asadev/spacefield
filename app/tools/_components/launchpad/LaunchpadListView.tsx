"use client";

/* LaunchpadListView — Finder-style list with sortable columns.
 *
 * Columns: Name · Date Modified · Size · Kind. Click a header to toggle
 * sort by that column; click again to flip direction. Date Modified
 * shows "—" because we don't track per-install timestamps; Size shows
 * "App" (apps are not measured in bytes here).
 *
 * Double-click opens, single click focuses. Right-click bubbles to the
 * parent context menu.
 */

import { useMemo, useState } from "react";
import AppIcon, { hasAppIcon } from "../AppIcon";
import { TOOL_CATEGORIES, type ToolItem } from "../../_data/tools-list";

type SortKey = "name" | "date" | "size" | "kind";
type SortDir = "asc" | "desc";

function categoryLabel(key: ToolItem["category"]): string {
  return TOOL_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

interface Props {
  tools: ToolItem[];
  focusedSlug: string | null;
  onFocus: (slug: string) => void;
  onOpen: (tool: ToolItem) => void;
  onContextMenu: (e: React.MouseEvent, tool: ToolItem) => void;
}

export default function LaunchpadListView({
  tools,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const arr = [...tools];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "kind":
          cmp = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
          break;
        case "size":
        case "date":
          // Both unsorted-by-data — fall back to name so the ordering
          // isn't accidentally non-deterministic.
          cmp = a.title.localeCompare(b.title);
          break;
        default:
          cmp = a.title.localeCompare(b.title);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [tools, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (tools.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No items
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app bg-app-elevated px-3 py-1.5 text-[11px] font-medium text-muted">
        <SortHeader label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
        <SortHeader label="Date Modified" col="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
        <SortHeader label="Size" col="size" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
        <SortHeader label="Kind" col="kind" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {sorted.map((t) => {
          const focused = focusedSlug === t.slug;
          return (
            <div
              key={t.slug}
              role="row"
              tabIndex={0}
              onClick={() => onFocus(t.slug)}
              onDoubleClick={() => onOpen(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onOpen(t);
                }
              }}
              onContextMenu={(e) => onContextMenu(e, t)}
              className={
                "grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app/60 px-3 py-1.5 text-[12px] text-app cursor-default transition-colors " +
                (focused
                  ? "bg-tool-accent text-white"
                  : "hover:bg-surface")
              }
            >
              <span className="flex items-center gap-2 truncate">
                {hasAppIcon(t.slug) ? (
                  <AppIcon slug={t.slug} size={18} cornerPct={22} flatShadow />
                ) : (
                  <span className="h-[18px] w-[18px] shrink-0 rounded bg-surface" />
                )}
                <span className="truncate">{t.title}</span>
              </span>
              <span className="truncate text-secondary [.bg-tool-accent_&]:text-white/80">—</span>
              <span className="truncate text-secondary [.bg-tool-accent_&]:text-white/80">App</span>
              <span className="truncate text-secondary [.bg-tool-accent_&]:text-white/80">{categoryLabel(t.category)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onClick(col)}
      className={
        "flex items-center gap-1 text-left uppercase tracking-wider transition-colors " +
        (active ? "text-app" : "hover:text-app")
      }
    >
      <span>{label}</span>
      {active && (
        <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
          {sortDir === "asc" ? (
            <path d="M7 14l5-5 5 5z" />
          ) : (
            <path d="M7 10l5 5 5-5z" />
          )}
        </svg>
      )}
    </button>
  );
}
