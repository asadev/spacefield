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

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const setLocation = useCallback((loc: LaunchpadLocation) => {
    setHistory((prev) => {
      // Truncate any forward history when the user navigates somewhere new
      // (mirrors browser/Finder behavior).
      const head = prev.slice(0, cursor + 1);
      // Don't push duplicates back-to-back.
      if (head.length > 0 && locationKey(head[head.length - 1]) === locationKey(loc)) {
        return head;
      }
      return [...head, loc];
    });
    setCursor((c) => c + 1);
  }, [cursor]);

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
