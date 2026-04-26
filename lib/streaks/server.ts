// Daily streak helpers (server-side)
// Called on dashboard load. Idempotent per day.

import { createClient } from "@/lib/supabase/server";

export interface StreakSnapshot {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  milestone_awarded: number | null; // if a milestone XP bonus fired this bump
}

const MILESTONE_XP: Record<number, number> = {
  7: 50,
  30: 100,
  100: 250,
};

function todayIso(): string {
  // UTC date — simple and predictable; dashboard is global
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Bumps the user's daily streak. Safe to call on every dashboard load — no-op
 * if already active today. Returns the post-bump snapshot.
 *
 * Milestone logic: if the post-bump streak crosses 7, 30, or 100 for the first
 * time (i.e. the new current_streak equals one of those and wasn't that before),
 * we award XP via the xp_events ledger.
 */
export async function bumpStreak(userId: string): Promise<StreakSnapshot> {
  const supabase = await createClient();
  const today = todayIso();
  const yesterday = yesterdayIso();

  const { data: existing } = await supabase
    .from("daily_streaks")
    .select("current_streak, longest_streak, last_active_date")
    .eq("user_id", userId)
    .maybeSingle();

  let current = 1;
  let longest = 1;
  let milestoneAwarded: number | null = null;

  if (existing) {
    if (existing.last_active_date === today) {
      // Already counted today.
      return {
        current_streak: existing.current_streak,
        longest_streak: existing.longest_streak,
        last_active_date: existing.last_active_date,
        milestone_awarded: null,
      };
    }
    if (existing.last_active_date === yesterday) {
      current = existing.current_streak + 1;
    } else {
      current = 1;
    }
    longest = Math.max(existing.longest_streak, current);
  }

  // Upsert streak row
  await supabase.from("daily_streaks").upsert(
    {
      user_id: userId,
      current_streak: current,
      longest_streak: longest,
      last_active_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  // Milestone XP bonus
  if (MILESTONE_XP[current] !== undefined) {
    milestoneAwarded = current;
    const xp = MILESTONE_XP[current];

    // Record in xp_events ledger — same shape as xp-actions.ts
    await supabase.from("xp_events").insert({
      user_id: userId,
      action: "streak_milestone",
      xp,
      source_type: "streak",
      source_id: String(current),
    });

    // Bump profile total_xp
    const { data: profile } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("id", userId)
      .single();
    const newTotal = (profile?.total_xp || 0) + xp;
    await supabase.from("profiles").update({ total_xp: newTotal }).eq("id", userId);

    // Drop a notification so the user sees the bonus
    await supabase.from("notifications").insert({
      user_id: userId,
      kind: "streak_milestone",
      title: `${current}-day streak — +${xp} XP`,
      body: `You hit a ${current}-day streak. Keep it going.`,
      href: "/dashboard",
    });
  }

  return {
    current_streak: current,
    longest_streak: longest,
    last_active_date: today,
    milestone_awarded: milestoneAwarded,
  };
}

export async function getStreak(userId: string): Promise<StreakSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_streaks")
    .select("current_streak, longest_streak, last_active_date")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    current_streak: data.current_streak,
    longest_streak: data.longest_streak,
    last_active_date: data.last_active_date,
    milestone_awarded: null,
  };
}

export function nextMilestone(current: number): number {
  const tiers = [7, 14, 30, 60, 100];
  for (const t of tiers) {
    if (current < t) return t;
  }
  return current + 50;
}
