"use client";

/* Launchpad — Finder-style movable window for browsing & launching apps.
 *
 * Replaces the previous fullscreen overlay. The window:
 *   - Renders its own traffic-light title bar + Finder-style toolbar.
 *   - Is movable (drag the title bar) and resizable (8-way edge handles).
 *   - Persists its bounds per-workspace at `ws:<id>:launchpad-bounds-v1`.
 *   - Persists the chosen view per-workspace at `ws:<id>:launchpad-view-v1`.
 *   - Persists Group + Preview toggles per-workspace.
 *   - Opens at 1100×640, min 720×420, max full screen.
 *   - Stays z-stacked beneath modals (z-50) but above regular windows so
 *     it acts like a system finder rather than a tool window.
 *
 * Every sidebar item, toolbar button, and right-click menu in this
 * window is wired to real behavior — see `LaunchpadSidebar`,
 * `LaunchpadToolbar`, `LaunchpadActionMenu`, `LaunchpadGroupMenu`,
 * `LaunchpadFilesPane`, and `LaunchpadAboutDialog` for the moving
 * parts.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TOOL_CATEGORIES, TOOLS, type ToolItem } from "../_data/tools-list";
import { invalidate } from "@/lib/cache/swr";
import {
  setAppDragPayload,
  readAppDragPayload,
  type AppDragPayload,
} from "./appDrag";
import { useRecents } from "./useRecents";
import { useWorkspaces, useWorkspaceKey } from "./useWorkspaces";

import LaunchpadSidebar from "./launchpad/LaunchpadSidebar";
import LaunchpadToolbar from "./launchpad/LaunchpadToolbar";
import AgentChatScope from "./agent/AgentChatScope";
import LaunchpadStatusBar from "./launchpad/LaunchpadStatusBar";
import { useIsMobile } from "./useIsMobile";
import LaunchpadIconView from "./launchpad/LaunchpadIconView";
import LaunchpadListView from "./launchpad/LaunchpadListView";
import LaunchpadColumnView from "./launchpad/LaunchpadColumnView";
import LaunchpadGalleryView from "./launchpad/LaunchpadGalleryView";
import LaunchpadActionMenu from "./launchpad/LaunchpadActionMenu";
import LaunchpadGroupMenu from "./launchpad/LaunchpadGroupMenu";
import LaunchpadAboutDialog from "./launchpad/LaunchpadAboutDialog";
import LaunchpadFilesPane from "./launchpad/LaunchpadFilesPane";
import LaunchpadSharedPane from "./launchpad/LaunchpadSharedPane";
import LaunchpadTrashView from "./launchpad/LaunchpadTrashView";
import LaunchpadStorageBar from "./launchpad/LaunchpadStorageBar";
import LaunchpadUploadToast from "./launchpad/LaunchpadUploadToast";
import LaunchpadPreviewOverlay from "./launchpad/LaunchpadPreviewOverlay";
import LaunchpadRenameDialog from "./launchpad/LaunchpadRenameDialog";
import LaunchpadTagEditor, {
  type FileTag,
} from "./launchpad/LaunchpadTagEditor";
import LaunchpadShareDialog from "./launchpad/ShareDialog";
import { useFileUploads } from "./launchpad/useFileUploads";
import { cachedFetch } from "@/lib/cache/swr";
import {
  SHARES_PREFIX,
  type LaunchpadShareMeta,
} from "./launchpad/launchpadShares";
import LaunchpadHomeView from "./launchpad/LaunchpadHomeView";
import {
  useLaunchpadFavorites,
  FAVORITES_PREFIX,
} from "./launchpad/LaunchpadFavorites";
import {
  appForFile,
  fileKind,
  fmtSize,
  FILE_LIST_PREFIX,
  STORAGE_STATS_PREFIX,
  type LaunchpadFile,
  type LaunchpadFileKind,
} from "./launchpad/launchpadFiles";
import {
  useLaunchpadView,
  type LaunchpadGroupMode,
  type LaunchpadLocation,
  locationKey,
  locationTitle,
} from "./launchpad/useLaunchpadView";
import AppIcon, { hasAppIcon } from "./AppIcon";

/**
 * Optional opening intent — fed through the desktop's openApp() call when
 * other tools want to "Reveal" a file inside the Launchpad. We resolve it
 * once per opening (each new `intentKey` re-applies) so callers can
 * re-trigger the same intent without re-mounting the component.
 *
 *   { kind: "home", fileId } → jump to Home and focus the file
 *   { kind: "trash" }        → jump to Trash
 *   { kind: "applications" } → default Applications view (also the no-op)
 *
 * Historical note: replaces the standalone Files Manager tool which used
 * to handle these intents via openApp("files-manager", { fileId }).
 */
export type LaunchpadIntent =
  | { kind: "home"; fileId?: string }
  | { kind: "trash" }
  | { kind: "applications" };

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenTool: (
    slug: string,
    title: string,
    params?: Record<string, unknown>
  ) => void;
  onUninstall?: (slug: string) => void;
  onStore?: () => void;
  /** Restrict to these tools (the installed set). When omitted, all
   * tools are visible (used by App Store / first-launch). */
  items?: ToolItem[];
  /** Cross-zone drop hook (drag from Dock or Home onto Launchpad). */
  onAppDroppedOnLaunchpad?: (payload: AppDragPayload) => void;
  /** Optional: open the workspace switcher (used by the toolbar's
   * "Connect" button). */
  onConnect?: () => void;
  /** Toggle a slug in the user's pinned-dock list. Wired through from
   * the desktop's `useDockOrder`. */
  onTogglePin?: (slug: string) => void;
  /** True when the slug is currently pinned to the dock. Used to flip
   * the right-click "Pin to Dock" item to "Unpin from Dock". */
  isPinned?: (slug: string) => boolean;
  /** Optional initial intent applied when `open` flips true (or `intentKey`
   * changes). See LaunchpadIntent. */
  intent?: LaunchpadIntent;
  /** Bumped by the caller every time it wants to re-apply `intent`. */
  intentKey?: number;
}

const TOPBAR = 32;
const MIN_W = 720;
const MIN_H = 420;
const DEFAULT_W = 1100;
const DEFAULT_H = 640;
const BOUNDS_SUFFIX = "launchpad-bounds-v1";

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ItemContextMenu {
  kind: "tool";
  tool: ToolItem;
  x: number;
  y: number;
}

interface FileContextMenu {
  kind: "file";
  file: LaunchpadFile;
  x: number;
  y: number;
}

interface SharedFileContextMenu {
  kind: "shared-file";
  file: LaunchpadFile;
  share: LaunchpadShareMeta;
  x: number;
  y: number;
}

type ContextMenuState =
  | ItemContextMenu
  | FileContextMenu
  | SharedFileContextMenu
  | null;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(v, hi));
}

