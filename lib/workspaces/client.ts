"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  SelectedWorkspace,
  WorkspaceRole,
  WorkspaceWithRole,
} from "./types";
import { WORKSPACE_STORAGE_KEY } from "./types";

// ---------- current workspace (localStorage-backed) ----------

/* The desktop's currently-active workspace id. We look at this first so
 * tools (CRM, Files, etc.) automatically operate on whatever workspace
 * the user is "in" on the desktop, instead of forcing them to pick a
 * separate selection per-tool. The id is materialized in Supabase by
 * the desktop's createWorkspace() flow via /api/workspaces/ensure, so
 * it's always a valid workspace_id when present. */
const DESKTOP_ACTIVE_WORKSPACE_KEY = "workspaces:active:v1";

function readDesktopActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(DESKTOP_ACTIVE_WORKSPACE_KEY);
    return v && typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export function readSelectedWorkspace(): SelectedWorkspace {
  if (typeof window === "undefined") return { kind: "personal" };
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.kind === "team" && parsed.id && parsed.slug) {
        return parsed as SelectedWorkspace;
      }
    }
    return { kind: "personal" };
  } catch {
    return { kind: "personal" };
  }
}

export function writeSelectedWorkspace(next: SelectedWorkspace) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("workspace:change"));
  } catch {
    /* ignore */
  }
}

// Hook: current workspace + user's workspaces list. Works signed-out.
export function useWorkspace(): {
  current: SelectedWorkspace;
  setCurrent: (next: SelectedWorkspace) => void;
  workspaces: WorkspaceWithRole[];
  signedIn: boolean;
  loading: boolean;
} {
  const [current, setCurrentState] = useState<SelectedWorkspace>({
    kind: "personal",
  });
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCurrentState(readSelectedWorkspace());
    const onChange = () => setCurrentState(readSelectedWorkspace());
    /* When the desktop switches workspaces, reset our team selection
     * and let the next load pass auto-promote the new desktop active
     * workspace. The desktop emits "workspace:change" via
     * useWorkspaces.tsx whenever activeId mutates. */
    const onDesktopSwitch = () => {
      const desktopId = readDesktopActiveId();
      const sel = readSelectedWorkspace();
      if (sel.kind === "team" && desktopId && desktopId !== sel.id) {
        // Drop the stale selection. The next reload pass will pick up
        // the new desktop active id and promote it to team.
        writeSelectedWorkspace({ kind: "personal" });
        setCurrentState({ kind: "personal" });
      }
    };
    window.addEventListener("workspace:change", onChange);
    window.addEventListener("workspace:change", onDesktopSwitch);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("workspace:change", onChange);
      window.removeEventListener("workspace:change", onDesktopSwitch);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          if (!cancelled) {
            setSignedIn(false);
            setWorkspaces([]);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) setSignedIn(true);

        /* The workspaces table uses `user_id` (creator) — older code
         * referenced a `created_by` column that never existed in the
         * schema, which made this whole query error out and the
         * workspaces list come back empty for every signed-in user.
         * We alias user_id → created_by here so the rest of the type
         * shape stays the same. */
        const { data, error } = await supabase
          .from("workspace_members")
          .select(
            "role, workspace:workspaces(id, name, slug, created_by:user_id, created_at)"
          )
          .eq("user_id", userData.user.id);

        if (cancelled) return;
        if (error) {
          // Surface in dev consoles but don't break the UI — fall
          // through to an empty list and let the auto-resolve drop
          // back to personal.
          // eslint-disable-next-line no-console
          console.warn("[workspaces] list query failed:", error.message);
        }

        type Row = {
          role: WorkspaceRole;
          workspace:
            | {
                id: string;
                name: string;
                slug: string;
                created_by: string | null;
                created_at: string;
              }
            | {
                id: string;
                name: string;
                slug: string;
                created_by: string | null;
                created_at: string;
              }[]
            | null;
        };

        const rows = (data ?? []) as Row[];
        const list: WorkspaceWithRole[] = [];
        for (const r of rows) {
          const w = Array.isArray(r.workspace) ? r.workspace[0] : r.workspace;
          if (!w) continue;
          list.push({ ...w, role: r.role });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setWorkspaces(list);

        // Auto-resolve `current` against the desktop's active workspace.
        // Personal vs team is no longer a meaningful distinction for
        // tools — every workspace the user is "in" on the desktop is a
        // valid Supabase row they own. We promote the desktop's active
        // id to a team selection automatically so tools never sit on a
        // dead-end "pick a workspace" screen.
        const sel = readSelectedWorkspace();
        if (sel.kind === "team") {
          if (!list.some((w) => w.id === sel.id)) {
            // Stale selection (workspace deleted / left). Try the desktop's
            // active id; if that also isn't in our list, fall back to the
            // first workspace we belong to (or personal if there are none).
            const desktopId = readDesktopActiveId();
            const target =
              (desktopId && list.find((w) => w.id === desktopId)) ||
              list[0] ||
              null;
            if (target) {
              const next: SelectedWorkspace = {
                kind: "team",
                id: target.id,
                slug: target.slug,
                name: target.name,
                role: target.role,
              };
              writeSelectedWorkspace(next);
              setCurrentState(next);
            } else {
              writeSelectedWorkspace({ kind: "personal" });
              setCurrentState({ kind: "personal" });
            }
          }
        } else {
          // No team selected. Promote the desktop's active workspace if
          // it's one we belong to; otherwise the first workspace in the
          // list. This is the path that fixes the CRM's old "Pick a
          // workspace" dead-end for solo users.
          const desktopId = readDesktopActiveId();
          const target =
            (desktopId && list.find((w) => w.id === desktopId)) ||
            list[0] ||
            null;
          if (target) {
            const next: SelectedWorkspace = {
              kind: "team",
              id: target.id,
              slug: target.slug,
              name: target.name,
              role: target.role,
            };
            writeSelectedWorkspace(next);
            setCurrentState(next);
          }
        }
      } catch {
        if (!cancelled) {
          setSignedIn(false);
          setWorkspaces([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrent = useCallback((next: SelectedWorkspace) => {
    writeSelectedWorkspace(next);
    setCurrentState(next);
  }, []);

  return { current, setCurrent, workspaces, signedIn, loading };
}

// Client-side load for workspace_data — used by tools that need fresh values
// in the browser. Server-side readers should prefer loadWorkspaceData from
// ./server.ts.
export async function loadWorkspaceDataClient<T = unknown>(
  workspaceId: string,
  namespace: string,
  key: string
): Promise<T | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("workspace_data")
      .select("value")
      .eq("workspace_id", workspaceId)
      .eq("namespace", namespace)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.value as T) ?? null;
  } catch {
    return null;
  }
}

// Lightweight signed-in probe for pages that fall back gracefully.
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setSignedIn(Boolean(data.user));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return signedIn;
}
