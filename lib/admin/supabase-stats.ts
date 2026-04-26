import "server-only";
import { createClient } from "@/lib/supabase/server";

export type TableStat = {
  table: string;
  count: number | null;
  lastCreatedAt: string | null;
  error?: string;
};

const TABLES = [
  "profiles",
  "posts",
  "events",
  "xp_events",
  "achievements",
  "blog_comments",
  "event_rsvps",
] as const;

export async function getSupabaseStats(): Promise<TableStat[]> {
  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return TABLES.map((t) => ({ table: t, count: null, lastCreatedAt: null, error: err }));
  }

  const results = await Promise.all(
    TABLES.map(async (table) => {
      const stat: TableStat = { table, count: null, lastCreatedAt: null };
      try {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        if (error) {
          stat.error = error.message;
        } else {
          stat.count = count ?? 0;
        }
      } catch (e) {
        stat.error = e instanceof Error ? e.message : String(e);
      }

      if (!stat.error) {
        try {
          const { data } = await supabase
            .from(table)
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1);
          const row = data?.[0] as { created_at?: string } | undefined;
          if (row?.created_at) stat.lastCreatedAt = row.created_at;
        } catch {
          // column may not exist — fine
        }
      }
      return stat;
    })
  );
  return results;
}
