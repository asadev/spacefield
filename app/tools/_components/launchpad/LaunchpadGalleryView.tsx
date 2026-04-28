"use client";

/* LaunchpadGalleryView — Finder Gallery layout, simplified for v1.
 *
 * Hero (top, centered): the focused app's icon at 192px + title +
 * description. Strip (bottom, horizontal scroll): every other app as a
 * 64px thumbnail. Click a thumb to focus it (animates the hero up top);
 * double-click or press Enter to open.
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

export default function LaunchpadGalleryView({
  tools,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
}: Props) {
  const focused = tools.find((t) => t.slug === focusedSlug) ?? tools[0] ?? null;

  if (tools.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No items
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-6">
        {focused && (
          <>
            {hasAppIcon(focused.slug) ? (
              <AppIcon slug={focused.slug} size={192} cornerPct={24} />
            ) : (
              <div className="h-[192px] w-[192px] rounded-3xl bg-surface" />
            )}
            <div className="text-lg font-semibold text-app">{focused.title}</div>
            <div className="text-[11px] uppercase tracking-wider text-muted">
              {categoryLabel(focused.category)}
            </div>
            <p className="max-w-xl text-center text-[13px] leading-relaxed text-secondary">
              {focused.description}
            </p>
            <button
              type="button"
              onClick={() => onOpen(focused)}
              className="mt-2 rounded-md bg-tool-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Open
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="border-t border-app bg-app-elevated">
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-3">
          {tools.map((t) => {
            const sel = focused?.slug === t.slug;
            return (
              <button
                key={t.slug}
                type="button"
                title={t.title}
                onClick={() => onFocus(t.slug)}
                onDoubleClick={() => onOpen(t)}
                onContextMenu={(e) => onContextMenu(e, t)}
                className={
                  "shrink-0 rounded-lg p-1 transition-all " +
                  (sel
                    ? "ring-2 ring-tool-accent"
                    : "opacity-70 hover:opacity-100")
                }
              >
                {hasAppIcon(t.slug) ? (
                  <AppIcon slug={t.slug} size={56} cornerPct={22} flatShadow />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-surface" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
