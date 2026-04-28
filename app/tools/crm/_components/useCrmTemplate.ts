"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * useCrmTemplate — read + apply industry templates.
 *
 *   const { current, setCurrent, applying, available, hydrated } =
 *     useCrmTemplate(workspaceId);
 *
 *   - `current`    — id of the applied template, or null
 *   - `setCurrent` — POST /api/crm/templates/apply for the given id;
 *                    invalidates the entire `/api/crm/` cache prefix on
 *                    success so all CRM views (pipelines, stages, custom
 *                    fields, tags) re-fetch and reflect the new state.
 *   - `applying`   — true while a setCurrent call is in flight
 *   - `available`  — every template registered in `_templates/registry.ts`
 *   - `hydrated`   — true once the initial GET resolves
 *
 * Cached via cachedFetch so revisits are instant. Mutation invalidates by
 * prefix because applying a template fans out to multiple endpoints.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import { listTemplates } from "../_templates/registry";
import type { CrmTemplate } from "../_templates/types";

interface CurrentResponse {
  template_id: string | null;
  applied_at: string | null;
}

export interface UseCrmTemplateResult {
  current: string | null;
  setCurrent: (id: string) => Promise<void>;
  applying: boolean;
  available: CrmTemplate[];
  hydrated: boolean;
}

/* Module-scoped pub/sub so multiple hook instances on the same page
 * (Shell sidebar + InventoryView header + CompaniesView header + the
 * picker itself) all stay in sync without a context provider. The
 * picker's setCurrent broadcasts to every subscriber after the apply
 * call resolves. */
type Listener = (id: string | null) => void;
const listeners = new Map<string, Set<Listener>>();

function subscribe(workspaceId: string, fn: Listener): () => void {
  let set = listeners.get(workspaceId);
  if (!set) {
    set = new Set();
    listeners.set(workspaceId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

function broadcast(workspaceId: string, id: string | null): void {
  const set = listeners.get(workspaceId);
  if (!set) return;
  for (const fn of set) fn(id);
}

export function useCrmTemplate(workspaceId: string): UseCrmTemplateResult {
  const [current, setCurrentState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const j = await cachedFetch<CurrentResponse>(
          `/api/crm/templates/current?workspace_id=${workspaceId}`
        );
        if (cancelled) return;
        setCurrentState(j.template_id);
      } catch {
        if (!cancelled) setCurrentState(null);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    const unsub = subscribe(workspaceId, (id) => {
      if (!cancelled) setCurrentState(id);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [workspaceId]);

  const setCurrent = useCallback(
    async (id: string) => {
      if (!workspaceId) return;
      setApplying(true);
      try {
        const r = await fetch("/api/crm/templates/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_id: workspaceId, template_id: id }),
        });
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `apply failed (${r.status})`);
        }
        // Bust every CRM endpoint so pipelines/stages/custom-fields/tags
        // re-fetch in their respective views.
        invalidate({ prefix: "/api/crm/" });
        broadcast(workspaceId, id);
      } finally {
        setApplying(false);
      }
    },
    [workspaceId]
  );

  return {
    current,
    setCurrent,
    applying,
    available: listTemplates(),
    hydrated,
  };
}
