import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type LivePulse = {
  activeUsers5m: number;
  topPaths1h: Array<{ path: string; count: number }>;
  activeRegions1h: Array<{ region: string; count: number }>;
  recentSignups: Array<{
    id: string;
    email: string | null;
    name: string | null;
    joined_at: string | null;
    region: string | null;
  }>;
  activityStream: Array<{
    kind: string;
    at: string;
    summary: string;
    href?: string;
  }>;
  error: string | null;
};

function isoSince(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

export async function getLivePulse(): Promise<LivePulse> {
  const out: LivePulse = {
    activeUsers5m: 0,
    topPaths1h: [],
    activeRegions1h: [],
    recentSignups: [],
    activityStream: [],
    error: null,
  };
  try {
    const sb = createAdminClient();
    const since5m = isoSince(5 * 60 * 1000);
    const since1h = isoSince(60 * 60 * 1000);
    const since24h = isoSince(24 * 60 * 60 * 1000);

    const [
      active5m,
      hourPaths,
      hourRegions,
      recentProfiles,
      recentPosts,
      recentReplies,
      recentXp,
    ] = await Promise.all([
      sb
        .from("page_views")
        .select("ip_hash, user_id", { count: "exact", head: false })
        .gte("created_at", since5m),
      sb
        .from("page_views")
        .select("path")
        .gte("created_at", since1h),
      sb
        .from("page_views")
        .select("region")
        .gte("created_at", since1h)
        .not("region", "is", null),
      sb
        .from("profiles")
        .select("id, name, email, joined_at")
        .order("joined_at", { ascending: false })
        .limit(20),
      sb
        .from("feed_posts")
        .select("id, author_id, content, created_at")
        .order("created_at", { ascending: false })
        .gte("created_at", since24h)
        .limit(20),
      sb
        .from("feed_replies")
        .select("id, author_id, content, post_id, created_at")
        .order("created_at", { ascending: false })
        .gte("created_at", since24h)
        .limit(20),
      sb
        .from("xp_events")
        .select("id, user_id, amount, reason, created_at")
        .order("created_at", { ascending: false })
        .gte("created_at", since24h)
        .limit(20),
    ]);

    // Active users: distinct ip_hash|user_id in last 5m.
    if (!active5m.error && active5m.data) {
      const set = new Set<string>();
      for (const r of active5m.data as Array<{ ip_hash: string | null; user_id: string | null }>) {
        set.add(r.user_id ?? r.ip_hash ?? "");
      }
      set.delete("");
      out.activeUsers5m = set.size;
    }

    if (!hourPaths.error && hourPaths.data) {
      const counts = new Map<string, number>();
      for (const r of hourPaths.data as Array<{ path: string }>) {
        if (!r.path) continue;
        counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
      }
      out.topPaths1h = [...counts.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }

    if (!hourRegions.error && hourRegions.data) {
      const counts = new Map<string, number>();
      for (const r of hourRegions.data as Array<{ region: string | null }>) {
        if (!r.region) continue;
        counts.set(r.region, (counts.get(r.region) ?? 0) + 1);
      }
      out.activeRegions1h = [...counts.entries()]
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count);
    }

    if (!recentProfiles.error && recentProfiles.data) {
      out.recentSignups = (recentProfiles.data as Array<{
        id: string;
        name: string | null;
        email: string | null;
        joined_at: string | null;
      }>).map((p) => ({ ...p, region: null }));
    }

    const stream: LivePulse["activityStream"] = [];
    if (!recentProfiles.error && recentProfiles.data) {
      for (const p of recentProfiles.data.slice(0, 10) as Array<{
        id: string;
        name: string | null;
        email: string | null;
        joined_at: string | null;
      }>) {
        if (!p.joined_at) continue;
        stream.push({
          kind: "signup",
          at: p.joined_at,
          summary: `New signup: ${p.name || p.email || p.id.slice(0, 8)}`,
          href: `/admin/users/${p.id}`,
        });
      }
    }
    if (!recentPosts.error && recentPosts.data) {
      for (const p of recentPosts.data as Array<{
        id: string;
        author_id: string;
        content: string;
        created_at: string;
      }>) {
        stream.push({
          kind: "post",
          at: p.created_at,
          summary: `Post: ${(p.content || "").slice(0, 80)}`,
        });
      }
    }
    if (!recentReplies.error && recentReplies.data) {
      for (const r of recentReplies.data as Array<{
        id: string;
        content: string;
        post_id: string;
        created_at: string;
      }>) {
        stream.push({
          kind: "reply",
          at: r.created_at,
          summary: `Reply: ${(r.content || "").slice(0, 80)}`,
        });
      }
    }
    if (!recentXp.error && recentXp.data) {
      for (const x of recentXp.data as Array<{
        id: string;
        user_id: string;
        amount: number | null;
        reason: string | null;
        created_at: string;
      }>) {
        stream.push({
          kind: "xp",
          at: x.created_at,
          summary: `XP +${x.amount ?? 0} · ${x.reason ?? ""}`,
          href: `/admin/users/${x.user_id}`,
        });
      }
    }
    stream.sort((a, b) => (a.at < b.at ? 1 : -1));
    out.activityStream = stream.slice(0, 30);

    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
    return out;
  }
}
