"use client";

/* LaunchpadFavorites — small helper hook around the
 * /api/files/favorites endpoint.
 *
 *   const { favorites, loading, refresh, toggle } = useLaunchpadFavorites(workspaceId);
 *
 * Reads use cachedFetch so the sidebar populates from cache instantly
 * across navigation. Writes call the API and bust the cache prefix so
 * subsequent reads (this hook + the Favorites view) see the new state.
 */

import { useCallback, useEffect, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import type { LaunchpadFile } from "./launchpadFiles";

export const FAVORITES_PREFIX = "/api/files/favorites";

interface FavoritesResponse {
  items?: LaunchpadFile[];
}

export interface UseLaunchpadFavorites {
  favorites: LaunchpadFile[];
  loading: boolean;
  refresh: () => void;
  toggle: (file: LaunchpadFile) => Promise<boolean>;
  isStarred: (fileId: string) => boolean;
}

export function useLaunchpadFavorites(
  workspaceId: string
): UseLaunchpadFavorites {
  const [favorites, setFavorites] = useState<LaunchpadFile[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!workspaceId) {
      setFavorites([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const j = await cachedFetch<FavoritesResponse>(
          `${FAVORITES_PREFIX}?workspace_id=${encodeURIComponent(workspaceId)}`
        );
        if (cancelled) return;
        setFavorites(Array.isArray(j.items) ? j.items : []);
      } catch {
        if (cancelled) return;
        setFavorites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, tick]);

  const refresh = useCallback(() => {
    invalidate({ prefix: FAVORITES_PREFIX });
    setTick((n) => n + 1);
  }, []);

  const toggle = useCallback(
    async (file: LaunchpadFile): Promise<boolean> => {
      if (!workspaceId) return false;
      const currentlyStarred = (favorites ?? []).some((f) => f.id === file.id);
      // Optimistic update.
      setFavorites((prev) => {
        const list = prev ?? [];
        if (currentlyStarred) {
          return list.filter((f) => f.id !== file.id);
        }
        return [file, ...list.filter((f) => f.id !== file.id)];
      });
      try {
        if (currentlyStarred) {
          await fetch(
            `${FAVORITES_PREFIX}?file_id=${encodeURIComponent(file.id)}`,
            { method: "DELETE" }
          );
        } else {
          await fetch(FAVORITES_PREFIX, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file_id: file.id,
              workspace_id: workspaceId,
            }),
          });
        }
      } catch {
        // Roll back on transport error.
        setFavorites((prev) => {
          const list = prev ?? [];
          if (currentlyStarred) {
            return [file, ...list.filter((f) => f.id !== file.id)];
          }
          return list.filter((f) => f.id !== file.id);
        });
        return currentlyStarred;
      }
      invalidate({ prefix: FAVORITES_PREFIX });
      return !currentlyStarred;
    },
    [workspaceId, favorites]
  );

  const isStarred = useCallback(
    (fileId: string): boolean =>
      (favorites ?? []).some((f) => f.id === fileId),
    [favorites]
  );

  return {
    favorites: favorites ?? [],
    loading: favorites === null,
    refresh,
    toggle,
    isStarred,
  };
}
