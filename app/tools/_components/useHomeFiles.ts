"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceKey } from "./useWorkspaces";

/* Files (from the user's workspace storage) pinned as draggable shortcuts
 * on the desktop home. The actual bytes live where they always live —
 * Cloudflare R2 + the workspace_files table — this only stores the
 * fileId + display metadata + a x,y position. Clicking a home-file
 * opens it in the matching editor (Documents/Sheets) when there is one;
 * for other types it opens the inline preview via Files Manager.
 *
 * Storage format:
 *   {
 *     "<fileId>": {
 *       x, y,
 *       name, contentType, editorSlug?: "documents" | "sheets" | null,
 *       pinnedAt: number (epoch ms)
 *     }
 *   }
 */

const STORAGE_SUFFIX = "tools-desktop-home-files-v1";
const CHANGE_EVENT = "tools-desktop-home-files-change";

export interface HomeFileEntry {
  x: number;
  y: number;
  name: string;
  contentType: string;
  editorSlug: "documents" | "sheets" | null;
  pinnedAt: number;
}

function load(storageKey: string): Record<string, HomeFileEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, HomeFileEntry> = {};
    for (const [id, val] of Object.entries(parsed)) {
      const v = val as Partial<HomeFileEntry> | null;
      if (
        v &&
        typeof v === "object" &&
        typeof v.x === "number" &&
        typeof v.y === "number" &&
        typeof v.name === "string"
      ) {
        out[id] = {
          x: v.x,
          y: v.y,
          name: v.name,
          contentType: typeof v.contentType === "string" ? v.contentType : "",
          editorSlug:
            v.editorSlug === "documents" || v.editorSlug === "sheets"
              ? v.editorSlug
              : null,
          pinnedAt: typeof v.pinnedAt === "number" ? v.pinnedAt : Date.now(),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save(storageKey: string, files: Record<string, HomeFileEntry>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(files));
  } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function useHomeFiles() {
  const STORAGE_KEY = useWorkspaceKey(STORAGE_SUFFIX);
  const [files, setFiles] = useState<Record<string, HomeFileEntry>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFiles(load(STORAGE_KEY));
    setHydrated(true);
    const onChange = () => setFiles(load(STORAGE_KEY));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [STORAGE_KEY]);

  const pin = useCallback(
    (
      entry: Omit<HomeFileEntry, "pinnedAt"> & { fileId: string }
    ) => {
      const { fileId, ...rest } = entry;
      setFiles((prev) => {
        const next = {
          ...prev,
          [fileId]: { ...rest, pinnedAt: Date.now() },
        };
        save(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const move = useCallback(
    (fileId: string, x: number, y: number) => {
      setFiles((prev) => {
        if (!prev[fileId]) return prev;
        const next = { ...prev, [fileId]: { ...prev[fileId], x, y } };
        save(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  const remove = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        if (!(fileId in prev)) return prev;
        const next = { ...prev };
        delete next[fileId];
        save(STORAGE_KEY, next);
        return next;
      });
    },
    [STORAGE_KEY]
  );

  return { files, hydrated, pin, move, remove };
}

export const HOME_FILE_DROP_EVENT = "spacefield:home-file-drop";

export interface HomeFileDropEventDetail {
  fileId: string;
  name: string;
  contentType: string;
  editorSlug: "documents" | "sheets" | null;
  x: number;
  y: number;
}
