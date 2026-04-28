"use client";

/* LaunchpadIconView — the default Finder grid layout for the main pane.
 *
 * Uses the existing AppIcon component plus the icon-style fallback tile
 * for tools that don't have a custom SVG. Right-click on a tile fires
 * `onContextMenu` so the parent can show the "Uninstall" menu (this is
 * the existing Launchpad behavior preserved verbatim).
 */

import { motion } from "framer-motion";
import { TOOL_ICONS, type ToolItem } from "../../_data/tools-list";
import AppIcon, { hasAppIcon } from "../AppIcon";
import { useIconStyle } from "../useIconStyle";
import type { IconStyleId } from "../icon-styles";
import {
  setAppDragPayload,
  type AppDragPayload,
} from "../appDrag";

const TILE_BASE =
  "flex h-16 w-16 items-center justify-center transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-2xl";

function tileClassFor(style: IconStyleId): string {
  switch (style) {
    case "filled":
      return `${TILE_BASE} rounded-2xl bg-tool-accent text-white shadow-md group-hover:opacity-90`;
    case "squircle":
      return `${TILE_BASE} rounded-[28%] bg-tool-accent-soft text-tool-accent shadow-md ring-1 ring-inset ring-tool-accent/25 group-hover:ring-tool-accent/50`;
    case "rounded-square":
      return `${TILE_BASE} rounded-lg border border-app bg-app text-app group-hover:bg-surface`;
    case "hairline":
    default:
      return `${TILE_BASE} rounded-2xl border border-app bg-app text-app group-hover:bg-surface`;
  }
}

interface ToolGroup {
  label: string;
  tools: ToolItem[];
}

interface Props {
  tools: ToolItem[];
  focusedSlug: string | null;
  onFocus: (slug: string) => void;
  onOpen: (tool: ToolItem) => void;
  onContextMenu: (e: React.MouseEvent, tool: ToolItem) => void;
  /** When provided, the icon view renders one labelled section per
   * group instead of a single flat grid. Empty groups are skipped. */
  groups?: ToolGroup[];
}

export default function LaunchpadIconView({
  tools,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
  groups,
}: Props) {
  const { style: iconStyle } = useIconStyle();
  const tileCls = tileClassFor(iconStyle);

  if (groups && groups.length > 0) {
    const filled = groups.filter((g) => g.tools.length > 0);
    if (filled.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted">
          No items
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2 p-6">
        {filled.map((g) => (
          <section key={g.label} className="flex flex-col gap-3">
            <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {g.label}
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {g.tools.map((t, i) => (
                <IconTile
                  key={t.slug}
                  tool={t}
                  index={i}
                  focused={focusedSlug === t.slug}
                  tileCls={tileCls}
                  onFocus={onFocus}
                  onOpen={onOpen}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No items
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {tools.map((t, i) => (
        <IconTile
          key={t.slug}
          tool={t}
          index={i}
          focused={focusedSlug === t.slug}
          tileCls={tileCls}
          onFocus={onFocus}
          onOpen={onOpen}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

interface IconTileProps {
  tool: ToolItem;
  index: number;
  focused: boolean;
  tileCls: string;
  onFocus: (slug: string) => void;
  onOpen: (tool: ToolItem) => void;
  onContextMenu: (e: React.MouseEvent, tool: ToolItem) => void;
}

function IconTile({
  tool: t,
  index: i,
  focused,
  tileCls,
  onFocus,
  onOpen,
  onContextMenu,
}: IconTileProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        const payload: AppDragPayload = {
          type: "spacefield-app",
          slug: t.slug,
          fromZone: "launchpad",
        };
        setAppDragPayload(e.dataTransfer, payload);
      }}
    >
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: Math.min(i * 0.01, 0.3) }}
        onClick={() => {
          onFocus(t.slug);
          onOpen(t);
        }}
        onFocus={() => onFocus(t.slug)}
        onContextMenu={(e) => onContextMenu(e, t)}
        className={
          "group flex w-full flex-col items-center gap-2 rounded-lg p-2 transition-colors " +
          (focused ? "bg-tool-accent-soft" : "hover:bg-surface")
        }
      >
        {hasAppIcon(t.slug) ? (
          <AppIcon
            slug={t.slug}
            size={64}
            cornerPct={24}
            label={t.title}
            className="transition-transform duration-200 group-hover:-translate-y-0.5"
          />
        ) : (
          <span className={tileCls}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={TOOL_ICONS[t.icon] ?? TOOL_ICONS.home} />
            </svg>
          </span>
        )}
        <span className="line-clamp-2 max-w-[8rem] text-center text-[0.78rem] font-medium leading-tight tracking-tight text-app">
          {t.title}
        </span>
      </motion.button>
    </div>
  );
}
