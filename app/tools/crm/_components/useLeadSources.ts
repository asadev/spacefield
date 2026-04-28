"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Lead-sources data hook for the admin UI.
 *
 * Wraps `cachedFetch` from lib/cache/swr.ts so the panel feels instant
 * on re-open and so a fresh list reuses the in-flight promise across
 * concurrent components. After any mutation, callers `invalidate()` the
 * `/api/crm/lead-sources` prefix to bust both list + per-id caches.
 * ───────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from "react";
import { cachedFetch, invalidate } from "@/lib/cache/swr";
import type {
  CrmLeadSource,
  CrmLeadSourceEvent,
} from "@/lib/crm/lead-sources/types";

interface ListResponse {
  items: CrmLeadSource[];
}

interface EventsResponse {
  items: CrmLeadSourceEvent[];
}

export function useLeadSources(workspaceId: string | null): {
  sources: CrmLeadSource[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [sources, setSources] = useState<CrmLeadSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setSources([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/crm/lead-sources?workspace_id=${encodeURIComponent(
        workspaceId
      )}`;
      const json = await cachedFetch<ListResponse>(url);
      setSources(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sources, loading, error, reload };
}

export function useLeadSourceEvents(sourceId: string | null): {
  events: CrmLeadSourceEvent[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [events, setEvents] = useState<CrmLeadSourceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sourceId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `/api/crm/lead-sources/${sourceId}/events?limit=100`;
      const json = await cachedFetch<EventsResponse>(url);
      setEvents(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { events, loading, error, reload };
}

export function invalidateLeadSourcesCache(): void {
  invalidate({ prefix: "/api/crm/lead-sources" });
}
