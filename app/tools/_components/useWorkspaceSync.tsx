"use client";

/* useWorkspaceSync — bridge between localStorage and Supabase.
 *
 * Behavior:
 *   - When the user is NOT signed in: this hook does nothing. The
 *     workspace is local-only.
 *   - When the user signs in for the first time AND has localStorage
 *     workspaces: those workspaces get uploaded to the cloud (one-time
 *     "promote local to cloud").
 *   - When the user signs in AND already has cloud workspaces: those
 *     replace localStorage. Cloud is source of truth on subsequent loads.
 *   - While signed in: any localStorage write to a workspace-scoped
 *     key is mirrored (debounced) to the cloud.
 *   - On sign-out: localStorage stays as-is (so the user can keep
 *     using the workspace offline). Sign in again to resume sync.
 *
 * Implementation:
 *   - Listens for `workspaces:list:v1` and `ws:<id>:*` keys via a
 *     storage-event proxy (same-tab writes don't fire `storage` so we
 *     also patch localStorage.setItem to dispatch a custom event).
 *   - Pushes batched diffs every 1500ms.
 *
 * Schema (created in supabase/migrations/20260426_workspace_sync.sql):
 *   public.workspaces       — { id, user_id, name, created_at, updated_at }
 *   public.workspace_state  — { workspace_id, key, value (jsonb), updated_at }
 */

import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { useWorkspaces } from "./useWorkspaces";

const SYNC_DEBOUNCE_MS = 1500;
const LIST_KEY = "workspaces:list:v1";

interface QueuedWrite {
  workspaceId: string;
  key: string;
  value: string | null; // null → delete
}

/* Same-tab storage-event channel. localStorage.setItem doesn't fire
 * `storage` events in the originating tab, so we monkey-patch it once
 * to also dispatch a CustomEvent that hooks can listen to. */
const SAME_TAB_EVENT = "spacefield:localstorage";

let patched = false;
function ensureLocalStoragePatched() {
  if (patched || typeof window === "undefined") return;
  patched = true;
  const origSet = window.localStorage.setItem.bind(window.localStorage);
  const origRemove = window.localStorage.removeItem.bind(window.localStorage);
  window.localStorage.setItem = (key: string, value: string) => {
    origSet(key, value);
    window.dispatchEvent(
      new CustomEvent(SAME_TAB_EVENT, { detail: { key, value } })
    );
  };
  window.localStorage.removeItem = (key: string) => {
    origRemove(key);
    window.dispatchEvent(
      new CustomEvent(SAME_TAB_EVENT, { detail: { key, value: null } })
    );
  };
}

/* Match keys like ws:<workspaceId>:tools-desktop-windows-v2 */
function parseWorkspaceKey(key: string): { workspaceId: string; suffix: string } | null {
  const m = key.match(/^ws:([^:]+):(.+)$/);
  if (!m) return null;
  return { workspaceId: m[1], suffix: m[2] };
}

