import "server-only";
import { createClient } from "@/lib/supabase/server";

export type WindowCounts = {
  label: string;
  day1: number | null;
  day7: number | null;
  day30: number | null;
  error?: string;
};

const WINDOWS = [
  { key: "day1", hours: 24 },
  { key: "day7", hours: 24 * 7 },
  { key: "day30", hours: 24 * 30 },
] as const;

async function countSince(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  column: string,
  iso: string
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, iso);
  if (error) return null;
  return count ?? 0;
}

async function countsFor(
  table: string,
  column: string,
  label: string
): Promise<WindowCounts> {
  try {
    const supabase = await createClient();
    const now = Date.now();
    const results = await Promise.all(
      WINDOWS.map(async (w) => {
        const iso = new Date(now - w.hours * 3600_000).toISOString();
        return countSince(supabase, table, column, iso);
      })
    );
    return {
      label,
      day1: results[0],
      day7: results[1],
      day30: results[2],
    };
  } catch (e) {
    return {
      label,
      day1: null,
      day7: null,
      day30: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type ActivityStats = {
  profiles: WindowCounts;
  feedPosts: WindowCounts;
  feedReplies: WindowCounts;
  feedLikes: WindowCounts;
  xpEvents: WindowCounts;
};

export async function getActivityStats(): Promise<ActivityStats> {
  // `profiles` uses `joined_at`; the rest use `created_at`.
  const [profiles, feedPosts, feedReplies, feedLikes, xpEvents] =
    await Promise.all([
      countsFor("profiles", "joined_at", "New users (profiles)"),
      countsFor("feed_posts", "created_at", "New posts (feed_posts)"),
      countsFor("feed_replies", "created_at", "Replies (feed_replies)"),
      countsFor("feed_likes", "created_at", "Likes (feed_likes)"),
      countsFor("xp_events", "created_at", "XP events"),
    ]);
  return { profiles, feedPosts, feedReplies, feedLikes, xpEvents };
}

export type ErrorProxy = {
  spamComments: number | null;
  totalComments: number | null;
  error?: string;
};

export async function getErrorProxy(): Promise<ErrorProxy> {
  try {
    const supabase = await createClient();
    const { count: total, error: totalErr } = await supabase
      .from("blog_comments")
      .select("*", { count: "exact", head: true });
    if (totalErr) {
      return {
        spamComments: null,
        totalComments: null,
        error: totalErr.message,
      };
    }
    // "spam" may or may not be a column. Try and ignore on error.
    let spam: number | null = null;
    try {
      const { count, error } = await supabase
        .from("blog_comments")
        .select("*", { count: "exact", head: true })
        .eq("status", "spam");
      if (!error) spam = count ?? 0;
    } catch {
      // ignore
    }
    return { spamComments: spam, totalComments: total ?? 0 };
  } catch (e) {
    return {
      spamComments: null,
      totalComments: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type DeploymentInfo =
  | { state: "not_configured" }
  | { state: "error"; message: string }
  | {
      state: "ok";
      name: string;
      url: string | null;
      createdAt: string | null;
      readyState: string | null;
    };

export async function getLatestDeployment(): Promise<DeploymentInfo> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { state: "not_configured" };
  try {
    const project = process.env.VERCEL_PROJECT_ID;
    const teamId = process.env.VERCEL_TEAM_ID;
    const params = new URLSearchParams({ limit: "1" });
    if (project) params.set("projectId", project);
    if (teamId) params.set("teamId", teamId);
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return {
        state: "error",
        message: `Vercel API ${res.status} ${res.statusText}`,
      };
    }
    const json = (await res.json()) as {
      deployments?: Array<{
        name?: string;
        url?: string;
        created?: number;
        state?: string;
        readyState?: string;
      }>;
    };
    const d = json.deployments?.[0];
    if (!d) return { state: "error", message: "No deployments returned" };
    return {
      state: "ok",
      name: d.name ?? "unknown",
      url: d.url ? `https://${d.url}` : null,
      createdAt: d.created ? new Date(d.created).toISOString() : null,
      readyState: d.readyState ?? d.state ?? null,
    };
  } catch (e) {
    return {
      state: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type TopToolsInfo =
  | { state: "not_instrumented" }
  | { state: "error"; message: string }
  | {
      state: "ok";
      rows: Array<{ tool: string; count: number }>;
    };

export async function getTopTools(): Promise<TopToolsInfo> {
  // Probe for a tool_usage table. If it doesn't exist, report not_instrumented.
  try {
    const supabase = await createClient();
    const since = new Date(
      Date.now() - 7 * 24 * 3600_000
    ).toISOString();
    const { data, error } = await supabase
      .from("tool_usage")
      .select("tool")
      .gte("created_at", since)
      .limit(10000);
    if (error) {
      // 42P01 = undefined_table. Treat any "does not exist" as not instrumented.
      if (/does not exist/i.test(error.message)) {
        return { state: "not_instrumented" };
      }
      return { state: "error", message: error.message };
    }
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const t = (row as { tool?: string }).tool;
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { state: "ok", rows };
  } catch (e) {
    return {
      state: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
