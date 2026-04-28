"use client";

/* LaunchpadColumnView — v1 fallback for Finder column / Cover Flow.
 *
 * Two panes:
 *   Left  → vertical list of apps, click to focus.
 *   Right → preview of the focused app (icon + title + description +
 *            category + Open button).
 *
 * Full Miller-columns navigation (recursive children) is overkill for an
 * app launcher — apps don't have sub-items the way folders do. The
 * arrow-key column nav is left as a future polish item.
 */

import AppIcon, { hasAppIcon } from "../AppIcon";
import { TOOL_CATEGORIES, type ToolItem } from "../../_data/tools-list";

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

export default function LaunchpadColumnView({
  tools,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
}: Props) {
  const focused =
    tools.find((t) => t.slug === focusedSlug) ?? tools[0] ?? null;

  return (
    <div className="grid h-full grid-cols-[minmax(220px,1fr)_minmax(0,1.4fr)] gap-0">
      {/* Column 1 — list */}
      <div className="flex flex-col overflow-y-auto border-r border-app">
        {tools.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            No items
          </div>
        ) : (
          tools.map((t) => {
            const sel = focused?.slug === t.slug;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => onFocus(t.slug)}
                onDoubleClick={() => onOpen(t)}
                onContextMenu={(e) => onContextMenu(e, t)}
                className={
                  "flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors " +
                  (sel
                    ? "bg-tool-accent text-white"
                    : "text-app hover:bg-surface")
                }
              >
                {hasAppIcon(t.slug) ? (
                  <AppIcon slug={t.slug} size={18} cornerPct={22} flatShadow />
                ) : (
                  <span className="h-[18px] w-[18px] shrink-0 rounded bg-surface" />
                )}
                <span className="truncate">{t.title}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Column 2 — preview */}
      <div className="flex flex-col items-center justify-start overflow-y-auto bg-app p-6">
        {focused ? (
          <>
            <div className="pt-4">
              {hasAppIcon(focused.slug) ? (
                <AppIcon slug={focused.slug} size={120} cornerPct={24} />
              ) : (
                <div className="h-[120px] w-[120px] rounded-2xl bg-surface" />
              )}
            </div>
            <div className="mt-4 text-center text-base font-semibold text-app">
              {focused.title}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wider text-muted">
              {categoryLabel(focused.category)}
            </div>
            <p className="mt-4 max-w-md text-center text-[13px] leading-relaxed text-secondary">
              {focused.description}
            </p>
            <button
              type="button"
              onClick={() => onOpen(focused)}
              className="mt-6 rounded-md bg-tool-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Open
            </button>
          </>
        ) : (
          <div className="text-sm text-muted">No item selected</div>
        )}
      </div>
    </div>
  );
}