export function useWorkspaceSync() {
  const { user, supabase, hydrated: authHydrated, enabled } = useAuth();
  const {
    workspaces,
    activeId,
    hydrated: wsHydrated,
  } = useWorkspaces();

  const queueRef = useRef<Map<string, QueuedWrite>>(new Map());
  const flushTimerRef = useRef<number | null>(null);
  const initRunRef = useRef<string | null>(null);

  // ───────────────── On sign-in: reconcile local ↔ cloud ─────────────────
  useEffect(() => {
    if (!enabled || !authHydrated || !wsHydrated) return;
    if (!user) return;
    if (initRunRef.current === user.id) return;
    initRunRef.current = user.id;

    let cancelled = false;
    (async () => {
      try {
        // Fetch existing cloud workspaces for this user.
        const { data: cloudWs, error: cloudErr } = await supabase
          .from("workspaces")
          .select("id, name, created_at, updated_at")
          .order("created_at", { ascending: true });
        if (cancelled || cloudErr) return;

        if (!cloudWs || cloudWs.length === 0) {
          // First-ever sign-in. Push local workspaces up to cloud.
          if (workspaces.length > 0) {
            const rows = workspaces.map((w) => ({
              id: w.id,
              user_id: user.id,
              name: w.name,
              created_at: new Date(w.createdAt).toISOString(),
            }));
            await supabase.from("workspaces").upsert(rows);

            // Also push every ws:<id>:* localStorage key.
            const stateRows: Array<{
              workspace_id: string;
              key: string;
              value: unknown;
            }> = [];
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              if (!k) continue;
              const parsed = parseWorkspaceKey(k);
              if (!parsed) continue;
              const raw = window.localStorage.getItem(k);
              if (raw === null) continue;
              let value: unknown = raw;
              try {
                value = JSON.parse(raw);
              } catch {
                /* keep as string */
              }
              stateRows.push({
                workspace_id: parsed.workspaceId,
                key: parsed.suffix,
                value,
              });
            }
            if (stateRows.length > 0) {
              await supabase.from("workspace_state").upsert(stateRows);
            }
          }
        } else {
          // Cloud has data — pull down and overwrite local.
          // Track whether anything actually changed so we don't reload
          // on every mount in an infinite loop. (useRef guard resets
          // when window.location.reload() runs, so the only way to
          // break the loop is to detect a no-op and skip the reload.
          // Asad caught this 2026-05-27 — page was auto-refreshing
          // constantly on his desktop.)
          let anythingChanged = false;

          // 1. Replace workspaces:list:v1 with cloud workspaces (only if differs).
          const cloudList = cloudWs.map((w) => ({
            id: w.id,
            name: w.name,
            createdAt: new Date(w.created_at).getTime(),
          }));
          const newListJson = JSON.stringify(cloudList);
          if (window.localStorage.getItem(LIST_KEY) !== newListJson) {
            window.localStorage.setItem(LIST_KEY, newListJson);
            anythingChanged = true;
          }

          // 2. Pull workspace_state rows in batches.
          const ids = cloudWs.map((w) => w.id);
          const { data: stateRows } = await supabase
            .from("workspace_state")
            .select("workspace_id, key, value")
            .in("workspace_id", ids);
          if (stateRows) {
            for (const row of stateRows) {
              const k = `ws:${row.workspace_id}:${row.key}`;
              const v =
                typeof row.value === "string"
                  ? row.value
                  : JSON.stringify(row.value);
              if (window.localStorage.getItem(k) !== v) {
                window.localStorage.setItem(k, v);
                anythingChanged = true;
              }
            }
          }

          // Belt-and-suspenders: a sessionStorage flag prevents the
          // reload-loop even if a future caller bypasses the diff
          // check above. Cleared on sign-out / tab close naturally.
          const RELOAD_GUARD = `spacefield:ws-sync-reloaded:${user.id}`;
          if (
            anythingChanged &&
            !cancelled &&
            !window.sessionStorage.getItem(RELOAD_GUARD)
          ) {
            window.sessionStorage.setItem(RELOAD_GUARD, "1");
            window.location.reload();
          }
        }
      } catch (err) {
        // Sync failures are non-fatal — workspace still works locally.
        console.error("[spacefield-sync] reconcile failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally don't depend on `workspaces` here — reconcile
    // runs once per sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase, authHydrated, wsHydrated, enabled]);

  // ───────────────── Live mirror: localStorage → cloud ─────────────────
  useEffect(() => {
    if (!enabled || !user) return;
    ensureLocalStoragePatched();

    const flush = async () => {
      if (queueRef.current.size === 0) return;
      const writes = Array.from(queueRef.current.values());
      queueRef.current.clear();

      const upserts: Array<{
        workspace_id: string;
        key: string;
        value: unknown;
      }> = [];
      const deletes: Array<{ workspace_id: string; key: string }> = [];
      for (const w of writes) {
        if (w.value === null) {
          deletes.push({ workspace_id: w.workspaceId, key: w.key });
        } else {
          let value: unknown = w.value;
          try {
            value = JSON.parse(w.value);
          } catch {
            /* string */
          }
          upserts.push({
            workspace_id: w.workspaceId,
            key: w.key,
            value,
          });
        }
      }

      try {
        if (upserts.length > 0) {
          await supabase.from("workspace_state").upsert(upserts);
        }
        for (const d of deletes) {
          await supabase
            .from("workspace_state")
            .delete()
            .eq("workspace_id", d.workspace_id)
            .eq("key", d.key);
        }
      } catch (err) {
        console.error("[spacefield-sync] flush failed:", err);
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void flush();
      }, SYNC_DEBOUNCE_MS);
    };

    const onLocalWrite = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: string | null }>).detail;
      if (!detail || !detail.key) return;
      // Workspace state writes — queue per-key.
      const parsed = parseWorkspaceKey(detail.key);
      if (parsed) {
        queueRef.current.set(detail.key, {
          workspaceId: parsed.workspaceId,
          key: parsed.suffix,
          value: detail.value,
        });
        scheduleFlush();
        return;
      }

      // Workspaces list write — sync to public.workspaces.
      if (detail.key === LIST_KEY && detail.value) {
        try {
          const list: Array<{ id: string; name: string; createdAt: number }> =
            JSON.parse(detail.value);
          const rows = list.map((w) => ({
            id: w.id,
            user_id: user.id,
            name: w.name,
            created_at: new Date(w.createdAt).toISOString(),
          }));
          void supabase.from("workspaces").upsert(rows);
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener(SAME_TAB_EVENT, onLocalWrite);
    return () => {
      window.removeEventListener(SAME_TAB_EVENT, onLocalWrite);
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Best-effort flush on unmount.
      void flush();
    };
  }, [user, supabase, enabled]);

  // Suppress unused warnings for fields we keep available for extension.
  void activeId;
}
