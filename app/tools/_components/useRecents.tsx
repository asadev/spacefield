"use client";

/* useRecents — workspace-scoped cross-app history.
 *
 * Records anything the user opens (tools, files) so other surfaces can show
 * a unified "Recents" view. Spotlight (Agent 3) and Files Manager (Agent 4)
 * are expected consumers — they import this hook directly.
 *
 * Storage:  ws:<workspaceId>:recents:v1   →  RecentEntry[]
 * Capacity: 50 entries, deduplicated by `${kind}:${id}` (newest wins).
 *
 * Usage:
 *   const { recents, record, clear } = useRecents();
 *   record({ kind: "tool", slug: "rent-yield" });
 *   record({ kind: "file", id: "abc123", name: "Lease.pdf" });
 *
 * The hook auto-records tool opens via the window manager (wired in
 * Desktop.tsx — `handleOpenTool` calls `record({ kind: "tool", slug })`).
 * File-opens are recorded by the Files Manager when it integrates.
 */

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

export type RecentEntry =
  | { kind: "tool"; slug: string; at: number }
  | { kind: "file"; id: string; name: string; at: number };

const STORAGE_SUFFIX = "recents:v1";
const CAP = 50;

function safeParse(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v as RecentEntry[];
  } catch {}
  return [];
}

function entryKey(e: RecentEntry): string {
  return e.kind === "tool" ? `tool:${e.slug}` : `file:${e.id}`;
}

export interface RecordToolInput {
  kind: "tool";
  slug: string;
}
export interface RecordFileInput {
  kind: "file";
  id: string;
  name: string;
}
export type RecordInput = RecordToolInput | RecordFileInput;

export function useRecents() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once. Workspace switches remount the desktop tree so this hook
  // re-mounts against the new namespace automatically.
  useEffect(() => {
    setRecents(safeParse(localStorage.getItem(STORAGE_KEY)));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
    } catch {}
  }, [recents, hydrated, STORAGE_KEY]);

  // Cross-tab + cross-component sync — when one mount writes, others refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setRecents(safeParse(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [STORAGE_KEY]);

  const record = useCallback((input: RecordInput) => {
    setRecents((prev) => {
      const at = Date.now();
      const next: RecentEntry =
        input.kind === "tool"
          ? { kind: "tool", slug: input.slug, at }
          : { kind: "file", id: input.id, name: input.name, at };
      const key = entryKey(next);
      // Dedupe: drop any existing entry with the same key, prepend the new
      // one, and cap at CAP entries.
      const filtered = prev.filter((e) => entryKey(e) !== key);
      return [next, ...filtered].slice(0, CAP);
    });
  }, []);

  const clear = useCallback(() => {
    setRecents([]);
  }, []);

  return { recents, hydrated, record, clear };
}
