import type * as React from "react";

export type ToolCategoryKey =
  // Real-estate categories (original)
  | "intelligence"
  | "calculators"
  | "investment"
  | "research"
  | "compliance"
  | "agent"
  // Cross-industry categories (from /solutions)
  | "productivity"
  | "finance"
  | "hr"
  | "marketing"
  | "sales"
  | "legal"
  | "data"
  | "design"
  | "support"
  | "growth"
  | "content"
  | "crm"
  | "files";

export interface ToolCategory {
  key: ToolCategoryKey;
  label: string;
  short: string;
  icon: string; // SVG path `d` string
  accent: string; // Tailwind color family
}

export interface ToolItem {
  slug: string;
  title: string;
  description: string;
  category: ToolCategoryKey;
  topRated?: boolean;
  icon: keyof typeof TOOL_ICONS;
  /**
   * Iframe route used inside the workspace Window component. Defaults to
   * `/tools/<slug>` when omitted — real-estate tools that live natively in
   * `app/tools/<slug>` rely on the default. Cross-industry tools from
   * `app/solutions/tools/<slug>` set this to `/solutions/tools/<slug>`.
   */
  route?: string;
  /**
   * Per-tool default window size. When the user opens this tool for the
   * first time, the desktop opens at this size. Sensible defaults are
   * applied per category in `defaultWindowSizeFor()` if a tool doesn't
   * override here. Persisted size from localStorage always wins after
   * the first open.
   */
  defaultSize?: { w: number; h: number };
  /**
   * Minimum allowed resize. Defaults from category if not set.
   */
  minSize?: { w: number; h: number };
  /**
   * Native React component path. When set, the desktop Window mounts the
   * component directly inside the window body (no iframe). The component
   * receives `NativeAppProps` (windowId, width, height, initialParams,
   * initialParamsKey, openApp, closeWindow). Lazy-imported so initial
   * bundle stays small.
   *
   * Convention: the file lives at `app/tools/<slug>/_app.tsx` (RE tools)
   * or `app/solutions/tools/<slug>/_app.tsx` (solutions) and exports a
   * default React component conforming to NativeAppProps.
   */
  app?: () => Promise<{ default: React.ComponentType<NativeAppProps> }>;
}

/**
 * Props every native tool component receives. Mirrors the imatch panel
 * NativeAppProps shape.
 */
export interface NativeAppProps {
  /** The window's persistent id — handy if a tool wants to scope local state. */
  windowId: string;
  /** Live window inner-content width (excludes title bar) — apps may
   * re-layout for narrow panes. */
  width: number;
  /** Live window inner-content height. */
  height: number;
  /** Optional intent params from openApp(). Read on mount and re-read when
   * `initialParamsKey` changes. */
  initialParams?: Record<string, unknown>;
  /** Bumps each time openApp() is called for this tool — useEffect dep so
   * the app reacts to a re-open with new context. */
  initialParamsKey?: number;
  /** Resolved theme — apps that draw to canvas need this. */
  resolved: "dark" | "light";
  /** Open another tool by slug. Spawns a new window or focuses existing. */
  openApp: (slug: string, params?: Record<string, unknown>) => void;
  /** Close this window programmatically. */
  closeWindow: () => void;
}

/**
 * Per-category default sizes. Picked so each tool opens at a size that
 * actually fits its content — not a giant 1280×800 box for a small
 * calculator. Map applies when a ToolItem doesn't set its own size.
 *   form-heavy / document tools → ~960×680
 *   calculators / single-screen → 720×600
 *   maps / dashboards / charts  → 1100×700
 *   editors / split panes       → 980×640
 */
export function defaultWindowSizeFor(category: ToolCategoryKey): { w: number; h: number } {
  switch (category) {
    case "intelligence":
    case "research":
    case "growth":
      return { w: 1100, h: 720 };
    case "calculators":
    case "compliance":
    case "hr":
      return { w: 760, h: 620 };
    case "agent":
    case "legal":
    case "marketing":
    case "sales":
      return { w: 960, h: 680 };
    case "investment":
    case "finance":
    case "crm":
      return { w: 1000, h: 680 };
    case "data":
    case "design":
    case "support":
    case "productivity":
    case "content":
      return { w: 880, h: 640 };
    default:
      return { w: 880, h: 620 };
  }
}

export function minWindowSizeFor(category: ToolCategoryKey): { w: number; h: number } {
  // Same shape across categories — the user can always shrink to a usable
  // floor. Per-tool overrides via ToolItem.minSize win.
  switch (category) {
    case "intelligence":
    case "research":
      return { w: 600, h: 480 };
    default:
      return { w: 480, h: 400 };
  }
}

/* SVG path data for tool icons. Kept as a shared dictionary so multiple
 * surfaces (dock, launchpad, widgets) render the same glyph per tool. */
