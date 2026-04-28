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
  /**
   * Create a new workspace and switch to it. The optional `applyAfter`
   * hook fires synchronously right after the localStorage row is written
   * and before activeId flips — used by the template system to seed
   * `ws:<id>:tools-desktop-install-v1` etc. before the Desktop remounts
   * against the new namespace. We don't import WorkspaceTemplates from
   * here directly to avoid a cycle.
   */
  createWorkspace: (
    name: string,
    applyAfter?: (id: string) => void
  ) => string;
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

/* Workspace ids must be UUIDs — public.workspaces.id is `uuid`, and so
 * are workspace_members.workspace_id, workspace_files.workspace_id etc.
 * Using non-UUID strings here causes silent upsert failures, which then
 * cascade into "0 B of 0 B" quotas and "not a member" upload errors. */
function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback for very old browsers.
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h
    .slice(6, 8)
    .join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/* One-time migration: existing localStorage workspaces whose ids aren't
 * valid UUIDs (created by the old uid() impl) get renamed in-place. We
 * also rewrite every `ws:<oldId>:*` key + the active-pointer + any
 * cross-workspace pointers we know about. After this fires the cloud
 * upsert path will actually accept the id and rows will materialise in
 * public.workspaces, fixing both the "0 B of 0 B" quota readout and
 * the membership-based upload checks. */
function migrateNonUuidIds(list: Workspace[]): Workspace[] {
  if (typeof window === "undefined") return list;
  const remap: Record<string, string> = {};
  const next = list.map((w) => {
    if (isUuid(w.id)) return w;
    const newId = uid();
    remap[w.id] = newId;
    return { ...w, id: newId };
  });
  if (Object.keys(remap).length === 0) return list;

  // Rewrite every `ws:<oldId>:*` key.
  const renames: Array<{ from: string; to: string; value: string }> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith("ws:")) continue;
    const rest = k.slice(3);
    const colon = rest.indexOf(":");
    if (colon === -1) continue;
    const oldId = rest.slice(0, colon);
    const suffix = rest.slice(colon + 1);
    const newId = remap[oldId];
    if (!newId) continue;
    const value = window.localStorage.getItem(k);
    if (value === null) continue;
    renames.push({ from: k, to: `ws:${newId}:${suffix}`, value });
  }
  for (const r of renames) {
    window.localStorage.setItem(r.to, r.value);
    window.localStorage.removeItem(r.from);
  }

  // Update the active-pointer if it pointed at an old id.
  const active = window.localStorage.getItem(ACTIVE_KEY);
  if (active && remap[active]) {
    window.localStorage.setItem(ACTIVE_KEY, remap[active]);
  }

  return next;
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
    } else {
      // Migrate any non-UUID ids left over from old uid() implementation.
      // Must run BEFORE the active-id fallback so we don't fall back to
      // a stale non-UUID id we're about to discard.
      const migrated = migrateNonUuidIds(list);
      if (migrated !== list) {
        list = migrated;
        writeJSON(LIST_KEY, list);
        active = window.localStorage.getItem(ACTIVE_KEY) || "";
      }
      if (!active || !list.find((w) => w.id === active)) {
        // Active id missing or stale — fall back to the first workspace.
        active = list[0].id;
        window.localStorage.setItem(ACTIVE_KEY, active);
      }
    }

    setWorkspaces(list);
    setActiveId(active);
    setHydrated(true);
  }, []);

  /* Whenever the desktop's active workspace changes, dispatch a custom
   * event so other parts of the app (lib/workspaces' useWorkspace hook
   * in particular) can re-resolve their state. The native `storage`
   * event only fires across tabs, so without this same-tab consumers
   * miss the change. */
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("workspace:change"));
  }, [activeId, hydrated]);

  const createWorkspace = useCallback(
    (name: string, applyAfter?: (id: string) => void) => {
      const trimmed = name.trim() || `Workspace ${Date.now()}`;
      const id = uid();
      const ws: Workspace = { id, name: trimmed, createdAt: Date.now() };
      setWorkspaces((prev) => {
        const next = [...prev, ws];
        writeJSON(LIST_KEY, next);
        return next;
      });
      // Run the post-create hook BEFORE flipping activeId so the Desktop
      // remounts against an already-seeded namespace. Without this, the
      // hooks read defaults first and the template "flashes in" a tick
      // later, jolting the dock.
      if (applyAfter) {
        try {
          applyAfter(id);
        } catch {
          /* template apply errors must not block creation */
        }
      }
      setActiveId(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_KEY, id);
      }
      // Eagerly materialize in the cloud — fire-and-forget. Without this,
      // the workspace only reaches the DB when Files Manager next opens
      // (which calls /api/workspaces/ensure). That left a window where
      // /api/me's owned-count was stale and the user could race past
      // the workspace cap. We swallow errors here because the cap-trigger
      // legitimately rejects creates beyond the tier limit, and the
      // dialog already enforces the cap client-side using the local list.
      if (typeof window !== "undefined") {
        void fetch("/api/workspaces/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: trimmed }),
        }).catch(() => {
          /* swallow — Files Manager will retry on next open */
        });
      }
      return id;
    },
    []
  );

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
      const next = prev.filter((w) => w.id !== id);
      writeJSON(LIST_KEY, next);

      // If the deleted one was active, jump to the first remaining (or
      // empty string if none remain — DesktopGate detects this and
      // surfaces the "create your first workspace" prompt).
      setActiveId((current) => {
        if (current !== id) return current;
        const fallback = next[0]?.id ?? "";
        if (typeof window !== "undefined") {
          if (fallback) {
            window.localStorage.setItem(ACTIVE_KEY, fallback);
          } else {
            window.localStorage.removeItem(ACTIVE_KEY);
          }
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
