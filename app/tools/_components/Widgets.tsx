"use client";

import { motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TOOL_ICONS, TOOLS } from "../_data/tools-list";
import { useWorkspaceKey } from "./useWorkspaces";
import { useInstalledTools } from "./useInstalledTools";

/* Draggable, live-updating desktop widgets. Positions persist per-widget in
 * localStorage. Default layout is a left column of three + one on the top
 * right — the cluster-rather-than-corners layout the user asked for.
 *
 * Active set (which widgets are currently on the desktop) is persisted
 * separately under "tools-desktop-widget-active-v1". The Widget Gallery
 * (WidgetGallery.tsx) reads the registry + active set via the exports
 * below to let users add/remove widgets. */

interface WidgetsProps {
  onOpenTool: (slug: string, title: string) => void;
}

interface WidgetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STORAGE_SUFFIX = "tools-desktop-widgets-v3";
const ACTIVE_SUFFIX = "tools-desktop-widget-active-v1";
const ACTIVE_EVENT = "tools-desktop-widget-active-change";

export interface WidgetMeta {
  id: string;
  name: string;
  description: string;
  iconKey: keyof typeof TOOL_ICONS;
}

interface WidgetDef extends WidgetMeta {
  default: { x: number; y: number };
  w: number;
  h: number; // default intrinsic height — widget content determines minimum
  minW: number;
  minH: number;
}

const WIDGETS: WidgetDef[] = [
  {
    id: "clock",
    name: "Clock",
    description: "Local time and date, plus two other cities of your choosing.",
    iconKey: "trending",
    default: { x: 24, y: 56 },
    w: 280,
    h: 196,
    minW: 240,
    minH: 176,
  },
  {
    id: "workspace",
    name: "Workspace",
    description: "What this workspace has installed, and what else is available.",
    iconKey: "pulse",
    default: { x: 24, y: 276 },
    w: 280,
    h: 176,
    minW: 240,
    minH: 156,
  },
  {
    id: "tip",
    name: "Tips",
    description: "Short pointers on getting more out of the workspace.",
    iconKey: "spark",
    default: { x: 24, y: 476 },
    w: 280,
    h: 150,
    minW: 220,
    minH: 120,
  },
  {
    id: "featured",
    name: "Featured tool",
    description: "Top-rated tool of the moment — one click to launch.",
    iconKey: "star",
    default: { x: -24, y: 56 },
    w: 280,
    h: 240,
    minW: 240,
    minH: 200,
  },
];

/* Public registry consumed by WidgetGallery. */
export const WIDGET_REGISTRY: WidgetMeta[] = WIDGETS.map((w) => ({
  id: w.id,
  name: w.name,
  description: w.description,
  iconKey: w.iconKey,
}));

export const ALL_WIDGET_IDS: string[] = WIDGETS.map((w) => w.id);

/** Widgets a brand-new workspace starts with. All four are general-purpose. */
export const DEFAULT_WIDGET_IDS: string[] = ["clock", "workspace", "tip", "featured"];

function loadRects(storageKey: string): Record<string, WidgetRect> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveRects(storageKey: string, r: Record<string, WidgetRect>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(r));
  } catch {}
}

function defaultRects(vw: number): Record<string, WidgetRect> {
  const result: Record<string, WidgetRect> = {};
  for (const w of WIDGETS) {
    const x =
      w.default.x < 0 ? vw + w.default.x - w.w : w.default.x;
    result[w.id] = { x, y: w.default.y, w: w.w, h: w.h };
  }
  return result;
}

/* ───────── Active-set persistence + hook ───────── */

function loadActive(activeKey: string): string[] {
  if (typeof window === "undefined") return DEFAULT_WIDGET_IDS;
  try {
    const raw = localStorage.getItem(activeKey);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Filter to known ids — drops removed widgets, keeps order.
        return arr.filter((id): id is string =>
          typeof id === "string" && ALL_WIDGET_IDS.includes(id)
        );
      }
    }
  } catch {}
  return DEFAULT_WIDGET_IDS;
}