export const TOOL_ICONS = {
  compass:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm4 4l-6 2-2 6 6-2 2-6zm-4 3a1 1 0 100 2 1 1 0 000-2z",
  home: "M3 12l9-9 9 9v9a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2v-9zm9-6.2L5 12v8h3v-7h8v7h3v-8l-7-6.2z",
  target:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12zm0 4a2 2 0 100 4 2 2 0 000-4z",
  pulse:
    "M2 12h4l2-6 4 12 3-8 2 4 3-2h2v2h-2l-3 2-2-4-3 8L8 12 6 14H2z",
  chart:
    "M4 20h16v-2H4v2zM6 16h2v-6H6v6zm4 0h2V6h-2v10zm4 0h2v-4h-2v4zm4 0h2V10h-2v6z",
  trending:
    "M3 17l6-6 4 4 8-8v4h2V3h-7v2h4l-7 7-4-4-8 8 2 1z",
  calculator:
    "M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zm2 4v3h8V7H8zm0 5v2h2v-2H8zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM8 16v2h2v-2H8zm4 0v2h6v-2h-6z",
  receipt:
    "M6 2h12a1 1 0 011 1v19l-3-2-2 2-2-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 011-1zm2 5v2h8V7H8zm0 4v2h8v-2H8zm0 4v2h5v-2H8z",
  percent:
    "M5 19L19 5M7 8a2 2 0 11-4 0 2 2 0 014 0zm14 8a2 2 0 11-4 0 2 2 0 014 0z",
  wallet:
    "M3 7a2 2 0 012-2h14a2 2 0 012 2v2h-4a3 3 0 100 6h4v2a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm15 4a1 1 0 100 2h3v-2h-3z",
  scale:
    "M12 2v2h4l-4 8 3 1a3 3 0 01-6 0l3-1L8 4h4V2h0zM4 18h16v2H4v-2z",
  building:
    "M5 3h14v18H5V3zm2 2v3h3V5H7zm5 0v3h3V5h-3zm5 0v3h2V5h-2zM7 10v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2zM7 15v3h3v-3H7zm5 0v3h3v-3h-3zm5 0v3h2v-3h-2z",
  refresh:
    "M12 4a8 8 0 017.6 5.5H17v2h6V5h-2v3.3A10 10 0 002 12h2a8 8 0 018-8zm0 16a8 8 0 01-7.6-5.5H7v-2H1v6.5h2v-3.3A10 10 0 0022 12h-2a8 8 0 01-8 8z",
  portfolio:
    "M3 7a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm4 4v2h3v-2H7zm0 3v2h10v-2H7zm0 3v2h8v-2H7zM7 4h10v1H7V4z",
  clock:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm1 3h-2v6l4.5 2.7 1-1.6-3.5-2.1V7z",
  passport:
    "M6 2a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H6zm6 4a4 4 0 110 8 4 4 0 010-8zm-4 12h8v-1a4 4 0 00-8 0v1z",
  users:
    "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  pin: "M12 2a8 8 0 00-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 00-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z",
  grid: "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
  compare:
    "M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4V3zm2 0v18h4a2 2 0 002-2V5a2 2 0 00-2-2h-4zm8 0v18h2V3h-2z",
  copy: "M8 2h11a2 2 0 012 2v13a2 2 0 01-2 2h-2v-2h2V4H8V2zm-5 4h11a2 2 0 012 2v13a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2zm0 2v13h11V8H3z",
  trophy:
    "M5 3h14v2a4 4 0 01-4 4 3 3 0 01-2 .83V13h2v2H9v-2h2V9.83A3 3 0 019 9a4 4 0 01-4-4V3zm0 4.82A2 2 0 007 9v-.2A2 2 0 015 7V5h0v2.82zm12 0V5h0v2a2 2 0 01-2 1.8V9a2 2 0 002-1.18zM6 17h12v2H6v-2z",
  flow: "M3 6a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8l2 2h5a2 2 0 012 2v2a2 2 0 002 2h-2v-2h-3a2 2 0 01-2-2v-2H9a2 2 0 01-2-2v-2H5a2 2 0 01-2-2V6z",
  globe:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.2 0 2.3 1.7 3 4.2-1 .3-2 .5-3 .5s-2-.2-3-.5c.7-2.5 1.8-4.2 3-4.2zM6.3 6.3A8 8 0 019 5.4c-.4 1-.8 2.1-1 3.2L6.3 6.3zm11.4 0L16 8.6c-.3-1.1-.6-2.2-1-3.2 1 .1 1.9.4 2.7.9zM4 12a8 8 0 01.5-2.8c1 .4 2.2.7 3.3.9-.2 1-.3 2-.3 3s.1 1.9.3 2.9c-1.2.2-2.3.5-3.3.9A8 8 0 014 12zm8 8c-1.2 0-2.3-1.7-3-4.2 1-.3 2-.5 3-.5s2 .2 3 .5c-.7 2.5-1.8 4.2-3 4.2zm5.7-2.3L16 15.4c.3-1 .7-2 1-3.1 1.2.2 2.3.5 3.3 1a8 8 0 01-2.6 4.3zm.5-8.5c-1 .4-2.2.8-3.4 1 .3-1 .4-2 .4-3s-.1-1.9-.4-2.9c1.2.2 2.4.5 3.4 1A8 8 0 0120 12z",
  shield:
    "M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm0 2.18L18 6.3V11c0 4.06-2.78 7.77-6 9.09C8.78 18.77 6 15.06 6 11V6.3l6-2.12z",
  clipboard:
    "M9 2h6a1 1 0 011 1v1h3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h3V3a1 1 0 011-1zm1 2v2h4V4h-4zm6 7.5l-4 4-2-2-1.4 1.4 3.4 3.4 5.4-5.4L16 11.5z",
  document:
    "M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V8h4.5L13 3.5zM8 13h8v2H8v-2zm0 4h8v2H8v-2z",
  image:
    "M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm2 4v8l4-4 2 2 4-4 2 2V8H6zm3 3a1 1 0 100-2 1 1 0 000 2z",
  dots9:
    "M5 5h2v2H5V5zm6 0h2v2h-2V5zm6 0h2v2h-2V5zM5 11h2v2H5v-2zm6 0h2v2h-2v-2zm6 0h2v2h-2v-2zM5 17h2v2H5v-2zm6 0h2v2h-2v-2zm6 0h2v2h-2v-2z",
  // Extended glyphs for cross-industry tools
  briefcase:
    "M10 2h4a2 2 0 012 2v2h4a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h4V4a2 2 0 012-2zm0 4h4V4h-4v2zM4 8v4h16V8H4zm0 6v5h16v-5h-6v2h-4v-2H4z",
  mail:
    "M3 5h18a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1zm1 2v1.4l8 5 8-5V7H4zm16 3.3l-8 5-8-5V17h16v-6.7z",
  bell:
    "M12 2a6 6 0 00-6 6v3.3l-2 3.2V16h16v-1.5l-2-3.2V8a6 6 0 00-6-6zm0 2a4 4 0 014 4v4l1.5 2.4H6.5L8 12V8a4 4 0 014-4zm-2 14a2 2 0 004 0h-4z",
  message:
    "M3 5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2H8l-5 4V5zm2 0v13l3-2h11V5H5zm2 3h10v2H7V8zm0 3h7v2H7v-2z",
  code:
    "M8 6l-6 6 6 6 1.4-1.4L4.8 12l4.6-4.6L8 6zm8 0l-1.4 1.4L19.2 12l-4.6 4.6L16 18l6-6-6-6zm-2.3.2l-4 14 1.9.6 4-14-1.9-.6z",
  tag:
    "M3 3h8.6a2 2 0 011.4.6l8 8a2 2 0 010 2.8l-6.6 6.6a2 2 0 01-2.8 0l-8-8A2 2 0 013 11.6V3zm2 2v6.6L13 19.6l6.6-6.6L11.6 5H5zm2 2a1 1 0 112 0 1 1 0 01-2 0z",
  ruler:
    "M3 17L17 3l4 4L7 21l-4-4zm2.8 0l1.8 1.8 1.4-1.4-1.8-1.8L5.8 17zm3.5-3.5l1.4 1.4L12.5 13l-1.4-1.4-1.8 1.9zm3.5-3.5L14.2 11.4l1.8-1.8-1.4-1.4-1.8 1.8z",
  palette:
    "M12 2a10 10 0 100 20 2 2 0 001.6-3.2c-.4-.5-.4-1.3 0-1.8A2 2 0 0115.2 16H17a5 5 0 005-5 9 9 0 00-10-9zm0 2c3.9 0 7 3.1 7 6a3 3 0 01-3 3h-1.8a4 4 0 00-3.1 1.4 4 4 0 000 5.2A8 8 0 1112 4zm-5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5-2a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 2a1.5 1.5 0 110 3 1.5 1.5 0 010-3z",
  lock:
    "M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v3H9V7a3 3 0 013-3zM6 12h12v9H6v-9zm6 2a2 2 0 00-1 3.7V20h2v-2.3A2 2 0 0012 14z",
  flag:
    "M5 3v19h2v-7h6l1 2h7V5h-6l-1-2H5zm2 2h5.4l1 2H19v8h-5.4l-1-2H7V5z",
  list:
    "M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z",
  play:
    "M8 5v14l11-7L8 5z",
  star:
    "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z",
  note:
    "M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V8h4.5L13 3.5zM8 10h8v2H8v-2zm0 4h5v2H8v-2z",
  spark:
    "M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z",
  kanban:
    "M3 4h18v2H3V4zm1 4h4v12H4V8zm6 0h4v8h-4V8zm6 0h4v10h-4V8z",
  bookmark:
    "M6 2h12a1 1 0 011 1v19l-7-4-7 4V3a1 1 0 011-1z",
  layers:
    "M12 2L2 7l10 5 10-5-10-5zm0 2.2L18.5 7 12 10.3 5.5 7 12 4.2zM2 12l10 5 10-5-2-1-8 4-8-4-2 1zm0 5l10 5 10-5-2-1-8 4-8-4-2 1z",
  megaphone:
    "M3 9v6h3l5 4V5L6 9H3zm13-1a5 5 0 010 8V8zm-3 0a4 4 0 010 8v-1a3 3 0 000-6V8z",
  funnel:
    "M3 4h18l-7 9v7l-4-2v-5L3 4zm3.1 2l5 6.5v5l2 1v-6l5-6.5H6.1z",
  map: "M9 2L3 4v18l6-2 6 2 6-2V2l-6 2-6-2zm0 2.2l6 2v15.6l-6-2V4.2zM5 5.5L7 5v15.5l-2 .5V5.5zM17 4.5l2-.5v15.5l-2 .5V4.5z",
  hash:
    "M10 3L9 9H5v2h3.6L7.8 15H4v2h3.4l-1 6h2l1-6h4l-1 6h2l1-6h4v-2h-3.6l.8-4H20V9h-3.4l1-6h-2l-1 6h-4l1-6h-2zm.4 8h4l-.8 4h-4l.8-4z",
  pen: "M4 20v-3.5l9.5-9.5 3.5 3.5L7.5 20H4zm2-2h1.5l7.9-7.9-1.5-1.5L6 16.5V18zm11.3-9.7l-3.5-3.5 2-2a1 1 0 011.4 0l2.1 2.1a1 1 0 010 1.4l-2 2z",
  dashboard:
    "M12 2a10 10 0 1010 10h-2a8 8 0 11-8-8V2zm1 0v9l6.3-6.3A10 10 0 0013 2zM11 13a1 1 0 102 0 1 1 0 00-2 0z",
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    key: "intelligence",
    label: "Analysis & Intelligence",
    short: "Analysis",
    accent: "purple",
    icon: "M12 2a5 5 0 00-5 5v1a4 4 0 00-3 3.87V17a3 3 0 003 3h1v2h8v-2h1a3 3 0 003-3v-5.13A4 4 0 0017 8V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2h-1v2h2a2 2 0 012 2v5a1 1 0 01-1 1h-2v2H9v-2H7a1 1 0 01-1-1v-5a2 2 0 012-2h2V9H9V7a3 3 0 013-3z",
  },
  {
    key: "calculators",
    label: "Calculators",
    short: "Calculators",
    accent: "blue",
    icon: "M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zm2 4v3h8V7H8zm0 5v2h2v-2H8zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2zM8 16v2h2v-2H8zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z",
  },
  {
    key: "investment",
    label: "Investment Tools",
    short: "Investment",
    accent: "emerald",
    icon: "M3 17l6-6 4 4 8-8v4h2V3h-7v2h4l-7 7-4-4-8 8 2 1z",
  },
  {
    key: "research",
    label: "Market Research",
    short: "Research",
    accent: "amber",
    icon: "M11 4a7 7 0 105.2 11.7l4.55 4.55 1.41-1.41-4.55-4.55A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z",
  },
  {
    key: "compliance",
    label: "Compliance & Legal",
    short: "Compliance",
    accent: "rose",
    icon: "M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm0 2.18L18 6.3V11c0 4.06-2.78 7.77-6 9.09C8.78 18.77 6 15.06 6 11V6.3l6-2.12z",
  },
  {
    key: "agent",
    label: "Agent Tools",
    short: "Agent",
    accent: "cyan",
    icon: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  },
  // Cross-industry categories (bridged from /solutions)
  {
    key: "productivity",
    label: "Productivity",
    short: "Productivity",
    accent: "indigo",
    icon: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm1 3h-2v6l4.5 2.7 1-1.6-3.5-2.1V7z",
  },
  {
    key: "finance",
    label: "Finance",
    short: "Finance",
    accent: "green",
    icon: "M3 7a2 2 0 012-2h14a2 2 0 012 2v2h-4a3 3 0 100 6h4v2a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm15 4a1 1 0 100 2h3v-2h-3z",
  },
  {
    key: "hr",
    label: "HR & People",
    short: "HR",
    accent: "pink",
    icon: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.42 0-8 2.24-8 5v3h16v-3c0-2.76-3.58-5-8-5z",
  },
  {
    key: "marketing",
    label: "Marketing",
    short: "Marketing",
    accent: "orange",
    icon: "M3 9v6h3l5 4V5L6 9H3zm13-1a5 5 0 010 8V8zm-3 0a4 4 0 010 8v-1a3 3 0 000-6V8z",
  },
  {
    key: "sales",
    label: "Sales",
    short: "Sales",
    accent: "teal",
    icon: "M3 4h18l-7 9v7l-4-2v-5L3 4zm3.1 2l5 6.5v5l2 1v-6l5-6.5H6.1z",
  },
  {
    key: "legal",
    label: "Legal & Compliance",
    short: "Legal",
    accent: "slate",
    icon: "M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3zm0 2.18L18 6.3V11c0 4.06-2.78 7.77-6 9.09C8.78 18.77 6 15.06 6 11V6.3l6-2.12z",
  },
  {
    key: "data",
    label: "Data & Developer",
    short: "Data",
    accent: "sky",
    icon: "M8 6l-6 6 6 6 1.4-1.4L4.8 12l4.6-4.6L8 6zm8 0l-1.4 1.4L19.2 12l-4.6 4.6L16 18l6-6-6-6z",
  },
  {
    key: "design",
    label: "Design & Creative",
    short: "Design",
    accent: "fuchsia",
    icon: "M12 2a10 10 0 100 20 2 2 0 001.6-3.2c-.4-.5-.4-1.3 0-1.8A2 2 0 0115.2 16H17a5 5 0 005-5 9 9 0 00-10-9z",
  },
  {
    key: "support",
    label: "Support & Ops",
    short: "Support",
    accent: "yellow",
    icon: "M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z",
  },
  {
    key: "growth",
    label: "Growth & Strategy",
    short: "Growth",
    accent: "lime",
    icon: "M3 17l6-6 4 4 8-8v4h2V3h-7v2h4l-7 7-4-4-8 8 2 1z",
  },
  {
    key: "content",
    label: "Writing & Content",
    short: "Content",
    accent: "violet",
    icon: "M4 20v-3.5l9.5-9.5 3.5 3.5L7.5 20H4z",
  },
  {
    key: "crm",
    label: "CRM & Sales Ops",
    short: "CRM",
    accent: "red",
    icon: "M3 4h18v2H3V4zm1 4h4v12H4V8zm6 0h4v8h-4V8zm6 0h4v10h-4V8z",
  },
  {
    key: "files",
    label: "Files",
    short: "Files",
    accent: "stone",
    icon: "M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V8h4.5L13 3.5z",
  },
];

