"use client";

/* lib/industry/hooks.ts
 *
 * React hooks for industry-aware tools running on the client.
 *
 * useWorkspaceIndustry({ workspaceId }) returns the current workspace's
 * industry plus a setter that PATCHes through /api/workspaces/update.
 *
 * Why fetch via supabase-js directly:
 *   - The desktop already mints a Supabase browser client and pipes the
 *     user's JWT through it; RLS lets the workspace owner/admin/member
 *     read the row, which is the same access we already grant for the
 *     name/description fields.
 *   - There's no `/api/workspaces/[id]` GET route to wrap, and adding
 *     one would duplicate what RLS already enforces.
 */

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { normaliseIndustry } from "./registry-helpers";
import { GENERIC_INDUSTRY } from "./types";
import type { Industry } from "./types";

export interface UseWorkspaceIndustryResult {
  industry: Industry;
  /** True until the first fetch resolves (or fails). */
  loading: boolean;
  /** Network or RLS error, null if last fetch succeeded. */
  error: string | null;
  /** Re-fetch the current value. */
  refresh: () => Promise<void>;
  /** PATCH /api/workspaces/update with `{ industry }`. */
  setIndustry: (next: Industry) => Promise<void>;
}

const STORAGE_EVENT = "workspace:industry-change";

interface WorkspaceIndustryChangeDetail {
  workspaceId: string;
  industry: Industry;
}

function emitIndustryChange(detail: WorkspaceIndustryChangeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceIndustryChangeDetail>(STORAGE_EVENT, { detail })
  );
}

/**
 * Subscribe to a workspace's `industry` column.
 *
 * If `workspaceId` is falsy/null (e.g. the user is on a personal
 * workspace), the hook short-circuits to `industry = 'generic'` with
 * loading=false and a no-op setter — tools can render their generic
 * defaults without special-casing the personal flow.
 */
export function useWorkspaceIndustry(
  workspaceId: string | null | undefined
): UseWorkspaceIndustryResult {
  const [industry, setLocalIndustry] = useState<Industry>(GENERIC_INDUSTRY);
  const [loading, setLoading] = useState<boolean>(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLocalIndustry(GENERIC_INDUSTRY);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: dbErr } = await supabase
        .from("workspaces")
        .select("industry")
        .eq("id", workspaceId)
        .maybeSingle();
      if (dbErr) throw dbErr;
      const raw = (data as { industry: string | null } | null)?.industry ?? null;
      setLocalIndustry(normaliseIndustry(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load industry.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* Cross-component sync: when any caller updates the industry, every
   * other hook instance pointing at the same workspace updates too. */
  useEffect(() => {
    if (!workspaceId) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<WorkspaceIndustryChangeDetail>).detail;
      if (detail?.workspaceId === workspaceId) {
        setLocalIndustry(detail.industry);
      }
    };
    window.addEventListener(STORAGE_EVENT, onChange);
    return () => window.removeEventListener(STORAGE_EVENT, onChange);
  }, [workspaceId]);

  const setIndustry = useCallback(
    async (next: Industry) => {
      if (!workspaceId) return;
      setError(null);
      const previous = industry;
      // Optimistic update — revert on failure.
      setLocalIndustry(next);
      emitIndustryChange({ workspaceId, industry: next });
      try {
        const res = await fetch("/api/workspaces/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, industry: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Update failed (${res.status})`);
        }
      } catch (err) {
        setLocalIndustry(previous);
        emitIndustryChange({ workspaceId, industry: previous });
        const msg = err instanceof Error ? err.message : "Update failed.";
        setError(msg);
        throw err;
      }
    },
    [workspaceId, industry]
  );

  return { industry, loading, error, refresh, setIndustry };
}
