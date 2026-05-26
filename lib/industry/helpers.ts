/* lib/industry/helpers.ts
 *
 * Read-side utilities for industry-aware tools. None of these mutate;
 * writes go through /api/workspaces/ensure (create) and
 * /api/workspaces/update (patch).
 *
 * Split-by-runtime:
 *   - getWorkspaceIndustry  → server-only (touches @/lib/supabase/server).
 *   - getIndustryConfig     → re-export from registry (pure, sync).
 *   - industryFilter        → re-export from registry (pure, sync).
 *   - normaliseIndustry     → re-export from registry (pure, sync).
 *
 * The pure helpers live in lib/industry/registry-helpers.ts so a
 * "use client" module (hooks.ts, IndustrySection.tsx) can import them
 * without dragging in the server supabase client.
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { GENERIC_INDUSTRY } from "./types";
import type { Industry } from "./types";
import {
  getIndustryConfig as getIndustryConfigPure,
  industryFilter as industryFilterPure,
  normaliseIndustry as normaliseIndustryPure,
} from "./registry-helpers";

/**
 * Resolve the industry slug stored on a workspace.
 *
 * Returns 'generic' for null/missing rows so callers can always rely on
 * a concrete slug. If the column ever holds a value that isn't part of
 * the current enum (e.g. a slug we removed without backfilling), we
 * also normalise to 'generic' to keep the UI from crashing.
 */
export async function getWorkspaceIndustry(
  workspaceId: string
): Promise<Industry> {
  if (!workspaceId) return GENERIC_INDUSTRY;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("industry")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error || !data) return GENERIC_INDUSTRY;
    const raw = (data as { industry: string | null }).industry;
    return normaliseIndustryPure(raw);
  } catch {
    return GENERIC_INDUSTRY;
  }
}

/* Re-exports — keep the import path stable for callers who do
 * `import { getIndustryConfig } from "@/lib/industry/helpers"` even
 * though the implementation now lives in registry-helpers. */
export const getIndustryConfig = getIndustryConfigPure;
export const industryFilter = industryFilterPure;
export const normaliseIndustry = normaliseIndustryPure;
