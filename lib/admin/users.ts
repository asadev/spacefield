import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  joined_at: string | null;
  banned: boolean;
  total_xp: number;
  post_count: number;
  reply_count: number;
};

export type UserDetail = AdminUserRow & {
  title: string | null;
  bio: string | null;
  specialties: string[];
  areas: string[];
  avatar_url: string | null;
  last_active_at: string | null;
  level: number;
  recentPosts: Array<{
    id: string;
    content: string;
    category: string;
    created_at: string;
    deleted_at: string | null;
  }>;
  recentReplies: Array<{
    id: string;
    content: string;
    post_id: string;
    created_at: string;
  }>;
  recentXp: Array<{
    id: string;
    amount: number | null;
    reason: string | null;
    created_at: string;
  }>;
  recentNotifications: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    href: string | null;
    read: boolean;
    created_at: string;
  }>;
  toolUsage: Array<{
    path: string;
    count: number;
    last_at: string;
  }>;
};

/**
 * Search profiles by name / email / id substring. Returns up to 100 rows with
 * aggregated counts pulled server-side. Counts are best-effort — if a table is
 * missing, that user's count falls back to 0.
 */
export async function searchUsers(
  query: string
): Promise<{ rows: AdminUserRow[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const q = query.trim();
    let sel = supabase
      .from("profiles")
      .select("id, name, email, company, joined_at, banned")
      .order("joined_at", { ascending: false })
      .limit(100);
    if (q) {
      // Search name/email/id. UUID matches are exact via eq.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        q
      );
      if (isUuid) {
        sel = sel.eq("id", q);
      } else {
        const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
        sel = sel.or(`name.ilike.${like},email.ilike.${like}`);
      }
    }
    const { data, error } = await sel;
    if (error) return { rows: [], error: error.message };

    const profiles = (data ?? []) as Array<{
      id: string;
      name: string | null;
      email: string | null;
      company: string | null;
      joined_at: string | null;
      banned?: boolean | null;
    }>;
    if (profiles.length === 0) return { rows: [], error: null };

    const ids = profiles.map((p) => p.id);

    const [postCounts, replyCounts, xpTotals] = await Promise.all([
      countByAuthor(supabase, "feed_posts", "author_id", ids),
      countByAuthor(supabase, "feed_replies", "author_id", ids),
      sumXp(supabase, ids),
    ]);

    const rows: AdminUserRow[] = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      company: p.company,
      joined_at: p.joined_at,
      banned: Boolean(p.banned),
      total_xp: xpTotals.get(p.id) ?? 0,
      post_count: postCounts.get(p.id) ?? 0,
      reply_count: replyCounts.get(p.id) ?? 0,
    }));
    return { rows, error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function countByAuthor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  col: string,
  ids: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data, error } = await supabase
      .from(table)
      .select(col)
      .in(col, ids);
    if (error || !data) return out;
    for (const row of data as unknown as Array<Record<string, string>>) {
      const k = row[col];
      if (!k) continue;
      out.set(k, (out.get(k) ?? 0) + 1);
    }
  } catch {
    // table might be missing — return empty map
  }
  return out;
}

async function sumXp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const { data, error } = await supabase
      .from("xp_events")
      .select("user_id, amount")
      .in("user_id", ids);
    if (error || !data) return out;
    for (const row of data as Array<{
      user_id: string;
      amount: number | null;
    }>) {
      if (!row.user_id) continue;
      out.set(row.user_id, (out.get(row.user_id) ?? 0) + (row.amount ?? 0));
    }
  } catch {
    // xp table may not exist
  }
  return out;
}

export async function getUserDetail(
  id: string
): Promise<{ row: UserDetail | null; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, name, email, company, title, bio, specialties, areas, avatar_url, joined_at, banned"
      )
      .eq("id", id)
      .maybeSingle();
    if (profErr) return { row: null, error: profErr.message };
    if (!profile) return { row: null, error: null };

    const p = profile as {
      id: string;
      name: string | null;
      email: string | null;
      company: string | null;
      title: string | null;
      bio: string | null;
      specialties: string[] | null;
      areas: string[] | null;
      avatar_url: string | null;
      joined_at: string | null;
      banned?: boolean | null;
    };

    const [posts, replies, xp, notifs, tools] = await Promise.all([
      fetchRecentPosts(supabase, id),
      fetchRecentReplies(supabase, id),
      fetchRecentXp(supabase, id),
      fetchRecentNotifications(supabase, id),
      fetchToolUsage(supabase, id),
    ]);

    const totalXp = xp.reduce((s, x) => s + (x.amount ?? 0), 0);
    const level = Math.max(1, Math.floor(Math.sqrt(Math.max(0, totalXp) / 100)));
    const lastActive = [
      ...posts.map((x) => x.created_at),
      ...replies.map((x) => x.created_at),
      ...xp.map((x) => x.created_at),
      ...tools.map((x) => x.last_at),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    const row: UserDetail = {
      id: p.id,
      name: p.name,
      email: p.email,
      company: p.company,
      title: p.title,
      bio: p.bio,
      specialties: p.specialties ?? [],
      areas: p.areas ?? [],
      avatar_url: p.avatar_url,
      joined_at: p.joined_at,
      banned: Boolean(p.banned),
      total_xp: totalXp,
      level,
      last_active_at: lastActive,
      post_count: posts.length,
      reply_count: replies.length,
      recentPosts: posts,
      recentReplies: replies,
      recentXp: xp,
      recentNotifications: notifs,
      toolUsage: tools,
    };
    return { row, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchRecentPosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string
): Promise<UserDetail["recentPosts"]> {
  try {
    const { data, error } = await supabase
      .from("feed_posts")
      .select("id, content, category, created_at, deleted_at")
      .eq("author_id", authorId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as UserDetail["recentPosts"];
  } catch {
    return [];
  }
}

async function fetchRecentNotifications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserDetail["recentNotifications"]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, href, read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as UserDetail["recentNotifications"];
  } catch {
    return [];
  }
}

async function fetchToolUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserDetail["toolUsage"]> {
  try {
    const { data, error } = await supabase
      .from("page_views")
      .select("path, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error || !data) return [];
    const tools = data.filter(
      (r: { path: string }) =>
        r.path && (r.path.includes("/tool") || r.path.startsWith("/solutions/"))
    ) as Array<{ path: string; created_at: string }>;
    const agg = new Map<string, { count: number; last_at: string }>();
    for (const r of tools) {
      const cur = agg.get(r.path) ?? { count: 0, last_at: r.created_at };
      cur.count += 1;
      if (r.created_at > cur.last_at) cur.last_at = r.created_at;
      agg.set(r.path, cur);
    }
    return [...agg.entries()]
      .map(([path, v]) => ({ path, count: v.count, last_at: v.last_at }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  } catch {
    return [];
  }
}

async function fetchRecentReplies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authorId: string
): Promise<UserDetail["recentReplies"]> {
  try {
    const { data, error } = await supabase
      .from("feed_replies")
      .select("id, content, post_id, created_at")
      .eq("author_id", authorId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !data) return [];
    return data as UserDetail["recentReplies"];
  } catch {
    return [];
  }
}

async function fetchRecentXp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<UserDetail["recentXp"]> {
  try {
    const { data, error } = await supabase
      .from("xp_events")
      .select("id, amount, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !data) return [];
    return data as UserDetail["recentXp"];
  } catch {
    return [];
  }
}
