/* Cached fetcher for the Launchpad's "Shared" sidebar location.
 *
 * Wraps GET /api/files/shares/incoming so the same swr cache the rest
 * of the Launchpad uses keeps share lists snappy across navigation.
 * Errors and 404s resolve to an empty list — the Shared pane shows a
 * friendly empty state rather than a stack trace.
 */

import { cachedFetch } from "@/lib/cache/swr";
import type { LaunchpadFile } from "./launchpadFiles";

export interface LaunchpadShareMeta {
  id: string;
  source_workspace_id: string;
  source_workspace_name: string | null;
  shared_by: string | null;
  shared_by_email: string | null;
  shared_by_name: string | null;
  permission: "view" | "edit";
  message: string | null;
  created_at: string;
}

export interface LaunchpadSharedFile extends LaunchpadFile {
  share: LaunchpadShareMeta;
}

interface IncomingResponse {
  items?: LaunchpadSharedFile[];
}

export const SHARES_PREFIX = "/api/files/shares";
export const SHARES_INCOMING_PREFIX = "/api/files/shares/incoming";

export async function fetchIncomingShares(opts: {
  workspaceId: string;
  limit?: number;
}): Promise<LaunchpadSharedFile[]> {
  const params = new URLSearchParams();
  params.set("workspace_id", opts.workspaceId);
  if (opts.limit) params.set("limit", String(opts.limit));
  const url = `${SHARES_INCOMING_PREFIX}?${params.toString()}`;
  try {
    const j = await cachedFetch<IncomingResponse>(url);
    return j.items ?? [];
  } catch {
    return [];
  }
}