function defaultBounds(): Bounds {
  if (typeof window === "undefined") {
    return { x: 80, y: 80, w: DEFAULT_W, h: DEFAULT_H };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(DEFAULT_W, vw - 32);
  const h = Math.min(DEFAULT_H, vh - TOPBAR - 32);
  return {
    x: Math.max(16, Math.round((vw - w) / 2)),
    y: Math.max(TOPBAR + 16, Math.round((vh - h) / 2)),
    w,
    h,
  };
}

export default function Launchpad({
  open,
  onClose,
  onOpenTool,
  onUninstall,
  onStore,
  items,
  onAppDroppedOnLaunchpad,
  onConnect,
  onTogglePin,
  isPinned,
  intent,
  intentKey,
}: Props) {
  const BOUNDS_KEY = useWorkspaceKey(BOUNDS_SUFFIX);
  const { workspaces, activeId, switchWorkspace } = useWorkspaces();
  const { recents } = useRecents();
  const launchpadView = useLaunchpadView();
  const favoritesState = useLaunchpadFavorites(activeId);
  const isMobile = useIsMobile();
  /* Mobile-only: drawer holds the sidebar (Locations + Favorites). It's
   * closed by default when the Launchpad opens so the user lands on
   * content. The toolbar's hamburger toggles it; tapping a row closes
   * it. The desktop layout never uses this state. */
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  /* Mobile-only: expandable search bar — collapsed by default so the
   * toolbar stays compact. */
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [bounds, setBounds] = useState<Bounds>(defaultBounds);
  const [maximized, setMaximized] = useState(false);
  const [prevBounds, setPrevBounds] = useState<Bounds | null>(null);
  const [q, setQ] = useState("");
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  /* Files cache so the right-click "Reveal" / "Delete" handlers can
   * resolve the focused file by id without prop-drilling through every
   * pane. Keyed by file id. */
  const fileCacheRef = useRef<Map<string, LaunchpadFile>>(new Map());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Upload + preview + per-file dialog state. The preview overlay,
   * rename dialog, tag editor, and share dialog all key off a single
   * file id at a time. The fileInputRef drives the toolbar's "+ Upload"
   * button and is wired to the same useFileUploads hook the Files
   * Manager runs on. */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [tagFileId, setTagFileId] = useState<string | null>(null);
  const [shareFileId, setShareFileId] = useState<string | null>(null);

  /* Storage cap/used — read once via cachedFetch and bumped after each
   * successful upload. The shared upload hook needs both to enforce the
   * client-side pre-flight against quota. */
  const [cap, setCap] = useState<number>(0);
  const [used, setUsed] = useState<number>(0);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      try {
        // The route returns `cap` and `used` as flat top-level numbers
        // (see app/api/workspaces/storage-stats/route.ts). An earlier
        // type assumed an object shape `{cap_bytes, used_bytes}` —
        // mismatch left every Launchpad upload preflight reading 0,
        // silently disabling client-side quota warnings.
        const j = await cachedFetch<{
          cap?: number;
          used?: number;
        }>(
          `/api/workspaces/storage-stats?workspaceId=${encodeURIComponent(
            activeId
          )}`
        );
        if (cancelled) return;
        setCap(Number(j.cap ?? 0));
        setUsed(Number(j.used ?? 0));
      } catch {
        /* leave at 0 — uploads will still run, but the local
         * pre-flight against quota is skipped. The server-side check
         * still fires. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, refreshTick]);

  /* Upload pipeline — shared with Files Manager via useFileUploads. We
   * key it off the active workspace id and treat it as "ensured" once
   * the workspace exists in our local list (the server still re-checks
   * membership on every request). */
  const ensured = Boolean(activeId);
  const uploads = useFileUploads({
    workspaceId: activeId || null,
    ensured,
    cap,
    used,
    onUploaded: () => {
      setRefreshTick((n) => n + 1);
    },
    onAfterUploadDelta: (delta) => {
      setUsed((u) => u + delta);
    },
    invalidatePrefix: FILE_LIST_PREFIX,
  });

  const onPickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFilesChosen = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (list.length > 0) void uploads.startUploads(list);
    },
    [uploads]
  );

  /* The Quick Look preview overlay listens for arrow-key navigation
   * via a custom event so it doesn't need to know about the surrounding
   * component tree. We host the focus-change handler here and bridge it
   * back into our local previewFileId state. */
  useEffect(() => {
    const onPreviewSet = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === "string") setPreviewFileId(ce.detail);
    };
    window.addEventListener("launchpad:preview-set", onPreviewSet);
    return () =>
      window.removeEventListener("launchpad:preview-set", onPreviewSet);
  }, []);

  // Hydrate persisted bounds.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(BOUNDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Bounds>;
        if (
          typeof parsed.x === "number" &&
          typeof parsed.y === "number" &&
          typeof parsed.w === "number" &&
          typeof parsed.h === "number"
        ) {
          setBounds({
            x: parsed.x,
            y: parsed.y,
            w: Math.max(MIN_W, parsed.w),
            h: Math.max(MIN_H, parsed.h),
          });
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setBounds(defaultBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist bounds (debounced via useEffect deps — small writes are fine).
  useEffect(() => {
    if (maximized) return; // don't overwrite saved free bounds
    try {
      localStorage.setItem(BOUNDS_KEY, JSON.stringify(bounds));
    } catch {
      /* storage quota — ignore */
    }
  }, [bounds, maximized, BOUNDS_KEY]);

  // Reset transient UI when the window closes.
  useEffect(() => {
    if (!open) {
      setQ("");
      setMenu(null);
      setGroupMenuOpen(false);
      setActionMenuOpen(false);
      setAboutOpen(false);
      setToast(null);
      setMobileDrawerOpen(false);
      setMobileSearchOpen(false);
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    }
  }, [open]);

  /* Apply opening intent. Re-runs whenever `open` becomes true OR the
   * caller bumps `intentKey` (so re-issuing the same intent re-applies).
   * This is the path retired-Files-Manager call sites flow through:
   * openApp("launchpad", { fileId }) → desktop sets intent={kind:"home",fileId}
   * → here we jump the sidebar to Home and focus the file. */
  useEffect(() => {
    if (!open || !intent) return;
    if (intent.kind === "home") {
      launchpadView.setLocation({ kind: "home" });
      if (intent.fileId) setFocusedFileId(intent.fileId);
    } else if (intent.kind === "trash") {
      launchpadView.setLocation({ kind: "trash" });
    } else {
      launchpadView.setLocation({ kind: "applications" });
    }
    // launchpadView.setLocation is stable across renders; we intentionally
    // leave it out so the effect only fires on open/intent transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intent, intentKey]);

  // ⌘W closes; Escape closes; ⌘F focuses the search input.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't steal Escape from the About dialog or the popovers —
        // their own listeners handle it first via stopPropagation.
        if (aboutOpen || groupMenuOpen || actionMenuOpen || menu) return;
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, aboutOpen, groupMenuOpen, actionMenuOpen, menu]);

  // Dismiss the right-click context menu on any pointer-down outside it.
  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  // Show a transient toast (auto-dismisses after 2.5s).
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Resolve the items shown in the main pane based on the current location.
  const sourceTools = useMemo<ToolItem[]>(() => {
    return items ?? TOOLS;
  }, [items]);

  const locationItems = useMemo<ToolItem[]>(() => {
    const loc = launchpadView.location;
    switch (loc.kind) {
      case "applications":
        return sourceTools;
      case "recents": {
        const order: string[] = [];
        for (const r of recents) {
          if (r.kind === "tool") order.push(r.slug);
          if (order.length >= 8) break;
        }
        const bySlug = new Map(sourceTools.map((t) => [t.slug, t]));
        return order
          .map((slug) => bySlug.get(slug))
          .filter((t): t is ToolItem => Boolean(t));
      }
      case "shared":
        // Shared shows a placeholder empty-state in v1; no tool rows.
        return [];
      case "workspace":
        // Workspace rows are jump targets, not item lists. The click
        // handler swaps the active workspace and resets to Applications.
        return sourceTools;
      case "category":
        return sourceTools.filter((t) => t.category === loc.id);
      case "tag":
        // The actual tag NAME (not id) is what we filter against — see
        // the tag-resolution effect below for the mapping. We surface
        // the items here, but the parent passes us only the id so we
        // store name lookups in `tagNameRef`.
        return sourceTools;
      case "home":
      case "favorites":
      case "favorite-file":
      case "downloads":
      case "documents":
      case "desktop":
      default:
        return [];
    }
  }, [launchpadView.location, sourceTools, recents]);

  /* Tag filter — when location is `tag`, look up its name from the
   * sidebar's CRM tag list (also fetched here so it survives navigation
   * even if the sidebar unmounts). */
  const [tagsByName, setTagsByName] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/crm/tags?workspace_id=${encodeURIComponent(activeId)}`
        );
        if (!res.ok) return;
        const j = (await res.json()) as { items?: { id: string; name: string }[] };
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const t of j.items ?? []) map[t.id] = t.name;
        setTagsByName(map);
      } catch {
        /* ignore — tag filter falls back to no-op match */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const filteredByTag = useMemo<ToolItem[]>(() => {
    const loc = launchpadView.location;
    if (loc.kind !== "tag") return locationItems;
    const tagName = (tagsByName[loc.id] ?? "").toLowerCase();
    if (!tagName) return [];
    return locationItems.filter(
      (t) =>
        t.title.toLowerCase().includes(tagName) ||
        t.description.toLowerCase().includes(tagName)
    );
  }, [launchpadView.location, locationItems, tagsByName]);

  // Filter by search query.
  const visibleTools = useMemo<ToolItem[]>(() => {
    const query = q.trim().toLowerCase();
    if (!query) return filteredByTag;
    return filteredByTag.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
    );
  }, [filteredByTag, q]);

  /* Group the visible tools when the user has picked a non-"none"
   * group mode. Recent uses the recents log to label "Recent" /
   * "Earlier". Tag groups by every CRM tag that matches a tool. */
  const groupedTools = useMemo<
    | { groups: Array<{ label: string; tools: ToolItem[] }> }
    | null
  >(() => {
    const mode: LaunchpadGroupMode = launchpadView.group;
    if (mode === "none") return null;
    const view = launchpadView.view;
    if (view !== "icon" && view !== "list") return null;
    if (mode === "category") {
      const map = new Map<string, ToolItem[]>();
      for (const t of visibleTools) {
        const k = t.category;
        const list = map.get(k) ?? [];
        list.push(t);
        map.set(k, list);
      }
      const groups: Array<{ label: string; tools: ToolItem[] }> = [];
      for (const cat of TOOL_CATEGORIES) {
        const list = map.get(cat.key);
        if (list && list.length > 0) groups.push({ label: cat.label, tools: list });
      }
      return { groups };
    }
    if (mode === "recent") {
      const recentSlugs = new Set<string>();
      for (const r of recents) {
        if (r.kind === "tool") recentSlugs.add(r.slug);
      }
      const recent = visibleTools.filter((t) => recentSlugs.has(t.slug));
      const earlier = visibleTools.filter((t) => !recentSlugs.has(t.slug));
      return {
        groups: [
          { label: "Recent", tools: recent },
          { label: "Earlier", tools: earlier },
        ],
      };
    }
    // tag
    const groups: Array<{ label: string; tools: ToolItem[] }> = [];
    const seen = new Set<string>();
    for (const id of Object.keys(tagsByName)) {
      const name = tagsByName[id];
      const lower = name.toLowerCase();
      const matches = visibleTools.filter(
        (t) =>
          t.title.toLowerCase().includes(lower) ||
          t.description.toLowerCase().includes(lower)
      );
      if (matches.length > 0) {
        groups.push({ label: name, tools: matches });
        for (const m of matches) seen.add(m.slug);
      }
    }
    const untagged = visibleTools.filter((t) => !seen.has(t.slug));
    if (untagged.length > 0) groups.push({ label: "Untagged", tools: untagged });
    return { groups };
  }, [
    launchpadView.group,
    launchpadView.view,
    visibleTools,
    recents,
    tagsByName,
  ]);

  // Keep focused item valid when the visible set shrinks.
  useEffect(() => {
    if (!focusedSlug) return;
    if (!visibleTools.find((t) => t.slug === focusedSlug)) {
      setFocusedSlug(visibleTools[0]?.slug ?? null);
    }
  }, [visibleTools, focusedSlug]);

  // Title shown in title bar + toolbar = current location's friendly name.
  const currentTitle = useMemo<string>(() => {
    const loc = launchpadView.location;
    if (loc.kind === "workspace") {
      return workspaces.find((w) => w.id === loc.id)?.name ?? "Workspace";
    }
    if (loc.kind === "category") {
      return TOOL_CATEGORIES.find((c) => c.key === loc.id)?.label ?? loc.id;
    }
    if (loc.kind === "tag") {
      return tagsByName[loc.id] ?? "Tag";
    }
    return locationTitle(loc);
  }, [launchpadView.location, workspaces, tagsByName]);

  const handleSelectLocation = useCallback(
    (loc: LaunchpadLocation) => {
      // Workspace switch: tell the workspace context, then close — the
      // outer Desktop remounts and reopens the window with fresh state.
      if (loc.kind === "workspace") {
        if (loc.id !== activeId) {
          switchWorkspace(loc.id);
          onClose();
        } else {
          launchpadView.setLocation({ kind: "applications" });
        }
        return;
      }
      // Desktop: minimize the window like macOS "Show Desktop".
      if (loc.kind === "desktop") {
        onClose();
        return;
      }
      launchpadView.setLocation(loc);
    },
    [activeId, switchWorkspace, onClose, launchpadView]
  );

  const handleOpen = useCallback(
    (tool: ToolItem) => {
      onOpenTool(tool.slug, tool.title);
      onClose();
    },
    [onOpenTool, onClose]
  );

  const cacheFile = useCallback((file: LaunchpadFile) => {
    fileCacheRef.current.set(file.id, file);
  }, []);

  const handleOpenFile = useCallback(
    (file: LaunchpadFile) => {
      const slug = appForFile(file);
      // Files Manager retirement (Round D): only `documents` / `sheets`
      // open in a dedicated tool now — every other kind previews inside
      // the Launchpad itself via the overlay. Historical fallback to
      // openApp("files-manager", { fileId }) is gone with the tool.
      if (slug === null) {
        cacheFile(file);
        setPreviewFileId(file.id);
        return;
      }
      const titleByApp: Record<string, string> = {
        documents: "Documents",
        sheets: "Sheets",
      };
      onOpenTool(slug, titleByApp[slug] ?? "Files", { fileId: file.id });
      onClose();
    },
    [onOpenTool, onClose, cacheFile]
  );

  const handleToolContext = useCallback(
    (e: React.MouseEvent, tool: ToolItem) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({
        kind: "tool",
        tool,
        x: rect.left,
        y: rect.top + rect.height + 6,
      });
    },
    []
  );

  const handleFileContext = useCallback(
    (e: React.MouseEvent, file: LaunchpadFile) => {
      e.preventDefault();
      cacheFile(file);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({
        kind: "file",
        file,
        x: rect.left,
        y: rect.top + rect.height + 6,
      });
    },
    [cacheFile]
  );

  const handleSharedContext = useCallback(
    (
      e: React.MouseEvent,
      file: LaunchpadFile,
      share: LaunchpadShareMeta
    ) => {
      e.preventDefault();
      cacheFile(file);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenu({
        kind: "shared-file",
        file,
        share,
        x: rect.left,
        y: rect.top + rect.height + 6,
      });
    },
    [cacheFile]
  );

  /* Drag-to-move on the title bar */
  const dragRef = useRef<{ ox: number; oy: number } | null>(null);
  const onTitleDrag = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      if (maximized) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startBx = bounds.x;
      const startBy = bounds.y;
      dragRef.current = { ox: startX - startBx, oy: startY - startBy };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const offset = dragRef.current;
        if (!offset) return;
        setBounds((b) => ({
          ...b,
          x: Math.max(0, ev.clientX - offset.ox),
          y: Math.max(TOPBAR, ev.clientY - offset.oy),
        }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragRef.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [bounds.x, bounds.y, maximized]
  );

  /* 8-way resize, mirroring Window.tsx behavior. */
  const startResize = useCallback(
    (edge: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw") =>
      (e: React.PointerEvent) => {
        e.stopPropagation();
        if (maximized) return;
        const startMx = e.clientX;
        const startMy = e.clientY;
        const startB = { ...bounds };

        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startMx;
          const dy = ev.clientY - startMy;
          let nx = startB.x;
          let ny = startB.y;
          let nw = startB.w;
          let nh = startB.h;
          if (edge.includes("e")) nw = Math.max(MIN_W, startB.w + dx);
          if (edge.includes("w")) {
            const tryW = startB.w - dx;
            if (tryW >= MIN_W) {
              nw = tryW;
              nx = startB.x + dx;
            } else {
              nw = MIN_W;
              nx = startB.x + (startB.w - MIN_W);
            }
          }
          if (edge.includes("s")) nh = Math.max(MIN_H, startB.h + dy);
          if (edge.includes("n")) {
            const tryH = startB.h - dy;
            if (tryH >= MIN_H) {
              nh = tryH;
              ny = Math.max(TOPBAR, startB.y + dy);
            } else {
              nh = MIN_H;
              ny = Math.max(TOPBAR, startB.y + (startB.h - MIN_H));
            }
          }
          setBounds({ x: nx, y: ny, w: nw, h: nh });
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    [bounds, maximized]
  );

  const toggleMaximize = useCallback(() => {
    if (typeof window === "undefined") return;
    if (maximized && prevBounds) {
      setBounds(prevBounds);
      setPrevBounds(null);
      setMaximized(false);
      return;
    }
    setPrevBounds(bounds);
    setBounds({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    setMaximized(true);
  }, [maximized, prevBounds, bounds]);

  // Arrow-key navigation between items in the main pane (icon / list /
  // column / gallery views all share the same focused-slug state).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (visibleTools.length === 0) return;
      const idx = focusedSlug
        ? visibleTools.findIndex((t) => t.slug === focusedSlug)
        : -1;
      const cols = launchpadView.view === "icon" ? 6 : 1;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) + 1, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) - 1, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) + cols, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = clamp(Math.max(0, idx) - cols, 0, visibleTools.length - 1);
        setFocusedSlug(visibleTools[next].slug);
      } else if (e.key === "Enter" && focusedSlug) {
        e.preventDefault();
        const tool = visibleTools.find((t) => t.slug === focusedSlug);
        if (tool) handleOpen(tool);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, visibleTools, focusedSlug, launchpadView.view, handleOpen]);

  /* Toolbar action handlers */

  const handleShare = useCallback(() => {
    const url = "https://spacefield.co/";
    const nav: Navigator & {
      share?: (data: { url: string }) => Promise<void>;
    } = navigator;
    if (typeof nav.share === "function") {
      void nav.share({ url }).catch(() => {
        /* user cancelled or share failed — fall through silently */
      });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard
        .writeText(url)
        .then(() => showToast("Link copied"))
        .catch(() => showToast("Couldn’t copy link"));
      return;
    }
    showToast("Sharing unavailable");
  }, [showToast]);

  const handleRefresh = useCallback(() => {
    invalidate({ prefix: FILE_LIST_PREFIX });
    invalidate({ prefix: FAVORITES_PREFIX });
    invalidate({ prefix: STORAGE_STATS_PREFIX });
    invalidate({ prefix: "/api/crm/tags" });
    favoritesState.refresh();
    setRefreshTick((n) => n + 1);
    showToast("Refreshed");
  }, [showToast, favoritesState]);

  const handleResetWindow = useCallback(() => {
    setMaximized(false);
    setPrevBounds(null);
    setBounds(defaultBounds());
    showToast("Window reset");
  }, [showToast]);

  const handleResetLaunchpad = useCallback(() => {
    if (typeof window === "undefined") return;
    const prefixes = [
      `ws:${activeId}:launchpad-`,
    ];
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
      // Also clear any global launchpad-* keys that pre-date workspaces.
      if (k.startsWith("launchpad-")) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
    window.location.reload();
  }, [activeId]);

  /* Resolve focused name for the status bar. When a file pane is
   * showing, the focused id refers to a file in the cache; otherwise
   * we fall back to the focused tool's title. */
  const focusedNameForStatus = useMemo<string | null>(() => {
    if (!launchpadView.previewOpen) return null;
    if (focusedFileId) {
      const f = fileCacheRef.current.get(focusedFileId);
      if (f) return f.name;
    }
    if (focusedSlug) {
      const t = visibleTools.find((tt) => tt.slug === focusedSlug);
      if (t) return t.title;
    }
    return null;
  }, [launchpadView.previewOpen, focusedFileId, focusedSlug, visibleTools]);

  const showsFilePane =
    launchpadView.location.kind === "downloads" ||
    launchpadView.location.kind === "documents" ||
    launchpadView.location.kind === "shared" ||
    launchpadView.location.kind === "home" ||
    launchpadView.location.kind === "favorites" ||
    launchpadView.location.kind === "trash";

  /* Upload affordance is shown only when a workspace pane is the
   * active location — Applications / Recents don't accept uploads. */
  const uploadEnabled =
    Boolean(activeId) &&
    (launchpadView.location.kind === "home" ||
      launchpadView.location.kind === "downloads" ||
      launchpadView.location.kind === "documents" ||
      launchpadView.location.kind === "favorites");

  const handleUploadClick = useCallback(() => {
    if (!uploadEnabled) return;
    onPickFiles();
  }, [uploadEnabled, onPickFiles]);

  /* Workspace name for the drop overlay copy. */
  const activeWorkspaceName = useMemo(
    () => workspaces.find((w) => w.id === activeId)?.name ?? "this workspace",
    [workspaces, activeId]
  );

  /* Files visible in the current pane — used by the Quick Look overlay
   * for arrow-key navigation. We snapshot from the cache; the ref is
   * populated whenever a pane mounts a row. */
  const previewFiles = useMemo<LaunchpadFile[]>(() => {
    return Array.from(fileCacheRef.current.values());
    // refreshTick + previewFileId so the snapshot rebuilds each time
    // the user opens or navigates the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, previewFileId]);

  /* Resolve the file objects for our pop-out dialogs. The cache only
   * has whatever the user has scrolled past — for a freshly clicked
   * row this is always populated. We use memoized lookups so the
   * dialogs receive a stable reference between renders. */
  const renameFile = useMemo(
    () => (renameFileId ? fileCacheRef.current.get(renameFileId) ?? null : null),
    [renameFileId]
  );
  const tagFile = useMemo(
    () => (tagFileId ? fileCacheRef.current.get(tagFileId) ?? null : null),
    [tagFileId]
  );
  const shareFile = useMemo(
    () => (shareFileId ? fileCacheRef.current.get(shareFileId) ?? null : null),
    [shareFileId]
  );

  /* Drag-and-drop targets the main pane area. Shared with the Files
   * Manager protocol via the same useFileUploads hook. */
  const onMainDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!uploadEnabled) return;
      if (
        !e.dataTransfer.types.includes("Files") &&
        !Array.from(e.dataTransfer.types).some((t) => t === "Files")
      ) {
        return;
      }
      e.preventDefault();
      dragDepthRef.current += 1;
      setDragOver(true);
    },
    [uploadEnabled]
  );
  const onMainDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragOver(false);
    }
  }, []);
  const onMainDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!uploadEnabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [uploadEnabled]
  );
  const onMainDrop = useCallback(
    (e: React.DragEvent) => {
      if (!uploadEnabled) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);
      const list = Array.from(e.dataTransfer.files ?? []);
      if (list.length > 0) void uploads.startUploads(list);
    },
    [uploadEnabled, uploads]
  );

  const handleOpenStorageSettings = useCallback(() => {
    if (onConnect) onConnect();
  }, [onConnect]);

  /* On mobile we render the Launchpad fullscreen — no draggable
   * traffic-light title bar, no resize handles, no persisted bounds.
   * The motion root is fixed inset-0 with 100dvh so it adapts to the
   * mobile viewport without overflowing under the URL/tab bar. */
  const rootStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 75,
        borderRadius: 0,
      }
    : {
        position: "fixed",
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        zIndex: 75,
        borderRadius: maximized ? 0 : undefined,
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Applications"
          initial={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={isMobile ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          exit={isMobile ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={rootStyle}
          // Liquid Glass — translucent body so the desktop wallpaper
          // bleeds through; backdrop-blur adds the frosted feel; the
          // soft outer drop shadow + rounded corners give the window
          // its native macOS depth. On mobile we drop the rounded
          // corners (we cover the whole screen) and the outer shadow.
          className={
            isMobile
              ? "flex flex-col overflow-hidden bg-app"
              : "sf-glass-window overflow-hidden " +
                (maximized ? "" : "rounded-xl")
          }
          onPointerDown={(e) => {
            // Stop bubbling so the desktop's drop handlers don't grab events.
            e.stopPropagation();
          }}
        >
          {/* Title bar — Liquid Glass on desktop only. On mobile we skip
           * the macOS traffic-light row entirely; the toolbar carries
           * the back button instead. */}
          {!isMobile && (
            <div
              onPointerDown={onTitleDrag}
              onDoubleClick={toggleMaximize}
              className="sf-glass-titlebar relative flex h-9 select-none items-center gap-2 px-3"
              style={{ cursor: maximized ? "default" : "grab" }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.06) 100%)",
                }}
              />
              <div className="flex items-center gap-1.5" data-no-drag>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="group h-3 w-3 rounded-full bg-[#ff5f57] transition-colors"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#4d0000]" aria-hidden="true">
                    <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Minimize"
                  className="group h-3 w-3 rounded-full bg-[#febc2e] transition-colors"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#604000]" aria-hidden="true">
                    <path d="M3 6h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={toggleMaximize}
                  aria-label={maximized ? "Restore" : "Maximize"}
                  className="group h-3 w-3 rounded-full bg-[#28c840] transition-colors"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 opacity-0 group-hover:opacity-80 text-[#013000]" aria-hidden="true">
                    <path d="M3.5 6l2.5-2.5L8.5 6M3.5 6l2.5 2.5L8.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 truncate text-center text-xs font-medium text-app">
                {currentTitle}
              </div>
              <div className="flex items-center gap-1" data-no-drag>
                {onStore && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStore();
                    }}
                    className="rounded px-2 py-0.5 text-[11px] text-secondary hover:bg-surface hover:text-app transition-colors"
                    title="Open the Store"
                  >
                    Store
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <LaunchpadToolbar
            title={currentTitle}
            query={q}
            onQuery={setQ}
            searchInputRef={searchInputRef}
            view={launchpadView.view}
            onView={launchpadView.setView}
            canBack={launchpadView.canBack}
            canForward={launchpadView.canForward}
            onBack={launchpadView.back}
            onForward={launchpadView.forward}
            previewOpen={launchpadView.previewOpen}
            onTogglePreview={launchpadView.togglePreview}
            onConnect={() => {
              if (onConnect) onConnect();
            }}
            onUpload={uploadEnabled ? handleUploadClick : undefined}
            group={launchpadView.group}
            groupMenuOpen={groupMenuOpen}
            onToggleGroupMenu={() => {
              setActionMenuOpen(false);
              setGroupMenuOpen((v) => !v);
            }}
            onShare={handleShare}
            actionMenuOpen={actionMenuOpen}
            onToggleActionMenu={() => {
              setGroupMenuOpen(false);
              setActionMenuOpen((v) => !v);
            }}
            compact={isMobile}
            onCloseMobile={onClose}
            onToggleMobileMenu={() => setMobileDrawerOpen((v) => !v)}
            mobileMenuOpen={mobileDrawerOpen}
            mobileSearchOpen={mobileSearchOpen}
            onToggleMobileSearch={() => {
              setMobileSearchOpen((v) => {
                const next = !v;
                if (next) {
                  // Focus the search input on the next tick so it lands
                  // after the input mounts.
                  window.setTimeout(() => {
                    searchInputRef.current?.focus();
                  }, 0);
                }
                return next;
              });
            }}
            aiSlot={
              activeId && !isMobile ? (
                <AgentChatScope
                  workspaceId={activeId}
                  scope="files"
                  variant="compact"
                  title="Ask the Files assistant"
                />
              ) : null
            }
          />

          <LaunchpadGroupMenu
            open={groupMenuOpen}
            group={launchpadView.group}
            onPick={(g) => launchpadView.setGroup(g)}
            onClose={() => setGroupMenuOpen(false)}
          />

          <LaunchpadActionMenu
            open={actionMenuOpen}
            onClose={() => setActionMenuOpen(false)}
            onRefresh={handleRefresh}
            onResetWindow={handleResetWindow}
            onAbout={() => setAboutOpen(true)}
            onResetLaunchpad={handleResetLaunchpad}
          />

          {/* Body — sidebar + main pane (+ optional preview).
           *  Translucent so wallpaper bleeds through; the inner panes
           *  layer their own opacities on top.
           *
           *  On desktop, the body's height is computed off the window's
           *  pixel bounds (title bar 36 + toolbar 48 + status bar 24).
           *  On mobile, the body uses `flex-1` so it fills whatever the
           *  toolbar + status bar leave behind — no fixed pixel math. */}
          <div
            className={
              isMobile
                ? "relative flex min-h-0 flex-1 bg-app/30"
                : "flex bg-app/30"
            }
            style={
              isMobile ? undefined : { height: bounds.h - 36 - 48 - 24 }
            }
            onDragOver={(e) => {
              if (!onAppDroppedOnLaunchpad) return;
              if (e.dataTransfer.types.includes("application/x-spacefield-app")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              if (!onAppDroppedOnLaunchpad) return;
              const payload = readAppDragPayload(e.dataTransfer);
              if (!payload) return;
              e.preventDefault();
              onAppDroppedOnLaunchpad(payload);
            }}
          >
            {/* Sidebar — always rendered on desktop. On mobile it lives
             * inside a slide-in drawer that sits on top of the main
             * pane; tapping the backdrop closes it. */}
            {!isMobile && (
              <LaunchpadSidebar
                current={launchpadView.location}
                onSelect={handleSelectLocation}
                workspaces={workspaces}
                activeWorkspaceId={activeId}
                onSwitchWorkspace={onConnect}
                favorites={favoritesState.favorites}
                onFavoriteOpen={(file) => {
                  cacheFile(file);
                  setFocusedFileId(file.id);
                  handleOpenFile(file);
                }}
                onFavoriteContext={(e, file) => {
                  cacheFile(file);
                  setFocusedFileId(file.id);
                  handleFileContext(e, file);
                }}
                footer={
                  activeId ? (
                    <LaunchpadStorageBar
                      workspaceId={activeId}
                      refreshTick={refreshTick}
                      onOpenStorageSettings={handleOpenStorageSettings}
                    />
                  ) : null
                }
              />
            )}

            {isMobile && mobileDrawerOpen && (
              <>
                {/* Backdrop — div, not button. Earlier iteration used a
                 * <button> backdrop covering inset-0; Safari's accessibility
                 * tree got confused by interactive elements (drawer rows)
                 * sitting visually inside another button's hit-area, and
                 * occasionally swallowed taps on the rows. Plain div with
                 * onClick + role=button is reliable on every browser. */}
                <div
                  role="button"
                  tabIndex={-1}
                  aria-label="Close menu"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="absolute inset-0 z-[60] bg-black/40"
                />
                <div
                  className="sf-glass-window absolute inset-y-0 left-0 z-[61] flex w-[78%] max-w-[280px] flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <LaunchpadSidebar
                    compact
                    current={launchpadView.location}
                    onSelect={(loc) => {
                      handleSelectLocation(loc);
                      setMobileDrawerOpen(false);
                    }}
                    workspaces={workspaces}
                    activeWorkspaceId={activeId}
                    onSwitchWorkspace={onConnect}
                    favorites={favoritesState.favorites}
                    onFavoriteOpen={(file) => {
                      cacheFile(file);
                      setFocusedFileId(file.id);
                      handleOpenFile(file);
                      setMobileDrawerOpen(false);
                    }}
                    onFavoriteContext={(e, file) => {
                      cacheFile(file);
                      setFocusedFileId(file.id);
                      handleFileContext(e, file);
                    }}
                    footer={
                      activeId ? (
                        <LaunchpadStorageBar
                          workspaceId={activeId}
                          refreshTick={refreshTick}
                          onOpenStorageSettings={handleOpenStorageSettings}
                        />
                      ) : null
                    }
                  />
                </div>
              </>
            )}

            <div
              className="relative flex min-h-0 flex-1 overflow-hidden"
              onDragEnter={onMainDragEnter}
              onDragLeave={onMainDragLeave}
              onDragOver={onMainDragOver}
              onDrop={onMainDrop}
            >
              <div
                className="flex-1 overflow-y-auto"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <MainPane
                  view={launchpadView.view}
                  tools={visibleTools}
                  toolGroups={groupedTools?.groups}
                  focusedSlug={focusedSlug}
                  onFocus={(slug) => {
                    setFocusedSlug(slug);
                    setFocusedFileId(null);
                  }}
                  onOpen={handleOpen}
                  onContextMenu={handleToolContext}
                  itemsHint={items}
                  locationKey={locationKey(launchpadView.location)}
                  location={launchpadView.location}
                  onOpenStore={onStore}
                  onClose={onClose}
                  workspaceId={activeId}
                  refreshTick={refreshTick}
                  onOpenFile={(file) => {
                    cacheFile(file);
                    setFocusedFileId(file.id);
                    handleOpenFile(file);
                  }}
                  onFileContext={(e, file) => {
                    setFocusedFileId(file.id);
                    handleFileContext(e, file);
                  }}
                  onSharedContext={(e, file, share) => {
                    setFocusedFileId(file.id);
                    handleSharedContext(e, file, share);
                  }}
                  onFileFocus={(file) => {
                    cacheFile(file);
                    setFocusedFileId(file.id);
                  }}
                />
              </div>

              {/* Preview pane — desktop only. On mobile a 240px right-rail
               * pane next to the main scroll area would squeeze content
               * to ~135px; the toolbar's preview toggle is hidden on
               * compact, but persisted previewOpen state from desktop use
               * could still trigger this branch. Gate it. */}
              {!isMobile && launchpadView.previewOpen && !showsFilePane && (
                <PreviewPane
                  tool={visibleTools.find((t) => t.slug === focusedSlug) ?? null}
                  onOpen={handleOpen}
                />
              )}
              {!isMobile && launchpadView.previewOpen && showsFilePane && (
                <FilePreviewPane
                  file={
                    focusedFileId
                      ? fileCacheRef.current.get(focusedFileId) ?? null
                      : null
                  }
                  onOpen={(f) => handleOpenFile(f)}
                />
              )}

              {/* Drop overlay — shown while a native file drag is over
                  the main pane and the active location accepts uploads. */}
              {dragOver && uploadEnabled && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2 z-[60] flex items-center justify-center rounded-lg border-2 border-dashed border-tool-accent bg-tool-accent-soft/40 backdrop-blur-md"
                >
                  <div className="rounded-lg bg-app-elevated/80 px-4 py-2 text-[13px] font-semibold text-app shadow">
                    Drop files to upload to {activeWorkspaceName}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <LaunchpadStatusBar
            itemCount={
              // File-listing locations don't surface their row count
              // here — the file panes manage their own state. We hand
              // the status bar 0 in that case and let the GB indicator
              // carry the rest.
              showsFilePane ? 0 : visibleTools.length
            }
            workspaceId={activeId}
            focusedName={focusedNameForStatus}
            compact={isMobile}
          />

          {/* Resize handles — desktop only. Mobile is full-screen with
           * fixed bounds; resize is irrelevant. */}
          {!isMobile && !maximized && (
            <>
              <div onPointerDown={startResize("n")} aria-label="Resize top edge" className="absolute left-3 right-3 top-0 h-1.5 cursor-ns-resize" />
              <div onPointerDown={startResize("s")} aria-label="Resize bottom edge" className="absolute left-3 right-3 bottom-0 h-1.5 cursor-ns-resize" />
              <div onPointerDown={startResize("w")} aria-label="Resize left edge" className="absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize" />
              <div onPointerDown={startResize("e")} aria-label="Resize right edge" className="absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize" />
              <div onPointerDown={startResize("nw")} aria-label="Resize top-left corner" className="absolute top-0 left-0 h-3 w-3 cursor-nw-resize" />
              <div onPointerDown={startResize("ne")} aria-label="Resize top-right corner" className="absolute top-0 right-0 h-3 w-3 cursor-ne-resize" />
              <div onPointerDown={startResize("sw")} aria-label="Resize bottom-left corner" className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize" />
              <div onPointerDown={startResize("se")} aria-label="Resize bottom-right corner" className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" />
            </>
          )}

          {/* Right-click context menu — supports both tool and file rows. */}
          {menu && menu.kind === "tool" && (
            <ToolContextMenu
              tool={menu.tool}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              onOpen={() => {
                handleOpen(menu.tool);
              }}
              onShowInApps={() => {
                launchpadView.setLocation({ kind: "applications" });
                setFocusedSlug(menu.tool.slug);
              }}
              onPin={
                onTogglePin
                  ? () => {
                      onTogglePin(menu.tool.slug);
                      const verb =
                        isPinned && isPinned(menu.tool.slug) ? "Unpinned" : "Pinned";
                      showToast(`${verb} ${menu.tool.title}`);
                    }
                  : undefined
              }
              isPinned={isPinned ? isPinned(menu.tool.slug) : false}
              onGetInfo={() => {
                if (!launchpadView.previewOpen) launchpadView.togglePreview();
                setFocusedSlug(menu.tool.slug);
              }}
              onUninstall={
                onUninstall ? () => onUninstall(menu.tool.slug) : undefined
              }
            />
          )}
          {menu && menu.kind === "file" && (
            <FileContextMenu
              file={menu.file}
              isStarred={favoritesState.isStarred(menu.file.id)}
              x={menu.x}
              y={menu.y}
              onClose={() => setMenu(null)}
              onOpen={() => handleOpenFile(menu.file)}
              onPreview={() => {
                cacheFile(menu.file);
                setPreviewFileId(menu.file.id);
              }}
              onReveal={() => {
                // Reveal — navigate the Launchpad to Home and focus the
                // file rather than punting to the Files Manager. The
                // file pane reads `focusedFileId` to scroll-into-view.
                cacheFile(menu.file);
                setFocusedFileId(menu.file.id);
                launchpadView.setLocation({ kind: "home" });
              }}
              onRename={() => setRenameFileId(menu.file.id)}
              onEditTags={() => setTagFileId(menu.file.id)}
              onShare={() => setShareFileId(menu.file.id)}
              onToggleStar={async () => {
                const nowStarred = await favoritesState.toggle(menu.file);
                showToast(nowStarred ? "Added to Favorites" : "Removed from Favorites");
              }}
              onDelete={async () => {
                try {
                  await fetch(
                    `/api/files/delete?id=${encodeURIComponent(menu.file.id)}`,
                    { method: "DELETE" }
                  );
                } catch {
                  /* swallow — we still show toast + refresh below */
                }
                invalidate({ prefix: FILE_LIST_PREFIX });
                invalidate({ prefix: FAVORITES_PREFIX });
                invalidate({ prefix: STORAGE_STATS_PREFIX });
                favoritesState.refresh();
                setRefreshTick((n) => n + 1);
                showToast("Deleted");
              }}
            />
          )}
          {menu && menu.kind === "shared-file" && (
            <SharedFileContextMenu
              file={menu.file}
              x={menu.x}
              y={menu.y}
              canRevoke={workspaces.some(
                (w) => w.id === menu.share.source_workspace_id
              )}
              onClose={() => setMenu(null)}
              onOpen={() => handleOpenFile(menu.file)}
              onReveal={() => {
                // For shared files, "Reveal" jumps to Home in the owning
                // workspace if it's the active one. If the owning
                // workspace isn't active we previously fell back to the
                // standalone Files Manager — that tool was retired
                // (Round D), so we now stay inside the Launchpad's
                // Shared pane and just toast the user the file lives in
                // a different workspace. Switching workspaces is one
                // click away in the sidebar.
                const owns = workspaces.some(
                  (w) => w.id === menu.share.source_workspace_id
                );
                if (owns && menu.share.source_workspace_id === activeId) {
                  cacheFile(menu.file);
                  setFocusedFileId(menu.file.id);
                  launchpadView.setLocation({ kind: "home" });
                  return;
                }
                showToast("File lives in another workspace — switch to reveal");
                setMenu(null);
              }}
              onCopyLink={async () => {
                const link = `${window.location.origin}/tools?file=${encodeURIComponent(menu.file.id)}`;
                try {
                  if (
                    navigator.clipboard &&
                    typeof navigator.clipboard.writeText === "function"
                  ) {
                    await navigator.clipboard.writeText(link);
                    showToast("Share link copied");
                  } else {
                    showToast("Clipboard unavailable");
                  }
                } catch {
                  showToast("Couldn’t copy link");
                }
              }}
              onRevoke={async () => {
                try {
                  await fetch(
                    `/api/files/shares/${encodeURIComponent(menu.share.id)}`,
                    { method: "DELETE" }
                  );
                } catch {
                  /* swallow */
                }
                invalidate({ prefix: SHARES_PREFIX });
                setRefreshTick((n) => n + 1);
                showToast("Removed share");
              }}
            />
          )}

          <LaunchpadAboutDialog
            open={aboutOpen}
            onClose={() => setAboutOpen(false)}
          />

          {/* Hidden file input — driven by the toolbar's "+ Upload"
              button. Lives at the modal scope so the same input is
              available regardless of which pane is active. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFilesChosen}
          />

          {/* Per-file upload progress toast (bottom-right). */}
          <LaunchpadUploadToast
            jobs={uploads.jobs}
            onCancel={uploads.cancelJob}
            onDismiss={uploads.removeJob}
            onClearDone={uploads.clearDone}
          />

          {/* Per-file dialogs. Each keys off a single file id at a
              time and closes via setting the id back to null. */}
          <AnimatePresence>
            {renameFile && (
              <LaunchpadRenameDialog
                file={renameFile}
                onClose={() => setRenameFileId(null)}
                onRenamed={() => {
                  setRefreshTick((n) => n + 1);
                  showToast("Renamed");
                }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {tagFile && (
              <LaunchpadTagEditor
                file={{
                  id: tagFile.id,
                  name: tagFile.name,
                  tags: hasTags(tagFile) ? tagFile.tags : [],
                }}
                onClose={() => setTagFileId(null)}
                onSaved={() => {
                  setRefreshTick((n) => n + 1);
                  showToast("Tags updated");
                }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {shareFile && activeId && (
              <LaunchpadShareDialog
                file={{ id: shareFile.id, name: shareFile.name }}
                sourceWorkspaceId={activeId}
                candidateWorkspaces={workspaces
                  .filter((w) => w.id !== activeId)
                  .map((w) => ({ id: w.id, name: w.name }))}
                onClose={() => setShareFileId(null)}
              />
            )}
          </AnimatePresence>

          {/* Quick Look preview overlay — covers the whole shell. */}
          {previewFileId && (
            <LaunchpadPreviewOverlay
              files={previewFiles}
              fileId={previewFileId}
              onClose={() => setPreviewFileId(null)}
              onOpenInTool={(slug, fileId) => {
                onOpenTool(
                  slug,
                  slug === "documents" ? "Documents" : "Sheets",
                  { fileId }
                );
                setPreviewFileId(null);
                onClose();
              }}
            />
          )}

          {toast && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute left-1/2 top-[60px] z-[85] -translate-x-1/2 rounded-md border border-app bg-app-elevated px-3 py-1.5 text-[12px] text-app shadow-lg"
            >
              {toast}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* Some Launchpad file rows carry tag arrays in their cached state but
 * the LaunchpadFile interface is the lean shape that doesn't include
 * them. This narrow helper coerces safely without forcing the broader
 * pane components to widen. */
function hasTags(
  file: LaunchpadFile & { tags?: FileTag[] }
): file is LaunchpadFile & { tags: FileTag[] } {
  return Array.isArray(file.tags);
}

interface MainPaneProps {
  view: ReturnType<typeof useLaunchpadView>["view"];
  tools: ToolItem[];
  toolGroups?: Array<{ label: string; tools: ToolItem[] }>;
  focusedSlug: string | null;
  onFocus: (slug: string) => void;
  onOpen: (tool: ToolItem) => void;
  onContextMenu: (e: React.MouseEvent, tool: ToolItem) => void;
  itemsHint?: ToolItem[];
  locationKey: string;
  location: LaunchpadLocation;
  onOpenStore?: () => void;
  onClose: () => void;
  workspaceId: string;
  refreshTick: number;
  onOpenFile: (file: LaunchpadFile) => void;
  onFileContext: (e: React.MouseEvent, file: LaunchpadFile) => void;
  onSharedContext: (
    e: React.MouseEvent,
    file: LaunchpadFile,
    share: LaunchpadShareMeta
  ) => void;
  onFileFocus: (file: LaunchpadFile) => void;
}

function MainPane({
  view,
  tools,
  toolGroups,
  focusedSlug,
  onFocus,
  onOpen,
  onContextMenu,
  itemsHint,
  locationKey: locKey,
  location,
  onOpenStore,
  onClose,
  workspaceId,
  refreshTick,
  onOpenFile,
  onFileContext,
  onSharedContext,
}: MainPaneProps) {
  // First-launch helper: surface a prominent "Open the Store" CTA when
  // the user has no installed tools at all (matches the previous
  // overlay's empty-state UX).
  if (
    locKey === "applications" &&
    itemsHint &&
    itemsHint.length === 0 &&
    onOpenStore
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-secondary">
          No tools installed yet. Open the Store to add some.
        </p>
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStore();
          }}
          className="rounded-md bg-tool-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Open the Tool Store
        </button>
      </div>
    );
  }

  // Keep-alive: all file panes mount on Launchpad open so the user sees
  // instant tab switches across Home / Trash / Downloads / Documents /
  // Favorites / Shared. Each pane fires its own fetch on mount in
  // parallel; switching is just toggling visibility from then on.
  const FilePane = ({
    active,
    children,
  }: { active: boolean; children: React.ReactNode }) => (
    <div
      className="absolute inset-0 overflow-auto"
      style={{ display: active ? undefined : "none" }}
      aria-hidden={!active}
    >
      {children}
    </div>
  );

  const showingFilePane =
    location.kind === "trash" ||
    location.kind === "home" ||
    location.kind === "downloads" ||
    location.kind === "documents" ||
    location.kind === "favorites" ||
    location.kind === "shared";

  if (showingFilePane && workspaceId) {
    return (
      <div className="relative h-full">
        <FilePane active={location.kind === "trash"}>
          <LaunchpadTrashView
            workspaceId={workspaceId}
            refreshTick={refreshTick}
            onContextMenu={onFileContext}
          />
        </FilePane>
        <FilePane active={location.kind === "home"}>
          <LaunchpadHomeView
            workspaceId={workspaceId}
            refreshTick={refreshTick}
            onOpenFile={onOpenFile}
            onContextMenu={onFileContext}
          />
        </FilePane>
        <FilePane active={location.kind === "downloads"}>
          <LaunchpadFilesPane
            workspaceId={workspaceId}
            limit={100}
            refreshTick={refreshTick}
            emptyTitle="No files yet"
            emptyHint="Files you save to this workspace will show up here."
            onOpenFile={onOpenFile}
            onContextMenu={onFileContext}
          />
        </FilePane>
        <FilePane active={location.kind === "documents"}>
          <LaunchpadFilesPane
            workspaceId={workspaceId}
            limit={100}
            kinds="document,sheet"
            filterKinds={["document", "sheet"] as LaunchpadFileKind[]}
            refreshTick={refreshTick}
            emptyTitle="No documents yet"
            emptyHint="Text documents and spreadsheets will appear here."
            onOpenFile={onOpenFile}
            onContextMenu={onFileContext}
          />
        </FilePane>
        <FilePane active={location.kind === "favorites"}>
          <LaunchpadFavoritesPane
            workspaceId={workspaceId}
            refreshTick={refreshTick}
            onOpenFile={onOpenFile}
            onContextMenu={onFileContext}
          />
        </FilePane>
        <FilePane active={location.kind === "shared"}>
          <LaunchpadSharedPane
            workspaceId={workspaceId}
            refreshTick={refreshTick}
            onOpenFile={onOpenFile}
            onContextMenu={onSharedContext}
          />
        </FilePane>
      </div>
    );
  }

  // Applications view gets an "App Store" tile pinned to the top.
  const appStoreHeader =
    location.kind === "applications" && onOpenStore ? (
      <div className="border-b border-app/40 bg-app/30 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStore();
          }}
          className="flex items-center gap-3 rounded-lg border border-app/40 bg-app-elevated/70 px-3 py-2 text-left text-[13px] text-app transition-colors hover:bg-surface"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--tool-accent) 0%, color-mix(in oklab, var(--tool-accent) 70%, black) 100%)",
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 7h14l-1.4 11a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8z" />
              <path d="M9 7a3 3 0 1 1 6 0" />
            </svg>
          </span>
          <span className="flex flex-col">
            <span className="font-semibold">App Store</span>
            <span className="text-[11px] text-muted">
              Browse and install more tools
            </span>
          </span>
        </button>
      </div>
    ) : null;

  const renderToolView = () => {
    switch (view) {
      case "list":
        return (
          <LaunchpadListView
            tools={tools}
            groups={toolGroups}
            focusedSlug={focusedSlug}
            onFocus={onFocus}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        );
      case "column":
        return (
          <LaunchpadColumnView
            tools={tools}
            focusedSlug={focusedSlug}
            onFocus={onFocus}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        );
      case "gallery":
        return (
          <LaunchpadGalleryView
            tools={tools}
            focusedSlug={focusedSlug}
            onFocus={onFocus}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        );
      case "icon":
      default:
        return (
          <LaunchpadIconView
            tools={tools}
            groups={toolGroups}
            focusedSlug={focusedSlug}
            onFocus={onFocus}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        );
    }
  };

  if (appStoreHeader) {
    return (
      <div className="flex h-full flex-col">
        {appStoreHeader}
        <div className="flex-1 overflow-auto">{renderToolView()}</div>
      </div>
    );
  }
  return renderToolView();
}

/* Pane that lists the user's starred files for the active workspace.
 * Mirrors LaunchpadFilesPane's row layout so the look matches Downloads
 * / Documents. */
function LaunchpadFavoritesPane({
  workspaceId,
  refreshTick,
  onOpenFile,
  onContextMenu,
}: {
  workspaceId: string;
  refreshTick: number;
  onOpenFile: (file: LaunchpadFile) => void;
  onContextMenu: (e: React.MouseEvent, file: LaunchpadFile) => void;
}) {
  const fav = useLaunchpadFavorites(workspaceId);
  // Re-fetch when the parent's refresh tick bumps.
  useEffect(() => {
    if (refreshTick > 0) fav.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  if (fav.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (fav.favorites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-12 text-center">
        <div className="text-sm font-medium text-app">No favorites yet</div>
        <div className="text-xs text-muted">
          Star a file in the Files Manager to pin it here.
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app bg-app/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted backdrop-blur-md">
        <span>Name</span>
        <span>Date</span>
        <span>Size</span>
        <span>Kind</span>
      </div>
      <div>
        {fav.favorites.map((f) => {
          const k = fileKind(f);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpenFile(f)}
              onContextMenu={(e) => onContextMenu(e, f)}
              className="grid w-full grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-app/60 px-3 py-1.5 text-left text-[12px] text-app transition-colors hover:bg-surface"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="text-amber-500">★</span>
                <span className="truncate">{f.name}</span>
              </span>
              <span className="truncate text-secondary">
                {new Date(f.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="truncate text-secondary">{fmtSize(f.size_bytes)}</span>
              <span className="truncate text-secondary">{k}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Right-side preview pane — shown when the toolbar's Preview toggle is on.
 * Mirrors Finder's preview behavior: large icon, name, kind, description,
 * Open button. */
function PreviewPane({
  tool,
  onOpen,
}: {
  tool: ToolItem | null;
  onOpen: (tool: ToolItem) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-app bg-app-elevated p-5 lg:flex">
      {tool ? (
        <>
          <div className="pt-2">
            <PreviewIcon slug={tool.slug} title={tool.title} />
          </div>
          <div className="text-center text-base font-semibold text-app">
            {tool.title}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {TOOL_CATEGORIES.find((c) => c.key === tool.category)?.label ??
              tool.category}
          </div>
          <p className="text-center text-[12px] leading-relaxed text-secondary">
            {tool.description}
          </p>
          <button
            type="button"
            onClick={() => onOpen(tool)}
            className="mt-2 rounded-md bg-tool-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open
          </button>
        </>
      ) : (
        <div className="pt-12 text-sm text-muted">No item selected</div>
      )}
    </aside>
  );
}

function FilePreviewPane({
  file,
  onOpen,
}: {
  file: LaunchpadFile | null;
  onOpen: (file: LaunchpadFile) => void;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-app bg-app-elevated p-5 lg:flex">
      {file ? (
        <>
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-surface text-secondary">
            <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3h10l3 3v15H7z" />
              <path d="M14 3v4h4" />
            </svg>
          </div>
          <div className="text-center text-sm font-semibold text-app break-words">
            {file.name}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted">
            {fileKind(file)}
          </div>
          <div className="text-[11px] text-secondary">
            {fmtSize(file.size_bytes)}
          </div>
          <button
            type="button"
            onClick={() => onOpen(file)}
            className="mt-2 rounded-md bg-tool-accent px-4 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open
          </button>
        </>
      ) : (
        <div className="pt-12 text-sm text-muted">No item selected</div>
      )}
    </aside>
  );
}

function PreviewIcon({ slug, title }: { slug: string; title: string }) {
  if (hasAppIcon(slug)) {
    return <AppIcon slug={slug} size={96} cornerPct={24} label={title} />;
  }
  return <div className="h-[96px] w-[96px] rounded-2xl bg-surface" />;
}

interface ToolContextMenuProps {
  tool: ToolItem;
  x: number;
  y: number;
  onClose: () => void;
  onOpen: () => void;
  onShowInApps: () => void;
  onPin?: () => void;
  isPinned: boolean;
  onGetInfo: () => void;
  onUninstall?: () => void;
}

function ToolContextMenu({
  tool,
  x,
  y,
  onClose,
  onOpen,
  onShowInApps,
  onPin,
  isPinned,
  onGetInfo,
  onUninstall,
}: ToolContextMenuProps) {
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      className="sf-glass-menu pointer-events-auto fixed z-[90] w-56 rounded-lg p-1"
      style={{ left: x, top: y }}
    >
      <div className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        {tool.title}
      </div>
      <MenuItem
        label="Open"
        onClick={() => {
          onOpen();
          onClose();
        }}
      />
      <MenuItem
        label="Show in Applications"
        onClick={() => {
          onShowInApps();
          onClose();
        }}
      />
      {onPin && (
        <MenuItem
          label={isPinned ? "Unpin from Dock" : "Pin to Dock"}
          onClick={() => {
            onPin();
            onClose();
          }}
        />
      )}
      <MenuItem
        label="Get Info"
        onClick={() => {
          onGetInfo();
          onClose();
        }}
      />
      {onUninstall && (
        <>
          <div aria-hidden="true" className="my-1 h-px bg-app/60" />
          <MenuItem
            label="Uninstall"
            destructive
            onClick={() => {
              onUninstall();
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}

interface FileContextMenuProps {
  file: LaunchpadFile;
  isStarred: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onOpen: () => void;
  onPreview: () => void;
  onReveal: () => void;
  onRename: () => void;
  onEditTags: () => void;
  onShare: () => void;
  onToggleStar: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

function FileContextMenu({
  file,
  isStarred,
  x,
  y,
  onClose,
  onOpen,
  onPreview,
  onReveal,
  onRename,
  onEditTags,
  onShare,
  onToggleStar,
  onDelete,
}: FileContextMenuProps) {
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed z-[90] w-60 rounded-lg border border-app/50 bg-app-elevated/85 p-1 shadow-xl backdrop-blur-2xl"
      style={{ left: x, top: y }}
    >
      <div className="truncate px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        {file.name}
      </div>
      <MenuItem
        label="Open"
        onClick={() => {
          onOpen();
          onClose();
        }}
      />
      <MenuItem
        label="Quick Look"
        onClick={() => {
          onPreview();
          onClose();
        }}
      />
      <MenuItem
        label={isStarred ? "Unstar" : "Star"}
        onClick={() => {
          void onToggleStar();
          onClose();
        }}
      />
      <MenuItem
        label="Reveal"
        onClick={() => {
          onReveal();
          onClose();
        }}
      />
      <div aria-hidden="true" className="my-1 h-px bg-app/60" />
      <MenuItem
        label="Rename…"
        onClick={() => {
          onRename();
          onClose();
        }}
      />
      <MenuItem
        label="Edit tags…"
        onClick={() => {
          onEditTags();
          onClose();
        }}
      />
      <MenuItem
        label="Share to workspace…"
        onClick={() => {
          onShare();
          onClose();
        }}
      />
      <div aria-hidden="true" className="my-1 h-px bg-app/60" />
      <MenuItem
        label="Delete"
        destructive
        onClick={() => {
          void onDelete();
          onClose();
        }}
      />
    </div>
  );
}

interface SharedFileContextMenuProps {
  file: LaunchpadFile;
  x: number;
  y: number;
  canRevoke: boolean;
  onClose: () => void;
  onOpen: () => void;
  onReveal: () => void;
  onCopyLink: () => void | Promise<void>;
  onRevoke: () => void | Promise<void>;
}

function SharedFileContextMenu({
  file,
  x,
  y,
  canRevoke,
  onClose,
  onOpen,
  onReveal,
  onCopyLink,
  onRevoke,
}: SharedFileContextMenuProps) {
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed z-[90] w-60 rounded-lg border border-app/50 bg-app-elevated/85 p-1 shadow-xl backdrop-blur-2xl"
      style={{ left: x, top: y }}
    >
      <div className="truncate px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        {file.name}
      </div>
      <MenuItem
        label="Open"
        onClick={() => {
          onOpen();
          onClose();
        }}
      />
      {canRevoke && (
        <MenuItem
          label="Reveal"
          onClick={() => {
            onReveal();
            onClose();
          }}
        />
      )}
      <MenuItem
        label="Copy share link"
        onClick={() => {
          void onCopyLink();
          onClose();
        }}
      />
      {canRevoke && (
        <>
          <div aria-hidden="true" className="my-1 h-px bg-app/60" />
          <MenuItem
            label="Remove from this workspace"
            destructive
            onClick={() => {
              void onRevoke();
              onClose();
            }}
          />
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        "block w-full rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface " +
        (destructive ? "text-rose-500" : "text-app")
      }
    >
      {label}
    </button>
  );
}
