"use client";

/* useLaunchpadView — Finder-style state for the Launchpad window.
 *
 * Tracks four pieces of state:
 *   1. The current sidebar location (Applications / Recents / Shared /
 *      Downloads / Documents / Desktop / a workspace id / a tag key).
 *   2. The current view mode (icon / list / column / gallery).
 *   3. A back/forward navigation stack so the toolbar arrows feel native.
 *   4. The "preview" pane visibility toggle.
 *
 * View mode is persisted per-workspace at `ws:<id>:launchpad-view-v1`.
 * Location and history are intentionally session-only so the window opens
 * on Applications every time, just like Finder does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceKey } from "../useWorkspaces";

export type LaunchpadViewMode = "icon" | "list" | "column" | "gallery";
export type LaunchpadGroupMode = "none" | "category" | "recent" | "tag";

/* Stable string ids for every sidebar entry. Workspace ids are the raw
 * uuid; tag ids are prefixed `tag:` to avoid collision with the small set
 * of named locations. */
export type LaunchpadLocation =
  | { kind: "applications" }
  | { kind: "recents" }
  | { kind: "shared" }
  | { kind: "home" }
  | { kind: "downloads" }
  | { kind: "documents" }
  | { kind: "desktop" }
  | { kind: "favorites" }
  | { kind: "trash" }
  | { kind: "favorite-file"; id: string }
  | { kind: "workspace"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "category"; id: string };

export function locationKey(loc: LaunchpadLocation): string {
  switch (loc.kind) {
    case "workspace":
      return `workspace:${loc.id}`;
    case "tag":
      return `tag:${loc.id}`;
    case "category":
      return `category:${loc.id}`;
    case "favorite-file":
      return `favorite-file:${loc.id}`;
    default:
      return loc.kind;
  }
}

export function locationTitle(loc: LaunchpadLocation): string {
  switch (loc.kind) {
    case "applications":
      return "Applications";
    case "recents":
      return "Recents";
    case "shared":
      return "Shared";
    case "home":
      return "Home";
    case "downloads":
      return "Downloads";
    case "documents":
      return "Documents";
    case "desktop":
      return "Desktop";
    case "favorites":
      return "Favorites";
    case "trash":
      return "Trash";
    case "favorite-file":
      return "Favorite";
    case "workspace":
      return "Workspace";
    case "tag":
      return loc.id.replace(/^tag:/, "");
    case "category":
      return loc.id;
  }
}

const VIEW_SUFFIX = "launchpad-view-v1";
const PREVIEW_SUFFIX = "launchpad-preview-v1";
const GROUP_SUFFIX = "launchpad-group-v1";

function isViewMode(v: unknown): v is LaunchpadViewMode {
  return v === "icon" || v === "list" || v === "column" || v === "gallery";
}

function isGroupMode(v: unknown): v is LaunchpadGroupMode {
  return v === "none" || v === "category" || v === "recent" || v === "tag";
}

interface UseLaunchpadView {
  view: LaunchpadViewMode;
  setView: (v: LaunchpadViewMode) => void;
  group: LaunchpadGroupMode;
  setGroup: (g: LaunchpadGroupMode) => void;
  location: LaunchpadLocation;
  setLocation: (loc: LaunchpadLocation) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  previewOpen: boolean;
  togglePreview: () => void;
}

export function useLaunchpadView(): UseLaunchpadView {
  const VIEW_KEY = useWorkspaceKey(VIEW_SUFFIX);
  const PREVIEW_KEY = useWorkspaceKey(PREVIEW_SUFFIX);
  const GROUP_KEY = useWorkspaceKey(GROUP_SUFFIX);
  const [view, setViewState] = useState<LaunchpadViewMode>("icon");
  const [group, setGroupState] = useState<LaunchpadGroupMode>("none");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState<LaunchpadLocation[]>([
    { kind: "applications" },
  ]);
  const [cursor, setCursor] = useState(0);

  // Hydrate persisted view mode + preview-pane state on mount. Session-only
  // history is fine — Finder also forgets back/forward across launches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw && isViewMode(raw)) setViewState(raw);
      const p = localStorage.getItem(PREVIEW_KEY);
      if (p === "1") setPreviewOpen(true);
      const g = localStorage.getItem(GROUP_KEY);
      if (g && isGroupMode(g)) setGroupState(g);
    } catch {
      /* silent — localStorage may be unavailable in private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = useCallback(
    (next: LaunchpadViewMode) => {
      setViewState(next);
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {}
    },
    [VIEW_KEY]
  );

  const setGroup = useCallback(
    (next: LaunchpadGroupMode) => {
      setGroupState(next);
      try {
        localStorage.setItem(GROUP_KEY, next);
      } catch {}
    },
    [GROUP_KEY]
  );

  // Refs so setLocation doesn't need history/cursor in its deps — that
  // re-created the callback on every navigation and (more importantly)
  // let the closure see a stale cursor when React batched updates,
  // causing the cursor to advance past the actual history slot. The
  // resulting `history[cursor]` was undefined and the view silently
  // fell back to Applications — the symptom Asad saw as "the sidebar
  // panel isn't accessible / nothing happens when I tap a row".
  const historyRef = useRef(history);
  const cursorRef = useRef(cursor);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const setLocation = useCallback((loc: LaunchpadLocation) => {
    const c = cursorRef.current;
    const prev = historyRef.current;
    // Truncate any forward history when the user navigates somewhere new
    // (mirrors browser/Finder behavior).
    const head = prev.slice(0, c + 1);
    // Don't push duplicates back-to-back. Crucially: when we dedupe,
    // we must NOT advance the cursor either, otherwise location ends
    // up pointing past the end of history and renders Applications.
    const isDuplicate =
      head.length > 0 &&
      locationKey(head[head.length - 1]) === locationKey(loc);
    if (isDuplicate) {
      // No-op. Cursor + history both stay pinned to head.
      return;
    }
    const next = [...head, loc];
    historyRef.current = next;
    cursorRef.current = c + 1;
    setHistory(next);
    setCursor(c + 1);
  }, []);

  const back = useCallback(() => {
    setCursor((c) => Math.max(0, c - 1));
  }, []);

  const forward = useCallback(() => {
    setCursor((c) => Math.min(history.length - 1, c + 1));
  }, [history.length]);

  const togglePreview = useCallback(() => {
    setPreviewOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(PREVIEW_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [PREVIEW_KEY]);

  const location = history[cursor] ?? { kind: "applications" };
  const canBack = cursor > 0;
  const canForward = cursor < history.length - 1;

  return useMemo(
    () => ({
      view,
      setView,
      group,
      setGroup,
      location,
      setLocation,
      back,
      forward,
      canBack,
      canForward,
      previewOpen,
      togglePreview,
    }),
    [
      view,
      setView,
      group,
      setGroup,
      location,
      setLocation,
      back,
      forward,
      canBack,
      canForward,
      previewOpen,
      togglePreview,
    ]
  );
}
