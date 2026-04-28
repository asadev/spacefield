"use client";

import { motion } from "framer-motion";
import { TOOLS, TOOL_ICONS } from "../_data/tools-list";
import AppIcon, { hasAppIcon } from "./AppIcon";
import { useHomeApps } from "./useHomeApps";
import { setAppDragPayload } from "./appDrag";

/* App shortcuts placed freely on the desktop home, mirroring widgets but
 * one-shot (just an icon + label, fixed size). Dragging an icon out of
 * Home into Dock or Launchpad is wired at the Desktop level — this
 * component only emits the drag payload; the desktop's drop handlers
 * decide what to do with it. */

interface Props {
  onOpenTool: (slug: string, title: string) => void;
}

const ICON_SIZE = 64;
const TILE_W = 88;

export default function HomeApps({ onOpenTool }: Props) {
  const { positions, hydrated, remove } = useHomeApps();

  if (!hydrated) return null;

  const slugs = Object.keys(positions);
  if (slugs.length === 0) return null;

  return (
    <>
      {slugs.map((slug) => {
        const tool = TOOLS.find((t) => t.slug === slug);
        if (!tool) return null;
        const pos = positions[slug];
        return (
          <div
            key={slug}
            draggable
            onDragStart={(e) => {
              setAppDragPayload(e.dataTransfer, {
                type: "spacefield-app",
                slug,
                fromZone: "home",
              });
            }}
            className="absolute z-[5]"
            style={{ left: pos.x, top: pos.y, width: TILE_W }}
          >
          <motion.button
            type="button"
            onClick={() => onOpenTool(tool.slug, tool.title)}
            onContextMenu={(e) => {
              e.preventDefault();
              remove(slug);
            }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="flex w-full flex-col items-center gap-1.5 cursor-grab active:cursor-grabbing focus:outline-none"
            aria-label={tool.title}
            title={`${tool.title} — drag to dock or launchpad, right-click to remove`}
          >
            {hasAppIcon(slug) ? (
              <AppIcon
                slug={slug}
                size={ICON_SIZE}
                cornerPct={24}
                mono
                label={tool.title}
                className="pointer-events-none transition-transform duration-200 hover:-translate-y-0.5"
              />
            ) : (
              <span
                className="pointer-events-none flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur-xl shadow-md transition-all duration-200 hover:bg-white/25"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d={TOOL_ICONS[tool.icon] ?? TOOL_ICONS.home} />
                </svg>
              </span>
            )}
            <span className="pointer-events-none line-clamp-2 max-w-full text-center text-[0.72rem] font-medium leading-tight tracking-tight text-white/95 drop-shadow-md">
              {tool.title}
            </span>
          </motion.button>
          </div>
        );
      })}
    </>
  );
}

export const HOME_APP_TILE_W = TILE_W;
export const HOME_APP_ICON_SIZE = ICON_SIZE;