export const TOOLS: ToolItem[] = [
  // Analysis & Intelligence
  { slug: "investment-advisor", title: "AI Investment Advisor", description: "Answer five questions and get a shortlist of areas, property types, and deals that fit your budget, risk appetite, and target yield.", category: "intelligence", topRated: true, icon: "compass", app: () => import("../investment-advisor/_app").then((m) => ({ default: m.default })) },
  { slug: "property-valuation", title: "AI Property Valuation", description: "Find out what any property is actually worth — with confidence intervals and a full breakdown of how the number was reached.", category: "intelligence", topRated: true, icon: "home", app: () => import("../property-valuation/_app").then((m) => ({ default: m.default })) },
  { slug: "deal-scoring", title: "Deal Scoring Engine", description: "Paste a listing and know in seconds if it's a steal, fair value, or overpriced — scored 0-100 on yield, valuation, and risk.", category: "intelligence", topRated: true, icon: "target", app: () => import("../deal-scoring/_app").then((m) => ({ default: m.default })) },
  { slug: "market-pulse", title: "Market Pulse Dashboard", description: "See where money is flowing right now — transaction volumes, price trends, top-performing areas, and supply pipeline through 2028.", category: "intelligence", topRated: true, icon: "pulse", app: () => import("../market-pulse/_app").then((m) => ({ default: m.default })) },

  // Calculators
  { slug: "mortgage-calculator", title: "Mortgage Calculator", description: "Know your exact monthly payment across 10 UAE banks, stress-test at higher rates, and see LTV rules for your residency status — before you walk into a showroom.", category: "calculators", topRated: true, icon: "calculator", app: () => import("../mortgage-calculator/_app").then((m) => ({ default: m.default })) },
  { slug: "roi-calculator", title: "ROI Calculator", description: "See your actual return after all costs — not the inflated number the brochure shows you. Factors in every expense most calculators ignore.", category: "calculators", topRated: true, icon: "trending", app: () => import("../roi-calculator/_app").then((m) => ({ default: m.default })) },
  { slug: "dld-fee-calculator", title: "DLD Fee Calculator", description: "Stop getting surprised at closing. Every DLD fee calculated to the fils — including the hidden costs most buyers only discover too late.", category: "calculators", icon: "receipt", app: () => import("../dld-fee-calculator/_app").then((m) => ({ default: m.default })) },
  { slug: "commission-calculator", title: "Commission Calculator", description: "Know exactly what you'll take home from any deal — after splits, VAT, and agency fees. No more napkin math.", category: "calculators", icon: "percent", app: () => import("../commission-calculator/_app").then((m) => ({ default: m.default })) },
  { slug: "affordability", title: "What Can I Afford?", description: "Find out the maximum property you can buy under UAE Central Bank rules — with DBR caps, LTV limits, and a rate-stress buffer built in.", category: "calculators", icon: "wallet", app: () => import("../affordability/_app").then((m) => ({ default: m.default })) },

  // Investment Tools
  { slug: "rent-vs-buy", title: "Rent vs Buy Calculator", description: "Get the real answer for UAE — factoring in zero income tax, RERA rent caps, Golden Visa eligibility, and opportunity cost. See your exact breakeven year.", category: "investment", topRated: true, icon: "scale", app: () => import("../rent-vs-buy/_app").then((m) => ({ default: m.default })) },
  { slug: "offplan-analyzer", title: "Off-Plan Payment Analyzer", description: "Compare up to 3 developer payment plans side-by-side. See which 60/40, 1% monthly, or post-handover structure actually costs you less in real terms.", category: "investment", topRated: true, icon: "building", app: () => import("../offplan-analyzer/_app").then((m) => ({ default: m.default })) },
  { slug: "cash-flow-modeler", title: "Cash Flow Modeler", description: "See whether a property will actually put money in your pocket each month — modeled over 1-30 years with vacancy, rent growth, and every real cost.", category: "investment", icon: "refresh", app: () => import("../cash-flow-modeler/_app").then((m) => ({ default: m.default })) },
  { slug: "portfolio-tracker", title: "Portfolio Tracker", description: "See your entire portfolio's performance in one view — aggregate yield, equity, cash flow, and where your allocation is out of balance.", category: "investment", icon: "portfolio", app: () => import("../portfolio-tracker/_app").then((m) => ({ default: m.default })) },
  { slug: "investment-simulator", title: "Investment Simulator", description: "What if you'd bought in 2020? See actual returns based on real historical price data — and how much you left on the table by waiting.", category: "investment", icon: "clock", app: () => import("../investment-simulator/_app").then((m) => ({ default: m.default })) },
  { slug: "golden-visa-checker", title: "Golden Visa Checker", description: "Find out if your property qualifies you for a 10-year UAE Golden Visa — instant eligibility check with the exact documents you need.", category: "investment", icon: "passport", app: () => import("../golden-visa-checker/_app").then((m) => ({ default: m.default })) },

  // Market Research
  { slug: "tenant-screening", title: "Tenant Screening Score", description: "Know before you buy whether tenants will line up or you'll sit vacant. Demand scoring, optimal rent pricing, and vacancy risk across 15 areas.", category: "research", icon: "users", app: () => import("../tenant-screening/_app").then((m) => ({ default: m.default })) },
  { slug: "neighborhood-report", title: "Neighborhood Quality Report", description: "Get the honest picture of any community before you commit — scored across six categories with a downloadable PDF you can share with clients.", category: "research", topRated: true, icon: "pin", app: () => import("../neighborhood-report/_app").then((m) => ({ default: m.default })) },
  { slug: "yield-heatmap", title: "Rental Yield Heatmap", description: "Stop guessing where yields are highest. Click any zone on the map and see exactly what landlords are earning there.", category: "research", topRated: true, icon: "grid", app: () => import("../yield-heatmap/_app").then((m) => ({ default: m.default })) },
  { slug: "area-comparison", title: "Area Comparison", description: "Can't decide between areas? Compare 2-3 side-by-side on price, yield, schools, commute, and 20+ metrics that actually matter.", category: "research", icon: "compare", app: () => import("../area-comparison/_app").then((m) => ({ default: m.default })) },
  { slug: "property-comparison", title: "Property Comparison", description: "Shortlisted a few units? Compare up to 4 side-by-side — the tool highlights the winner on every metric so the decision makes itself.", category: "research", icon: "copy", app: () => import("../property-comparison/_app").then((m) => ({ default: m.default })) },
  { slug: "service-charge-comparison", title: "Service Charge Comparison", description: "Stop overpaying — see how your building's service charges stack up against 60+ communities. The real cost of ownership is here.", category: "research", icon: "receipt", app: () => import("../service-charge-comparison/_app").then((m) => ({ default: m.default })) },
  { slug: "developer-track-record", title: "Developer Track Record", description: "Know which developers deliver on time and which ones don't — scored on delivery history, build quality, and price appreciation across 30+ names.", category: "research", icon: "trophy", app: () => import("../developer-track-record/_app").then((m) => ({ default: m.default })) },
  { slug: "developer-pipeline", title: "Developer Pipeline Tracker", description: "Track what's being built, what's delayed, and what's on schedule. Construction progress, handover timelines, and reliability scores for 25+ projects.", category: "research", icon: "flow", app: () => import("../developer-pipeline/_app").then((m) => ({ default: m.default })) },
  { slug: "global-market-comparison", title: "Global Market Comparison", description: "See how any market stacks up globally. Price indices, affordability, GDP, inflation, and FDI across 60+ countries — sourced from BIS, OECD, and World Bank.", category: "research", topRated: true, icon: "globe", app: () => import("../global-market-comparison/_app").then((m) => ({ default: m.default })) },

  // Compliance & Legal
  { slug: "regulation-monitor", title: "Regulation Monitor", description: "Never get blindsided by a regulation change. Every RERA, DLD, visa, tax, and mortgage rule — filterable with impact analysis so you know what it means for your deals.", category: "compliance", icon: "shield", app: () => import("../regulation-monitor/_app").then((m) => ({ default: m.default })) },
  { slug: "due-diligence", title: "Due Diligence Checklist", description: "Don't skip a step that costs you later. A dynamic checklist of every legal, financial, and physical check for your property type — with why each one matters.", category: "compliance", icon: "clipboard", app: () => import("../due-diligence/_app").then((m) => ({ default: m.default })) },

  // Agent Tools
  { slug: "sales-offer-generator", title: "Sales Offer Generator", description: "Stop spending 30 minutes formatting offers. Input the deal details and get a structured, ready-to-send sales offer in seconds.", category: "agent", topRated: true, icon: "document", app: () => import("../sales-offer-generator/_app").then((m) => ({ default: m.default })) },
  { slug: "poster-creator", title: "Poster Creator", description: "Generate posters for any industry — real estate, fashion, food, services and more. Industry-keyed templates, drag photos in, download in high res.", category: "agent", topRated: true, icon: "image", app: () => import("../poster-creator/_app").then((m) => ({ default: m.default })) },
  { slug: "whatsapp", title: "WhatsApp Inbox", description: "Pair your shop number once. Reply to every customer from one inbox, blast price updates to saved lists, manage groups — all metered to stay under WhatsApp's ban threshold.", category: "agent", topRated: true, icon: "message", defaultSize: { w: 1080, h: 720 }, app: () => import("../whatsapp/_app").then((m) => ({ default: m.default })) },

  /* ────────────────────────────────────────────────────────────────────────
   *  Cross-industry tools (mirrored from /solutions/_data/tools.ts)
   *  Every entry sets `route` to `/solutions/tools/<slug>` so the workspace
   *  Window iframe loads the canonical page living under /solutions.
   * ──────────────────────────────────────────────────────────────────────── */

  // Productivity
  { slug: "team-schedule", title: "Team Schedule & Timezones", description: "World clock for up to 12 cities + 5-zone business-hours overlap finder + on-call rotation builder with ICS export + meeting-cost ticker. Four scheduling utilities, one window.", category: "productivity", icon: "clock", topRated: true, app: () => import("../../solutions/tools/team-schedule/_app").then((m) => ({ default: m.default })) },
  { slug: "project-estimator", title: "Project Estimator", description: "Break work into tasks, apply hour estimates and rates, buffer for risk — get a defensible quote.", category: "productivity", icon: "calculator", route: "/solutions/tools/project-estimator" },
  { slug: "eisenhower-matrix", title: "Eisenhower Matrix", description: "Score tasks on urgency and importance. Auto-sort into Do, Schedule, Delegate, Drop. Saves to your browser.", category: "productivity", icon: "grid", route: "/solutions/tools/eisenhower-matrix" },
  { slug: "sop-builder", title: "SOP Builder", description: "Write standard operating procedures with steps, owners, rollback plans, and success criteria. Copy as markdown or print.", category: "productivity", icon: "clipboard", route: "/solutions/tools/sop-builder" },
  { slug: "okr-tracker", title: "OKR Tracker", description: "Track objectives and key results by quarter. Auto-computes progress against targets. Exports to JSON.", category: "productivity", icon: "target", route: "/solutions/tools/okr-tracker" },
  { slug: "timesheet-summarizer", title: "Timesheet Summarizer", description: "Paste CSV or enter entries. Get totals by project, day, and week, plus utilization % and overtime flags. Stays in your browser.", category: "productivity", icon: "clock", route: "/solutions/tools/timesheet-summarizer" },
  { slug: "scrum-velocity", title: "Scrum Velocity Tracker", description: "Enter past sprints to compute average velocity, variance, trend, and a predicted range for your next sprint.", category: "productivity", icon: "chart", route: "/solutions/tools/scrum-velocity" },
  { slug: "planning-poker", title: "Planning Poker Estimator", description: "Collect Fibonacci estimates from up to 8 team members. Computes consensus, spread, and flags stories that need discussion.", category: "productivity", icon: "users", route: "/solutions/tools/planning-poker", app: () => import("../../solutions/tools/planning-poker/_app").then((m) => ({ default: m.default })) },
  { slug: "okr-dashboard", title: "OKR Dashboard", description: "Team-aware OKR tracker. Objectives, key results, quarterly progress, and a per-KR update log. Personal mode stays in your browser; team mode syncs across the workspace.", category: "productivity", icon: "dashboard", route: "/solutions/tools/okr-dashboard" },

  // Finance
  { slug: "finance-calculators", title: "Finance Calculators", description: "Loan / EMI amortization + compound-interest growth modeling + Rule-of-40 SaaS score with peer benchmarks + Quick Ratio / NRR / GRR. Four ratio calculators, one window.", category: "finance", icon: "calculator", topRated: true, app: () => import("../../solutions/tools/finance-calculators/_app").then((m) => ({ default: m.default })) },
  { slug: "break-even", title: "Break-even Analysis", description: "Plug in fixed costs, variable costs, and price. Know exactly how many units you need to sell to stop losing money.", category: "finance", icon: "scale", route: "/solutions/tools/break-even" },
  { slug: "salary-hourly", title: "Salary to Hourly Converter", description: "Convert between annual salary, monthly pay, and hourly rate. Accounts for vacation days and hours worked per week.", category: "finance", icon: "refresh", route: "/solutions/tools/salary-hourly" },
  { slug: "savings-goal-planner", title: "Savings Goal Planner", description: "Project how long it takes to hit a savings target given starting balance, monthly contributions, and expected return — with a contributions-vs-interest chart.", category: "finance", icon: "wallet", route: "/solutions/tools/savings-goal-planner" },
  { slug: "debt-payoff", title: "Debt Payoff — Snowball vs Avalanche", description: "Line up all your debts and compare snowball vs avalanche strategies. Payoff dates, total interest, and interest saved side-by-side.", category: "finance", icon: "compare", route: "/solutions/tools/debt-payoff" },
  { slug: "tax-bracket-calculator", title: "US Federal Tax Brackets (2025)", description: "2025 IRS brackets for single, MFJ, MFS, and HOH. See marginal rate, effective rate, and per-bracket tax — not for filing, just for planning.", category: "finance", icon: "percent", route: "/solutions/tools/tax-bracket-calculator" },
  { slug: "mortgage-refi", title: "Mortgage Refinance Calculator", description: "Current loan vs refinance offer: new payment, monthly savings, break-even months, lifetime savings, and a should-you-do-it verdict.", category: "finance", icon: "refresh", route: "/solutions/tools/mortgage-refi" },
  { slug: "npv-irr", title: "NPV & IRR Calculator", description: "DCF calculator with NPV at a hurdle rate, IRR via Newton's method, payback period, and profitability index. Add or remove years of cash flow.", category: "finance", icon: "chart", route: "/solutions/tools/npv-irr" },
  { slug: "cash-burn-runway", title: "Cash Burn & Runway", description: "Net burn, runway in months, zero-cash date, and a 24-month cash curve with revenue-growth scenarios. The startup survival dashboard.", category: "finance", icon: "pulse", route: "/solutions/tools/cash-burn-runway" },
  { slug: "gross-to-net-salary", title: "Gross-to-Net Salary", description: "Estimate take-home pay across US, UK, UAE, and Spain. Breakdown by tax type with per-country assumptions — simplified but honest.", category: "finance", icon: "wallet", route: "/solutions/tools/gross-to-net-salary" },
  { slug: "crypto-pnl-tracker", title: "Crypto P/L Tracker (FIFO)", description: "Log buys and sells, enter current prices, get realized + unrealized P/L per symbol using FIFO cost basis. No API calls, data stays in-browser.", category: "finance", icon: "portfolio", route: "/solutions/tools/crypto-pnl-tracker" },
  { slug: "cohort-analytics", title: "Cohort & Retention Analytics", description: "CSV-driven cohort retention heatmap up to 12 months + 24-month ARR projection from cohorts + AARRR pirate-metrics funnel tracker. Three retention/growth analyzers, one window.", category: "growth", icon: "trending", topRated: true, app: () => import("../../solutions/tools/cohort-analytics/_app").then((m) => ({ default: m.default })) },
  { slug: "runway-scenarios", title: "Runway Scenarios", description: "Three-scenario cash model — base / best / worst. Months of runway per scenario, a cash-curve chart, and a cost-cut decision trigger.", category: "finance", icon: "pulse", route: "/solutions/tools/runway-scenarios" },
  { slug: "venture-dilution-modeler", title: "Venture Dilution Modeler", description: "Post-round cap table with pre- or post-money option pool. Per-shareholder dilution, price per share, and the pool-shuffle effect.", category: "finance", icon: "portfolio", route: "/solutions/tools/venture-dilution-modeler" },
  { slug: "discounted-cash-flow", title: "Discounted Cash Flow (DCF)", description: "5-year DCF with terminal value, PV by year, equity value, per-share value, and a WACC × terminal growth sensitivity grid.", category: "finance", icon: "trending", route: "/solutions/tools/discounted-cash-flow" },
  { slug: "subscription-ltv-advanced", title: "Advanced Subscription LTV", description: "Discounted LTV over 60 months with expansion, contraction, churn, margin, and annual discount. Contribution by year plus churn sensitivity.", category: "finance", icon: "portfolio", route: "/solutions/tools/subscription-ltv-advanced" },

  // HR & People
  { slug: "cost-per-hire", title: "Cost-per-Hire Calculator", description: "Sum internal + external hiring costs divided by hires. Benchmark your recruitment spend honestly.", category: "hr", icon: "calculator", route: "/solutions/tools/cost-per-hire" },
  { slug: "turnover-rate", title: "Employee Turnover Rate", description: "Compute annualized turnover rate and annual cost of churn based on average tenure and replacement cost.", category: "hr", icon: "users", route: "/solutions/tools/turnover-rate" },
  { slug: "compa-ratio", title: "Compa-Ratio Calculator", description: "Compare salaries against market midpoint. Single-employee view plus bulk CSV for distribution analysis and band placement.", category: "hr", icon: "scale", route: "/solutions/tools/compa-ratio" },
  { slug: "pto-accrual", title: "PTO Accrual Tracker", description: "Project PTO, sick, and personal leave balances. See year-end totals, cap-hit date, and forfeiture risk across multiple balance types.", category: "hr", icon: "clock", route: "/solutions/tools/pto-accrual" },
  { slug: "360-review-template", title: "360 Review Template", description: "Printable 360 review forms with behavioral-anchored rating scales and relationship-specific prompts. Copy as markdown or print.", category: "hr", icon: "clipboard", route: "/solutions/tools/360-review-template" },
  { slug: "onboarding-checklist", title: "Onboarding Checklist", description: "Role-based onboarding plans grouped into Day 0, Week 1, Month 1, Quarter 1. Progress tracking, markdown and CSV export.", category: "hr", icon: "list", route: "/solutions/tools/onboarding-checklist" },
  { slug: "salary-benchmark", title: "Salary Benchmark", description: "Compare role salaries across US, UK, UAE, and EU markets. Illustrative midpoints for 10 common tech and business roles.", category: "hr", icon: "compare", route: "/solutions/tools/salary-benchmark" },

  // Marketing
  { slug: "cac-ltv", title: "CAC / LTV Calculator", description: "Customer acquisition cost, lifetime value, payback period, and the LTV:CAC ratio that tells you if you have a business.", category: "marketing", icon: "calculator", route: "/solutions/tools/cac-ltv" },
  { slug: "ab-test-sample-size", title: "A/B Test Sample Size", description: "Calculate required sample size per variant for a given baseline rate, minimum detectable effect, and confidence.", category: "marketing", icon: "chart", route: "/solutions/tools/ab-test-sample-size" },
  { slug: "email-roi", title: "Email Campaign ROI", description: "Project revenue, profit, and ROI from a single email send. Tune list size, open / click / conversion rates, AOV, and send cost.", category: "marketing", icon: "mail", route: "/solutions/tools/email-roi" },
  { slug: "keyword-difficulty", title: "Keyword Difficulty Estimator", description: "Score a target keyword 0-100 using competitor DR, content length, backlinks, and intent match. Tells you go / hard / skip.", category: "marketing", icon: "target", route: "/solutions/tools/keyword-difficulty" },
  { slug: "engagement-rate", title: "Social Engagement Rate", description: "Platform-aware engagement rate for IG, X, LinkedIn, TikTok, and YouTube — with 2026 benchmarks baked in.", category: "marketing", icon: "pulse", route: "/solutions/tools/engagement-rate" },
  { slug: "ad-budget-allocator", title: "Ad Budget Allocator", description: "Distribute a paid budget across Google, Meta, LinkedIn, TikTok, and YouTube by marginal conversions. Proposed splits with a bar chart.", category: "marketing", icon: "percent", route: "/solutions/tools/ad-budget-allocator" },
  { slug: "influencer-roi", title: "Influencer ROI Calculator", description: "Model reach, clicks, conversions, and revenue for an influencer deal. CPM, cost-per-engagement, and a sensitivity table.", category: "marketing", icon: "megaphone", route: "/solutions/tools/influencer-roi" },

  // Sales
  { slug: "pipeline-forecast", title: "Pipeline Forecast", description: "Weight deals by stage probability and expected close date. Monthly weighted forecast, unweighted pipeline, and edit-in-place deal list.", category: "sales", icon: "funnel", route: "/solutions/tools/pipeline-forecast" },
  { slug: "commission-calc", title: "Commission Calculator (SaaS)", description: "Tiered commission, SPIFs, and accelerators. Presets for SaaS ramp, enterprise AE, and BDR. Effective rate + payout breakdown.", category: "sales", icon: "percent", route: "/solutions/tools/commission-calc" },
  { slug: "lead-scoring-rubric", title: "Lead Scoring Rubric", description: "Build a weighted rubric across firmographic + behavioral attributes. Score a lead 0-100 and label it hot / warm / cold. Export as JSON.", category: "sales", icon: "target", route: "/solutions/tools/lead-scoring-rubric" },
  { slug: "quote-builder", title: "Sales Quote Builder", description: "Line-item quotes with discounts, expiration, and terms. Save named quotes in-browser. Print or save as PDF.", category: "sales", icon: "document", route: "/solutions/tools/quote-builder" },
  { slug: "pipeline-dashboard", title: "Pipeline Dashboard", description: "Team-aware weighted sales pipeline. Deal ownership, stage filters, monthly weighted forecast. Personal mode is local; team mode shares deals across the workspace.", category: "sales", icon: "dashboard", route: "/solutions/tools/pipeline-dashboard" },

  // Legal / Compliance
  { slug: "invoice-generator", title: "Invoice Generator", description: "Fill a form, preview the invoice, print or save as PDF via the browser. No accounts, no watermarks.", category: "legal", icon: "receipt", route: "/solutions/tools/invoice-generator", app: () => import("../../solutions/tools/invoice-generator/_app").then((m) => ({ default: m.default })) },
  { slug: "nda-generator", title: "NDA Generator", description: "Generate a printable mutual or one-way NDA for up to 3 parties. Pick the jurisdiction, term, and effective date — the boilerplate reads like a human wrote it.", category: "legal", icon: "document", route: "/solutions/tools/nda-generator" },
  { slug: "contract-risk-checker", title: "Contract Risk Checker", description: "Paste a contract and get a quick scan for risky clauses — unlimited liability, auto-renewal, broad indemnification, perpetual licenses, and more. Runs locally.", category: "legal", icon: "shield", route: "/solutions/tools/contract-risk-checker" },
  { slug: "consent-form-generator", title: "GDPR Consent Form Generator", description: "Build a compliant consent form: controller, purpose, data categories, legal basis, retention, transfers. Copy or print.", category: "legal", icon: "clipboard", route: "/solutions/tools/consent-form-generator" },
  { slug: "termination-letter-generator", title: "Termination Letter Generator", description: "Draft an employment termination letter with severance, benefits end date, and return-property reminders. Tone variants for formal, compassionate, or direct.", category: "legal", icon: "document", route: "/solutions/tools/termination-letter-generator" },

  // Data & Developer
  { slug: "format-converters", title: "Format Converters", description: "All-in-one developer toolkit: Base64 / URL encode + parse / JWT decode + verify / MD5+SHA hash / QR code generate. Five tools, one window, one set of inputs.", category: "data", icon: "code", topRated: true, app: () => import("../../solutions/tools/format-converters/_app").then((m) => ({ default: m.default })) },
  { slug: "json-formatter", title: "JSON Formatter & Validator", description: "Pretty-print, minify, and validate JSON. Identifies the exact line and column of any syntax error.", category: "data", icon: "code", route: "/solutions/tools/json-formatter" },
  { slug: "csv-json-converter", title: "CSV ↔ JSON Converter", description: "Paste CSV or JSON and convert to the other. Configurable delimiter, header detection, escaping, and row count — runs entirely in your browser.", category: "data", icon: "refresh", route: "/solutions/tools/csv-json-converter" },
  { slug: "regex-tester", title: "Regex Tester", description: "Pattern + flags with live match highlighting, capture groups table, and replacement preview. Recent expressions saved in your browser.", category: "data", icon: "code", route: "/solutions/tools/regex-tester" },
  { slug: "id-generator", title: "ID Generator", description: "Generate UUID v4, nanoid (6-32 chars), slugs, and short ULIDs. Batch 1-100 at a time with one-click copy.", category: "data", icon: "hash", route: "/solutions/tools/id-generator" },
  { slug: "markdown-preview", title: "Markdown Preview", description: "Live split-pane markdown editor. GFM tables, checkboxes, strikethrough, code blocks. Copy HTML, download .md, autosaves locally.", category: "data", icon: "note", route: "/solutions/tools/markdown-preview" },
  { slug: "cron-expression-parser", title: "Cron Expression Parser", description: "Parse 5- or 6-field cron, translate to English, and see the next 5 runs in your timezone. Common-pattern presets built in.", category: "data", icon: "clock", route: "/solutions/tools/cron-expression-parser" },
  { slug: "metrics-dashboard", title: "Metrics Dashboard", description: "Team-aware KPI tracker. Define up to 12 metrics with targets, log values over time, sparklines per metric, alerts for 3+ periods off-target. Shared in team mode.", category: "data", icon: "dashboard", route: "/solutions/tools/metrics-dashboard" },

  // Design & Creative
  { slug: "color-palette-extractor", title: "Color Palette Extractor", description: "Upload an image and extract 3-16 dominant colors via k-means. Export as CSS variables, Tailwind config, or JSON. Runs on canvas, client-side.", category: "design", icon: "palette", route: "/solutions/tools/color-palette-extractor" },
  { slug: "contrast-checker", title: "Contrast Checker", description: "WCAG AA / AAA contrast ratio for normal text, large text, and UI components. Live sample preview and a lightness slider to find the nearest passing shade.", category: "design", icon: "scale", route: "/solutions/tools/contrast-checker" },
  { slug: "font-pairing", title: "Font Pairing", description: "Pick a heading font from 30 curated Google Fonts and get 3-5 body pairings with reasoning. Live preview plus copy-ready <link> + CSS.", category: "design", icon: "pen", route: "/solutions/tools/font-pairing" },

  // Support & Ops
  { slug: "sla-calculator", title: "SLA Calculator", description: "Service level math. Pick an uptime target and a measurement window — see allowed downtime, or enter actual downtime and find out if you breached.", category: "support", icon: "shield", route: "/solutions/tools/sla-calculator" },
  { slug: "incident-postmortem-template", title: "Incident Postmortem Template", description: "Structured PIR generator. Severity, timeline, impact, root cause, action items, lessons — exports as markdown or prints for the all-hands.", category: "support", icon: "clipboard", route: "/solutions/tools/incident-postmortem-template" },
  { slug: "ticket-backlog-tracker", title: "Ticket Backlog Tracker", description: "Quick pipeline visibility for support tickets. P0–P3, status, assignee, age. Flags stale tickets by priority. Shared in team mode — not a full bug tracker.", category: "support", icon: "list", route: "/solutions/tools/ticket-backlog-tracker" },
  { slug: "mean-time-to-resolution", title: "Mean Time to Resolution", description: "Paste an incident CSV. Computes MTTR per severity, MTBF, incident frequency, month-over-month trend, and outliers.", category: "support", icon: "clock", route: "/solutions/tools/mean-time-to-resolution" },
  { slug: "status-page-generator", title: "Status Page Generator", description: "Build a branded status page. Service states, uptime %, recent incidents — exports as a self-contained HTML file you can host anywhere.", category: "support", icon: "pulse", route: "/solutions/tools/status-page-generator" },
  { slug: "runbook-builder", title: "Runbook Builder", description: "Structured incident runbooks. Trigger, check steps, mitigation, escalation path, rollback, acceptance. Templates for database failover, restarts, payment outages.", category: "support", icon: "clipboard", route: "/solutions/tools/runbook-builder" },
  { slug: "capacity-planner", title: "Capacity Planner", description: "Infra capacity math. Current load, monthly growth, headroom target — get projected load at 3/6/12 months and the timeline to your ceiling.", category: "support", icon: "chart", route: "/solutions/tools/capacity-planner" },
  { slug: "uptime-cost-calculator", title: "Uptime Cost Calculator", description: "Cost-of-downtime estimator. Revenue-per-minute, affected users, surge cost, reputational multiplier. Compare annual cost at current SLA vs the next tier up.", category: "support", icon: "calculator", route: "/solutions/tools/uptime-cost-calculator" },
  { slug: "kpi-dashboard", title: "Support KPI Dashboard", description: "Track first-response time, resolution time, CSAT, NPS, volume, backlog. Sparklines, targets, red/green flags. Shared metric history in team mode.", category: "support", icon: "dashboard", route: "/solutions/tools/kpi-dashboard" },
  { slug: "escalation-matrix", title: "Escalation Matrix", description: "Role-based escalation builder. Per-severity notification lists with timing. Clear matrix showing who gets paged when — print-ready for the war room wall.", category: "support", icon: "flag", route: "/solutions/tools/escalation-matrix" },
  { slug: "support-volume-forecaster", title: "Support Volume Forecaster", description: "12-week ticket volume forecast from historical data + growth rate + event multipliers. Computes required agent headcount and staffing gap.", category: "support", icon: "trending", route: "/solutions/tools/support-volume-forecaster" },

  // Growth & Strategy
  { slug: "pricing-calculator", title: "Pricing Calculator", description: "Design 3–5 pricing tiers with feature checkboxes, monthly + annual rates, and a live comparison matrix. Export as HTML embed or JSON. Team-shared.", category: "growth", icon: "tag", route: "/solutions/tools/pricing-calculator" },
  { slug: "north-star-metric-builder", title: "North Star Metric Builder", description: "Define one north-star metric with input drivers. Set weekly targets, log actuals, compute variance, trend, and correlation with revenue.", category: "growth", icon: "star", route: "/solutions/tools/north-star-metric-builder" },
  { slug: "positioning-canvas", title: "Positioning Canvas", description: "April Dunford-style positioning builder. Six fields generate a positioning statement and tagline. Export markdown, print-ready canvas.", category: "growth", icon: "compass", route: "/solutions/tools/positioning-canvas" },
  { slug: "growth-experiment-tracker", title: "Growth Experiment Tracker", description: "ICE-prioritized experiment backlog. Hypotheses, impact/confidence/ease scoring, status, results, and learnings. Sorted by ICE. Team-shared.", category: "growth", icon: "spark", route: "/solutions/tools/growth-experiment-tracker" },

  // Writing & Content
  { slug: "readability-score", title: "Readability Score", description: "Flesch Reading Ease, Flesch-Kincaid, Gunning Fog, SMOG, ARI, Dale-Chall. Highlights long sentences, complex words, and passive voice.", category: "content", icon: "pen", route: "/solutions/tools/readability-score" },
  { slug: "word-count", title: "Word Count", description: "Real-time character, word, sentence, and paragraph counts. Reading and speaking time. Keyword density top 20 with export.", category: "content", icon: "hash", route: "/solutions/tools/word-count" },
  { slug: "seo-meta-tags", title: "SEO Meta Tags", description: "Generate clean HTML meta tags with Google SERP + Twitter card previews. Warns when title or description exceed recommended length.", category: "content", icon: "tag", route: "/solutions/tools/seo-meta-tags" },
  { slug: "headline-analyzer", title: "Headline Analyzer", description: "Score a headline 0-100 across length, power/emotional words, sentiment, specificity, and numbers. Gives concrete improvement suggestions.", category: "content", icon: "spark", route: "/solutions/tools/headline-analyzer" },
  { slug: "content-brief-builder", title: "Content Brief Builder", description: "Generate a writer-ready brief: title options, H2/H3 outline with word targets per section, meta description draft, markdown export.", category: "content", icon: "note", route: "/solutions/tools/content-brief-builder" },

  // CRM & Sales Ops
  { slug: "crm", title: "CRM", description: "Contacts, companies, deals, leads, inventory — your customizable customer relationship hub. Visibility per record, admin-defined custom fields, and full integration with Files, Documents, Sheets, and Chat.", category: "crm", icon: "users", topRated: true, defaultSize: { w: 1280, h: 800 }, minSize: { w: 720, h: 480 }, app: () => import("../crm/_app").then((m) => ({ default: m.default })) },
  { slug: "deal-pipeline-board", title: "Deal Pipeline Board", description: "Kanban sales pipeline across Prospecting → Qualified → Proposal → Negotiation → Closed. Drag to move stage, totals per column. Team-shared.", category: "crm", icon: "kanban", route: "/solutions/tools/deal-pipeline-board", app: () => import("../../solutions/tools/deal-pipeline-board/_app").then((m) => ({ default: m.default })) },
  { slug: "sales-call-script-builder", title: "Sales Call Script Builder", description: "Structured scripts for discovery, demo, objection handling, and closing calls. Opener, agenda, qualifying questions, value props, next steps. Export markdown.", category: "crm", icon: "message", route: "/solutions/tools/sales-call-script-builder" },
  { slug: "meddpicc-scorecard", title: "MEDDPICC Scorecard", description: "Qualify enterprise deals across Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Pain, Champion, Competition. 0-5 ratings, verdict, export.", category: "crm", icon: "clipboard", route: "/solutions/tools/meddpicc-scorecard" },
  { slug: "bant-qualifier", title: "BANT Qualifier", description: "Quick Budget / Authority / Need / Timeline scorecard for inbound leads. Log multiple leads, get a qualified / nurture / disqualified verdict.", category: "crm", icon: "target", route: "/solutions/tools/bant-qualifier" },
  { slug: "proposal-generator", title: "Proposal Generator", description: "Build a sales proposal with cover, problem, solution, phases, investment line items, next steps, terms. Templates for consulting, SaaS, services. Print-ready.", category: "crm", icon: "document", route: "/solutions/tools/proposal-generator" },
  { slug: "win-loss-analyzer", title: "Win/Loss Analyzer", description: "Structured win/loss reviews per deal: outcome, primary reason, buyer quotes, lessons learned. Rollup of win rate by segment and top loss reasons.", category: "crm", icon: "trophy", route: "/solutions/tools/win-loss-analyzer" },
  { slug: "sdr-cadence-builder", title: "SDR Cadence Builder", description: "Multi-touch outbound sequence designer across email, call, LinkedIn, and video. Visual timeline, preset variants for enterprise, SMB, inbound follow-up.", category: "crm", icon: "flow", route: "/solutions/tools/sdr-cadence-builder" },
  { slug: "churn-risk-calculator", title: "Churn Risk Calculator", description: "Score customer accounts on usage trend, support volume, NPS, renewal proximity, sponsor changes, and payment issues. 0-100 risk with recommended action.", category: "crm", icon: "bell", route: "/solutions/tools/churn-risk-calculator" },
  { slug: "commission-statement", title: "Commission Statement", description: "Per-rep commission statement with deals, SPIFs, and clawbacks. Period quota, attainment, YTD running totals. Matches typical AE comp plan format. Print-ready.", category: "crm", icon: "receipt", route: "/solutions/tools/commission-statement" },

  // Chat — real-time messaging inside the active workspace.
  { slug: "chat", title: "Chat", description: "Real-time messaging within this workspace. Share files and photos that count against the workspace storage cap.", category: "files", icon: "message", route: "/tools/chat", defaultSize: { w: 960, h: 640 }, minSize: { w: 520, h: 420 }, app: () => import("../chat/_app").then((m) => ({ default: m.default })) },

  // (Files Manager retired Round D — every feature now lives inside the
  // system Launchpad: upload, trash, rename, tags, share, preview, and
  // storage bar. The /tools/files-manager route 301s to /.)

  // Documents — Word-style rich-text editor that saves into the workspace.
  { slug: "documents", title: "Documents", description: "Write, edit, and save Word-style documents inside your workspace. Real .docx round-trip, autosave, tables, lists, code, links.", category: "files", icon: "document", defaultSize: { w: 880, h: 640 }, minSize: { w: 480, h: 360 }, app: () => import("../documents/_app").then((m) => ({ default: m.default })) },

  // Sheets — Excel-style spreadsheets with real .xlsx round-trip.
  { slug: "sheets", title: "Sheets", description: "Excel-style spreadsheets in your workspace. Formulas, multiple sheets, conditional formatting. Real .xlsx round-trip — opens in Numbers, Excel, Google Sheets.", category: "files", icon: "grid", defaultSize: { w: 1100, h: 720 }, minSize: { w: 640, h: 420 }, app: () => import("../sheets/_app").then((m) => ({ default: m.default })) },
];

