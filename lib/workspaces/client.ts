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

export function readSelectedWorkspace(): SelectedWorkspace {
  if (typeof window === "undefined") return { kind: "personal" };
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return { kind: "personal" };
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kind === "team" && parsed.id && parsed.slug) {
      return parsed as SelectedWorkspace;
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
    window.addEventListener("workspace:change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("workspace:change", onChange);
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

        const { data } = await supabase
          .from("workspace_members")
          .select(
            "role, workspace:workspaces(id, name, slug, created_by, created_at)"
          )
          .eq("user_id", userData.user.id);

        if (cancelled) return;

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

        // If current selection refers to a workspace we no longer belong to,
        // fall back to personal.
        const sel = readSelectedWorkspace();
        if (
          sel.kind === "team" &&
          !list.some((w) => w.id === sel.id)
        ) {
          writeSelectedWorkspace({ kind: "personal" });
          setCurrentState({ kind: "personal" });
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
