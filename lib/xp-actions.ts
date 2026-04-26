// XP Actions — Supabase client functions for XP, achievements, leaderboards

import { createClient } from "@/lib/supabase/client";
import { XP_REWARDS, getLevel, BADGES } from "@/lib/xp-system";
import type { XPAction } from "@/lib/xp-system";

// ─── Award XP ───────────────────────────────────────────────────────────────

export async function awardXP(
  action: XPAction,
  sourceType?: string,
  sourceId?: string
): Promise<{ xp: number; newBadges: string[] } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const xp = XP_REWARDS[action];

  // Insert XP event
  await supabase.from("xp_events").insert({
    user_id: user.id,
    action,
    xp,
    source_type: sourceType || null,
    source_id: sourceId || null,
  });

  // Update profile total_xp
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_xp")
    .eq("id", user.id)
    .single();

  const newTotal = (profile?.total_xp || 0) + xp;
  const levelInfo = getLevel(newTotal);

  await supabase
    .from("profiles")
    .update({ total_xp: newTotal, level: levelInfo.level })
    .eq("id", user.id);

  // Check for new badges
  const newBadges = await checkAndAwardBadges(user.id, action, newTotal, levelInfo.level);

  return { xp, newBadges };
}

// ─── Badge Checking ─────────────────────────────────────────────────────────

async function checkAndAwardBadges(
  userId: string,
  action: XPAction,
  totalXP: number,
  level: number
): Promise<string[]> {
  const supabase = createClient();
  const earned: string[] = [];

  // Get existing achievements
  const { data: existing } = await supabase
    .from("achievements")
    .select("badge_id")
    .eq("user_id", userId);

  const existingIds = new Set(existing?.map((a) => a.badge_id) || []);

  // Determine which badges to check based on action
  const candidates: string[] = [];

  if (action === "tool_use") {
    candidates.push("first_analysis");
    // Count distinct tools used
    const { count } = await supabase
      .from("xp_events")
      .select("source_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "tool_use");
    if ((count || 0) >= 10) candidates.push("tool_explorer");
  }

  if (action === "game_play") {
    candidates.push("first_game");
    const { data: games } = await supabase
      .from("xp_events")
      .select("source_id")
      .eq("user_id", userId)
      .eq("action", "game_play");
    const uniqueGames = new Set(games?.map((g) => g.source_id) || []);
    if (uniqueGames.size >= 8) candidates.push("game_explorer");
  }

  if (action === "game_high_score") {
    candidates.push("high_scorer");
  }

  if (action === "lesson_complete") {
    candidates.push("first_lesson");
  }

  if (action === "course_complete") {
    candidates.push("course_graduate");
    const { count } = await supabase
      .from("xp_events")
      .select("source_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "course_complete");
    if ((count || 0) >= 5) candidates.push("knowledge_seeker");
  }

  if (action === "post_create") {
    candidates.push("first_post");
    const { count } = await supabase
      .from("xp_events")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "post_create");
    if ((count || 0) >= 10) candidates.push("social_butterfly");
  }

  if (action === "event_create") {
    candidates.push("event_organizer");
  }

  // Milestone badges (check on every action)
  if (level >= 5) candidates.push("level_5");
  if (level >= 10) candidates.push("level_10");
  if (level >= 20) candidates.push("level_20");
  if (totalXP >= 1000) candidates.push("xp_1000");
  if (totalXP >= 5000) candidates.push("xp_5000");

  // Award new badges
  for (const badgeId of candidates) {
    if (!existingIds.has(badgeId) && BADGES.some((b) => b.id === badgeId)) {
      const { error } = await supabase
        .from("achievements")
        .insert({ user_id: userId, badge_id: badgeId });
      if (!error) {
        earned.push(badgeId);
        existingIds.add(badgeId);
      }
    }
  }

  return earned;
}

// ─── Query Functions ────────────────────────────────────────────────────────

export async function getUserXP(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("total_xp, level")
    .eq("id", userId)
    .single();

  const levelInfo = getLevel(data?.total_xp || 0);
  return {
    totalXP: data?.total_xp || 0,
    ...levelInfo,
  };
}

export async function getUserAchievements(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("achievements")
    .select("badge_id, earned_at")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false });

  return data || [];
}

export async function getLeaderboard(
  period: "all" | "monthly" = "all",
  limit: number = 50
) {
  const supabase = createClient();

  if (period === "all") {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, total_xp, level")
      .gt("total_xp", 0)
      .order("total_xp", { ascending: false })
      .limit(limit);

    return data || [];
  }

  // Monthly: sum XP events from this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .rpc("get_monthly_leaderboard", {
      month_start: startOfMonth.toISOString(),
      result_limit: limit,
    });

  return data || [];
}

export async function getRecentXPEvents(userId: string, limit: number = 20) {
  const supabase = createClient();
  const { data } = await supabase
    .from("xp_events")
    .select("action, xp, source_type, source_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
