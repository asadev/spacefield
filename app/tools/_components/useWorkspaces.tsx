"use client";

/* Multi-workspace context for the desktop OS.
 *
 * A workspace is a named, isolated copy of the desktop state — its own
 * windows, dock pin order, widgets, wallpaper, installed apps, icon style,
 * etc. Theme is global (light/dark sticks across workspaces).
 *
 * Storage:
 *   - workspaces:list:v1   → Workspace[]
 *   - workspaces:active:v1 → string (active workspace id)
 *   - ws:<id>:<key>        → per-workspace state (windows, dock, widgets...)
 *
 * Migration:
 *   On first mount with no workspaces:list:v1, we create a default
 *   workspace named "Personal" and copy any legacy global desktop keys
 *   (tools-desktop-windows-v2 etc.) into the ws:<id>:* namespace so the
 *   user keeps everything they had.
 *
 * The Desktop component is keyed on activeId → switching workspaces
 * remounts the whole tree, forcing every hook to re-read storage from
 * the new namespace. No surgery needed in individual hooks beyond
 * routing their storage key through useWorkspaceKey().
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeId: string;
  active: Workspace;
  hydrated: boolean;
  createWorkspace: (name: string) => string;
  switchWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
}

const LIST_KEY = "workspaces:list:v1";
const ACTIVE_KEY = "workspaces:active:v1";

/* Legacy keys that lived in the global localStorage before workspaces
 * existed. On first migration they get copied into the default workspace's
 * namespace so the user doesn't lose anything. */
const LEGACY_KEYS = [
  "tools-desktop-windows-v1",
  "tools-desktop-windows-v2",
  "tools-desktop-widgets-v2",
  "tools-desktop-widgets-v3",
  "tools-desktop-dock-order-v1",
  "tools-desktop-install-v1",
  "tools-desktop-wallpaper-v1",
  "tools-desktop-icon-style-v1",
  "tools-desktop-sound-v1",
  "tools-desktop-notifications-v1",
  "tools-desktop-hot-corners-v1",
  "tools-desktop-hot-corner-actions-v1",
  "tools-desktop-accent-v1",
  "tools-desktop-onboarded-v1",
] as const;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage quota errors */
  }
}

/** Per-workspace storage key helper. Use anywhere inside the desktop tree. */
export function workspaceKey(workspaceId: string, key: string): string {
  return `ws:${workspaceId}:${key}`;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaces must be used inside <WorkspaceProvider>");
  }
  return ctx;
}

/** Returns a key prefixed with the active workspace id. Use inside hooks. */
export function useWorkspaceKey(suffix: string): string {
  const { activeId } = useWorkspaces();
  return workspaceKey(activeId, suffix);
}

interface ProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: ProviderProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // First-mount hydration + migration
  useEffect(() => {
    if (typeof window === "undefined") return;
    let list = readJSON<Workspace[]>(LIST_KEY, []);
    let active = window.localStorage.getItem(ACTIVE_KEY) || "";

    if (list.length === 0) {
      // First-ever visit OR migration from pre-workspace world.
      const id = uid();
      const ws: Workspace = {
        id,
        name: "Personal",
        createdAt: Date.now(),
      };
      list = [ws];
      active = id;

      // Migrate legacy keys to ws:<id>:* — leaves originals in place so
      // users with multiple devices/tabs don't accidentally lose state.
      for (const k of LEGACY_KEYS) {
        const val = window.localStorage.getItem(k);
        if (val !== null) {
          window.localStorage.setItem(workspaceKey(id, k), val);
        }
      }

      writeJSON(LIST_KEY, list);
      window.localStorage.setItem(ACTIVE_KEY, id);
    } else if (!active || !list.find((w) => w.id === active)) {
      // Active id missing or stale — fall back to the first workspace.
      active = list[0].id;
      window.localStorage.setItem(ACTIVE_KEY, active);
    }

    setWorkspaces(list);
    setActiveId(active);
    setHydrated(true);
  }, []);

  const createWorkspace = useCallback((name: string) => {
    const trimmed = name.trim() || `Workspace ${Date.now()}`;
    const id = uid();
    const ws: Workspace = { id, name: trimmed, createdAt: Date.now() };
    setWorkspaces((prev) => {
      const next = [...prev, ws];
      writeJSON(LIST_KEY, next);
      return next;
    });
    setActiveId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_KEY, id);
    }
    return id;
  }, []);

  const switchWorkspace = useCallback((id: string) => {
    setActiveId((current) => {
      if (current === id) return current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_KEY, id);
      }
      return id;
    });
  }, []);

  const renameWorkspace = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkspaces((prev) => {
      const next = prev.map((w) =>
        w.id === id ? { ...w, name: trimmed } : w
      );
      writeJSON(LIST_KEY, next);
      return next;
    });
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => {
      // Never delete the only remaining workspace.
      if (prev.length <= 1) return prev;
      const next = prev.filter((w) => w.id !== id);
      writeJSON(LIST_KEY, next);

      // If the deleted one was active, jump to the first remaining.
      setActiveId((current) => {
        if (current !== id) return current;
        const fallback = next[0].id;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(ACTIVE_KEY, fallback);
        }
        return fallback;
      });

      // Best-effort cleanup of the deleted workspace's keys.
      if (typeof window !== "undefined") {
        const prefix = `ws:${id}:`;
        const toRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        toRemove.forEach((k) => window.localStorage.removeItem(k));
      }

      return next;
    });
  }, []);

  const active = useMemo(
    () =>
      workspaces.find((w) => w.id === activeId) ??
      workspaces[0] ?? {
        id: "",
        name: "Personal",
        createdAt: Date.now(),
      },
    [workspaces, activeId]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeId,
      active,
      hydrated,
      createWorkspace,
      switchWorkspace,
      renameWorkspace,
      deleteWorkspace,
    }),
    [
      workspaces,
      activeId,
      active,
      hydrated,
      createWorkspace,
      switchWorkspace,
      renameWorkspace,
      deleteWorkspace,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
