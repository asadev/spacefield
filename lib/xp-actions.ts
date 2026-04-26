// XP Actions — stubbed to no-ops on spacefield (the XP / gamification
// system lives on example.com only; spacefield doesn't have it).
// Kept as named exports so the inherited tool pages compile without
// modification. Every function returns `null` / `{}` immediately.

import type { XPAction } from "@/lib/xp-system";

export async function awardXP(
  _action: XPAction,
  _sourceType?: string,
  _sourceId?: string
): Promise<{ xp: number; newBadges: string[] } | null> {
  return null;
}

export async function checkAndAwardBadges(
  _userId: string,
  _action: XPAction,
  _totalXp: number,
  _level: number
): Promise<string[]> {
  return [];
}

export async function getProfile(_userId?: string) {
  return null;
}

export async function getLeaderboard(
  _options: {
    period?: "all-time" | "month" | "week";
    limit?: number;
  } = {}
) {
  return [];
}

export async function getUserBadges(_userId?: string) {
  return [];
}

export async function getXPHistory(
  _userId?: string,
  _limit = 50
) {
  return [];
}
