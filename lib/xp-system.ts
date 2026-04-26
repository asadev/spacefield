// XP System — rewards, levels, badges, and calculations

export const XP_REWARDS = {
  tool_use: 10,
  lesson_complete: 25,
  course_complete: 100,
  game_play: 15,
  game_high_score: 30,
  post_create: 15,
  reply_create: 5,
  event_create: 20,
  profile_complete: 50,
} as const;

export type XPAction = keyof typeof XP_REWARDS;

// Level thresholds — exponential curve
const LEVEL_THRESHOLDS: number[] = [];
for (let i = 0; i < 50; i++) {
  LEVEL_THRESHOLDS.push(Math.floor(100 * Math.pow(1.35, i)));
}

export const LEVEL_TITLES: Record<number, string> = {
  1: "Newcomer",
  2: "Explorer",
  3: "Learner",
  5: "Analyst",
  8: "Specialist",
  10: "Expert",
  15: "Authority",
  20: "Master",
  25: "Grandmaster",
  30: "Legend",
  40: "Oracle",
  50: "Titan",
};

export interface LevelInfo {
  level: number;
  title: string;
  currentXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progress: number; // 0-1
}

export function getLevel(totalXP: number): LevelInfo {
  let level = 1;
  let xpForCurrentLevel = 0;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      level = i + 2;
      xpForCurrentLevel = LEVEL_THRESHOLDS[i];
    } else {
      break;
    }
  }

  if (level > 50) level = 50;

  const xpForNextLevel = level < 50 ? LEVEL_THRESHOLDS[level - 1] : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

  // Find title — use the highest title at or below current level
  let title = "Newcomer";
  for (const [lvl, t] of Object.entries(LEVEL_TITLES)) {
    if (level >= Number(lvl)) title = t;
  }

  const progress = xpForNextLevel > xpForCurrentLevel
    ? (totalXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)
    : 1;

  return {
    level,
    title,
    currentXP: totalXP,
    xpForCurrentLevel,
    xpForNextLevel,
    progress: Math.min(Math.max(progress, 0), 1),
  };
}

// ─── Badges ─────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "tools" | "games" | "learning" | "community" | "milestone";
}

export const BADGES: Badge[] = [
  // Tools
  { id: "first_analysis", name: "First Analysis", description: "Use any tool for the first time", icon: "🔍", category: "tools" },
  { id: "tool_explorer", name: "Tool Explorer", description: "Use 10 different tools", icon: "🧭", category: "tools" },
  { id: "tool_master", name: "Tool Master", description: "Use all 28 tools", icon: "⚡", category: "tools" },
  { id: "deal_hunter", name: "Deal Hunter", description: "Score 10 deals", icon: "🎯", category: "tools" },

  // Games
  { id: "first_game", name: "Player One", description: "Play any game for the first time", icon: "🎮", category: "games" },
  { id: "game_explorer", name: "Game Explorer", description: "Play all 8 games", icon: "🏆", category: "games" },
  { id: "high_scorer", name: "High Scorer", description: "Score above 80% on any game", icon: "🌟", category: "games" },
  { id: "perfect_score", name: "Perfect Score", description: "Score 100% on any game", icon: "💎", category: "games" },

  // Learning
  { id: "first_lesson", name: "Student", description: "Complete your first lesson", icon: "📖", category: "learning" },
  { id: "course_graduate", name: "Graduate", description: "Complete any course", icon: "🎓", category: "learning" },
  { id: "knowledge_seeker", name: "Knowledge Seeker", description: "Complete 5 courses", icon: "📚", category: "learning" },
  { id: "scholar", name: "Scholar", description: "Complete all courses", icon: "🏅", category: "learning" },

  // Community
  { id: "first_post", name: "Voice Heard", description: "Create your first community post", icon: "💬", category: "community" },
  { id: "social_butterfly", name: "Social Butterfly", description: "Create 10 community posts", icon: "🦋", category: "community" },
  { id: "event_organizer", name: "Event Organizer", description: "Create a community event", icon: "📅", category: "community" },

  // Milestones
  { id: "level_5", name: "Rising Star", description: "Reach Level 5", icon: "⭐", category: "milestone" },
  { id: "level_10", name: "Expert Status", description: "Reach Level 10", icon: "🔥", category: "milestone" },
  { id: "level_20", name: "Master Class", description: "Reach Level 20", icon: "👑", category: "milestone" },
  { id: "xp_1000", name: "Thousand Club", description: "Earn 1,000 XP", icon: "🎉", category: "milestone" },
  { id: "xp_5000", name: "Power User", description: "Earn 5,000 XP", icon: "⚡", category: "milestone" },
];

export function getBadgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}
