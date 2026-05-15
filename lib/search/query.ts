import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  labelForEntity,
  type SearchGroup,
  type SearchHit,
  type SearchResponse,
} from "@/lib/search/types";

/**
 * Run the `global_search` RPC against the user's session-bound Supabase
 * client. RLS filters to documents in workspaces the caller is a
 * member of, so we don't have to filter by workspace_id here.
 *
 * Returns an empty response shape for blank queries — callers can rely
 * on `groups` always being an array.
 */
export async function runGlobalSearch(
  rawQuery: string,
  opts: { limit?: number } = {}
): Promise<SearchResponse> {
  const query = (rawQuery ?? "").trim();
  if (!query) {
    return { query: "", total: 0, groups: [] };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 30, 100));
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("global_search", {
    p_query: query,
    p_limit: limit,
  });

  if (error) {
    // Surface RPC errors as an empty result so the palette doesn't
    // crash; the caller (route handler) logs the error separately.
    throw new Error(`global_search: ${error.message}`);
  }

  const hits = ((data ?? []) as SearchHit[]).slice(0, limit);

  // Group by entity_type, preserving the rank order within each group.
  const groupMap = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const arr = groupMap.get(hit.entity_type);
    if (arr) {
      arr.push(hit);
    } else {
      groupMap.set(hit.entity_type, [hit]);
    }
  }

  // Order groups by their best-ranked hit so the most relevant
  // category bubbles to the top of the rendered list.
  const groups: SearchGroup[] = Array.from(groupMap.entries())
    .map(([kind, items]) => ({
      kind,
      label: labelForEntity(kind),
      items,
    }))
    .sort((a, b) => {
      const aTop = a.items[0]?.rank ?? 0;
      const bTop = b.items[0]?.rank ?? 0;
      return bTop - aTop;
    });

  return {
    query,
    total: hits.length,
    groups,
  };
}
