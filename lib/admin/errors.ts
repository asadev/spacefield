import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ClientErrorRow = {
  id: number;
  user_id: string | null;
  path: string;
  message: string;
  stack: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ErrorFilters = {
  path?: string;
  q?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
};

export async function listErrors(
  filters: ErrorFilters = {}
): Promise<{ rows: ClientErrorRow[]; total: number; error: string | null }> {
  try {
    const sb = createAdminClient();
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    let q = sb
      .from("client_errors")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (filters.path) q = q.ilike("path", `%${filters.path}%`);
    if (filters.q) q = q.ilike("message", `%${filters.q}%`);
    if (filters.since) q = q.gte("created_at", filters.since);
    if (filters.until) q = q.lte("created_at", filters.until);
    const { data, error, count } = await q;
    if (error) return { rows: [], total: 0, error: error.message };
    return {
      rows: (data ?? []) as ClientErrorRow[],
      total: count ?? 0,
      error: null,
    };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