function saveActive(activeKey: string, ids: string[]) {
  try {
    localStorage.setItem(activeKey, JSON.stringify(ids));
  } catch {}
  // Notify other listeners in the same tab (storage event only fires cross-tab).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACTIVE_EVENT));
  }
}

/** Hook used by both Widgets and WidgetGallery so they stay in sync. */
export function useActiveWidgets(): {
  active: string[];
  isActive: (id: string) => boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  hydrated: boolean;
} {
  const ACTIVE_KEY = useWorkspaceKey(ACTIVE_SUFFIX);
  const [active, setActive] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setActive(loadActive(ACTIVE_KEY));
    setHydrated(true);
    const onChange = () => setActive(loadActive(ACTIVE_KEY));
    window.addEventListener(ACTIVE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(ACTIVE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [ACTIVE_KEY]);

  const add = useCallback((id: string) => {
    if (!ALL_WIDGET_IDS.includes(id)) return;
    setActive((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveActive(ACTIVE_KEY, next);
      return next;
    });
  }, [ACTIVE_KEY]);

  const remove = useCallback((id: string) => {
    setActive((prev) => {
      if (!prev.includes(id)) return prev;
      const next = prev.filter((x) => x !== id);
      saveActive(ACTIVE_KEY, next);
      return next;
    });
  }, [ACTIVE_KEY]);

  const isActive = useCallback((id: string) => active.includes(id), [active]);

  return { active, isActive, add, remove, hydrated };
}

/* ───────── Draggable shell ───────── */

function Widget({
  id,
  rect,
  minW,
  minH,
  z,
  onUpdate,
  onFocus,
  onRemove,
  children,
}: {
  id: string;
  rect: WidgetRect;
  minW: number;
  minH: number;
  z: number;
  onUpdate: (id: string, r: WidgetRect) => void;
  onFocus: () => void;
  onRemove: (id: string) => void;
  children: ReactNode;
}) {
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    if ((e.target as HTMLElement).closest("[data-resize]")) return;
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { x: rect.x, y: rect.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onUpdate(id, {
        ...rect,
        x: Math.max(4, startPos.x + dx),
        y: Math.max(40, startPos.y + dy),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.w;
    const startH = rect.h;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onUpdate(id, {
        ...rect,
        w: Math.max(minW, Math.min(window.innerWidth - rect.x - 8, startW + dx)),
        h: Math.max(minH, Math.min(window.innerHeight - rect.y - 80, startH + dy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <motion.div
      data-widget
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      onPointerDown={onPointerDown}
      className="group/widget absolute overflow-hidden rounded-2xl border border-app bg-app-elevated/95 shadow-2xl select-none cursor-grab active:cursor-grabbing"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: z }}
    >
      <div className="h-full p-4">{children}</div>

      {/* Remove button — only visible on hover */}
      <button
        type="button"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        aria-label="Remove widget from desktop"
        title="Remove from desktop"
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-app bg-app-elevated text-secondary opacity-0 shadow-sm transition-opacity hover:bg-surface hover:text-app group-hover/widget:opacity-100 focus:opacity-100"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Invisible resize hit zone — bottom-right corner, cursor hint only */}
      <div
        data-resize
        onPointerDown={onResizeDown}
        aria-label="Resize widget"
        role="button"
        tabIndex={-1}
        className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
      />
    </motion.div>
  );
}

/* ───────── Content pieces ───────── */

const INSIGHTS = [
  "Press Cmd-K anywhere to jump straight to an app, a file or a setting.",
  "Every app also works as its own page — handy for sharing one tool with someone.",
  "Workspaces keep their own apps and state. Make one per client or per project.",
  "Drag a window to a screen edge to snap it; double-click its title bar to maximise.",
  "Uninstall anything you do not use from the Store — the dock and search follow along.",
  "Right-click the desktop to change the wallpaper or add another widget.",
  "The admin panel has feature flags and roles if you are running this for a team.",
];



function useTicker<T>(items: T[], intervalMs: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, intervalMs]);
  return items[i];
}

function useFeaturedTool() {
  // Prefer tools the workspace actually installed — recommending a tool
  // the user does not have (and that may not suit their line of work) is
  // noise. Fall back to the global top-rated list only when nothing is
  // installed yet.
  const { installed } = useInstalledTools();
  const own = TOOLS.filter((t) => installed.includes(t.slug));
  const top = (own.length ? own : TOOLS.filter((t) => t.topRated)) as typeof TOOLS;
  const [i, setI] = useState(0);
  useEffect(() => {
    const initial = new Date().getHours() % top.length;
    setI(initial);
    const t = setInterval(
      () => setI((x) => (x + 1) % top.length),
      45_000
    );
    return () => clearInterval(t);
  }, [top.length]);
  return top[i];
}

/* ───────── Widgets ───────── */

export default function Widgets({ onOpenTool }: WidgetsProps) {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [rects, setRects] = useState<Record<string, WidgetRect>>({});
  const [zOrder, setZOrder] = useState<string[]>(WIDGETS.map((w) => w.id));
  const initialised = useRef(false);
  const { active, hydrated, remove } = useActiveWidgets();

  useEffect(() => {
    if (initialised.current) return;
    const vw = window.innerWidth;
    const defaults = defaultRects(vw);
    const stored = loadRects(STORAGE_KEY);
    const merged: Record<string, WidgetRect> = {};
    for (const w of WIDGETS) {
      merged[w.id] = stored[w.id] ?? defaults[w.id];
    }
    setRects(merged);
    initialised.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = useCallback((id: string, r: WidgetRect) => {
    setRects((prev) => {
      const next = { ...prev, [id]: r };
      saveRects(STORAGE_KEY, next);
      return next;
    });
  }, [STORAGE_KEY]);

  const handleFocus = useCallback((id: string) => {
    setZOrder((prev) => [...prev.filter((x) => x !== id), id]);
  }, []);

  const zOf = (id: string) => 10 + zOrder.indexOf(id);
  const defFor = (id: string) =>
    WIDGETS.find((w) => w.id === id) ?? WIDGETS[0];

  if (!hydrated || Object.keys(rects).length === 0) return null;

  const isActive = (id: string) => active.includes(id);

  return (
    <>
      {isActive("clock") && (
        <ClockWidget
          rect={rects.clock}
          def={defFor("clock")}
          z={zOf("clock")}
          onUpdate={handleUpdate}
          onFocus={() => handleFocus("clock")}
          onRemove={remove}
          onOpenTool={onOpenTool}
        />
      )}
      {isActive("workspace") && (
        <WorkspaceWidget
          rect={rects.workspace}
          def={defFor("workspace")}
          z={zOf("workspace")}
          onUpdate={handleUpdate}
          onFocus={() => handleFocus("workspace")}
          onRemove={remove}
        />
      )}
      {isActive("tip") && (
        <TipWidget
          rect={rects.tip}
          def={defFor("tip")}
          z={zOf("tip")}
          onUpdate={handleUpdate}
          onFocus={() => handleFocus("tip")}
          onRemove={remove}
        />
      )}
      {isActive("featured") && (
        <FeaturedWidget
          rect={rects.featured}
          def={defFor("featured")}
          z={zOf("featured")}
          onUpdate={handleUpdate}
          onFocus={() => handleFocus("featured")}
          onRemove={remove}
          onOpenTool={onOpenTool}
        />
      )}
    </>
  );
}

interface InstanceProps {
  rect: WidgetRect;
  def: WidgetDef;
  z: number;
  onUpdate: (id: string, r: WidgetRect) => void;
  onFocus: () => void;
  onRemove: (id: string) => void;
}

/* ───────── Market snapshot ───────── */

function ClockWidget({
  rect,
  def,
  z,
  onUpdate,
  onFocus,
  onRemove,
}: InstanceProps & {
  onOpenTool: (slug: string, title: string) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Rendered only after mount so the server and client never disagree. */
  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const date = now
    ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : "";
  const elsewhere = (tz: string) =>
    now ? now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }) : "--:--";

  return (
    <Widget id={def.id} rect={rect} minW={def.minW} minH={def.minH} z={z} onUpdate={onUpdate} onFocus={onFocus} onRemove={onRemove}>
      <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
        Clock
      </div>
      <div
        className="mt-2 text-[2.1rem] font-semibold leading-none tracking-tight text-app tabular-nums"
        aria-live="off"
      >
        {time}
      </div>
      <div className="mt-1.5 text-xs text-muted">{date}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="London" value={elsewhere("Europe/London")} />
        <Metric label="New York" value={elsewhere("America/New_York")} />
      </div>
    </Widget>
  );
}

/* ───────── Workspace ───────── */

function WorkspaceWidget({ rect, def, z, onUpdate, onFocus, onRemove }: InstanceProps) {
  const { installed } = useInstalledTools();
  const total = TOOLS.length;
  const categories = new Set(TOOLS.map((t) => t.category)).size;
  const count = installed.length;

  return (
    <Widget id={def.id} rect={rect} minW={def.minW} minH={def.minH} z={z} onUpdate={onUpdate} onFocus={onFocus} onRemove={onRemove}>
      <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
        Workspace
      </div>
      <div className="mt-2 text-[1.55rem] font-semibold leading-none tracking-tight text-app tabular-nums">
        {count}
        <span className="text-sm font-normal text-muted"> installed</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Available" value={String(total)} />
        <Metric label="Categories" value={String(categories)} />
      </div>
    </Widget>
  );
}

/* ───────── Tips ───────── */

function TipWidget({ rect, def, z, onUpdate, onFocus, onRemove }: InstanceProps) {
  const insight = useTicker(INSIGHTS, 10_000);

  return (
    <Widget id={def.id} rect={rect} minW={def.minW} minH={def.minH} z={z} onUpdate={onUpdate} onFocus={onFocus} onRemove={onRemove}>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a7 7 0 00-4 12.7V17a2 2 0 002 2h4a2 2 0 002-2v-2.3A7 7 0 0012 2zm-2 19h4v1a2 2 0 01-4 0v-1z" />
          </svg>
        </span>
        <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
          Tip
        </div>
      </div>
      <motion.p
        key={insight}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mt-2 text-[0.8rem] leading-relaxed text-app"
      >
        {insight}
      </motion.p>
    </Widget>
  );
}

/* ───────── Featured tool ───────── */

function FeaturedWidget({
  rect,
  def,
  z,
  onUpdate,
  onFocus,
  onRemove,
  onOpenTool,
}: InstanceProps & {
  onOpenTool: (slug: string, title: string) => void;
}) {
  const tool = useFeaturedTool();

  return (
    <Widget id={def.id} rect={rect} minW={def.minW} minH={def.minH} z={z} onUpdate={onUpdate} onFocus={onFocus} onRemove={onRemove}>
      <div className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-muted">
        Featured tool
      </div>
      <motion.div
        key={tool.slug}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mt-3 flex items-center gap-3"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-strong text-app">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={TOOL_ICONS[tool.icon] ?? TOOL_ICONS.home} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-app">{tool.title}</div>
          <div className="truncate text-[11px] text-muted">Top rated</div>
        </div>
      </motion.div>
      <motion.p
        key={tool.slug + "desc"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="mt-3 line-clamp-3 text-xs leading-relaxed text-secondary"
      >
        {tool.description}
      </motion.p>
      <button
        type="button"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          onOpenTool(tool.slug, tool.title);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-app px-3 py-1.5 text-[0.72rem] font-medium text-app hover:opacity-90 transition-opacity"
      >
        Start now
      </button>
    </Widget>
  );
}

/* ───────── Small atoms ───────── */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-app bg-app p-2">
      <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-app tabular-nums">{value}</div>
    </div>
  );
}