export function toolsByCategory(key: ToolCategoryKey): ToolItem[] {
  return TOOLS.filter((t) => t.category === key);
}

export function toolBySlug(slug: string): ToolItem | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function categoryBySlug(slug: string): ToolCategory | undefined {
  const tool = toolBySlug(slug);
  if (!tool) return undefined;
  return TOOL_CATEGORIES.find((c) => c.key === tool.category);
}

/**
 * Server-only merged catalogue. Returns the static `TOOLS` array plus
 * any admin-registered custom iframe apps from `app_registry`. Existing
 * consumers that import `TOOLS` directly stay back-compat — only callers
 * that switch to `getMergedToolList()` see custom apps.
 *
 * The `_custom-tools` module is gated by `import "server-only"` and
 * pulls the service-role client, so this function MUST only be invoked
 * from server components, route handlers, or server actions. We resolve
 * the loader off `globalThis` at runtime so webpack never wires the
 * server-only module into client chunks (Desktop.tsx imports this file
 * statically).
 */
type CustomToolLoader = () => Promise<ToolItem[]>;

declare global {
  // eslint-disable-next-line no-var
  var __sf_custom_tools_loader: CustomToolLoader | undefined;
}

export function registerCustomToolsLoader(fn: CustomToolLoader): void {
  globalThis.__sf_custom_tools_loader = fn;
}

export async function getMergedToolList(): Promise<ToolItem[]> {
  const loader = globalThis.__sf_custom_tools_loader;
  if (!loader) return TOOLS;
  try {
    const custom = await loader();
    return [...TOOLS, ...custom];
  } catch {
    return TOOLS;
  }
}
