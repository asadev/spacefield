// Shared game utilities — sound, scoring, leaderboard, formatting

// ─── Web Audio Sound Engine ─────────────────────────────────────────────────
// All sounds generated programmatically via Web Audio API. No audio files needed.
// Sounds are subtle and professional — think Bloomberg, not Candy Crush.

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function playTone(freq: number, duration: number, volume: number = 0.08, type: OscillatorType = "sine") {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export const GameSounds = {
  click: () => playTone(800, 0.06, 0.05),
  select: () => playTone(600, 0.08, 0.06),
  correct: () => {
    playTone(523, 0.12, 0.07); // C5
    setTimeout(() => playTone(659, 0.15, 0.07), 100); // E5
  },
  wrong: () => {
    playTone(330, 0.12, 0.06); // E4
    setTimeout(() => playTone(262, 0.18, 0.06), 100); // C4
  },
  tick: () => playTone(1000, 0.02, 0.02),
  levelUp: () => {
    playTone(523, 0.1, 0.06);
    setTimeout(() => playTone(659, 0.1, 0.06), 80);
    setTimeout(() => playTone(784, 0.15, 0.06), 160); // G5
  },
  scoreReveal: () => {
    playTone(440, 0.15, 0.05);
    setTimeout(() => playTone(554, 0.15, 0.05), 120);
    setTimeout(() => playTone(659, 0.15, 0.05), 240);
    setTimeout(() => playTone(880, 0.25, 0.06), 360);
  },
  gameOver: () => {
    playTone(659, 0.15, 0.06);
    setTimeout(() => playTone(554, 0.15, 0.06), 150);
    setTimeout(() => playTone(440, 0.15, 0.06), 300);
    setTimeout(() => playTone(330, 0.3, 0.05), 450);
  },
  buy: () => {
    playTone(440, 0.08, 0.05);
    setTimeout(() => playTone(660, 0.12, 0.06), 60);
  },
  sell: () => {
    playTone(660, 0.08, 0.05);
    setTimeout(() => playTone(440, 0.12, 0.04), 60);
  },
  timer: () => playTone(1200, 0.03, 0.03, "square"),
  achievement: () => {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, 0.12, 0.05), i * 100);
    });
  },
};

// ─── Score Persistence ──────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/client";
import { awardXP } from "@/lib/xp-actions";

export interface GameScore {
  game: string;
  score: number;
  details: Record<string, unknown>;
  timestamp: number;
  playerName?: string;
}

export interface LeaderboardEntry {
  player_name: string;
  score: number;
  played_at: string;
}

const SCORES_KEY = "game_scores";

export function saveScore(game: string, score: number, details: Record<string, unknown> = {}, playerName?: string) {
  // Save to localStorage (always works, even offline)
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const all: GameScore[] = raw ? JSON.parse(raw) : [];
    all.push({ game, score, details, timestamp: Date.now(), playerName });
    const filtered = all.filter((s) => s.game === game).slice(-100);
    const others = all.filter((s) => s.game !== game);
    localStorage.setItem(SCORES_KEY, JSON.stringify([...others, ...filtered]));
  } catch {}

  // Fire-and-forget: save to Supabase + award XP
  saveScoreToSupabase(game, score, details, playerName).catch(() => {});
}

async function saveScoreToSupabase(
  game: string,
  score: number,
  details: Record<string, unknown>,
  playerName?: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const name = playerName ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Anonymous";

  await supabase.from("game_scores").insert({
    user_id: user.id,
    game,
    score,
    details,
    player_name: name,
  });

  // Award XP for playing
  await awardXP("game_play", "game", game);

  // Check if this is a high score (>80%)
  const maxScores: Record<string, number> = {
    "property-tycoon": 10000000,
    "portfolio-wars": 5000,
    "flip-or-hold": 1000,
    "brokers-gauntlet": 2000,
    "blind-valuation": 1000,
    "market-prediction": 1000,
    "regulation-gauntlet": 2000,
    "area-detective": 1000,
  };
  const maxScore = maxScores[game];
  if (maxScore && score / maxScore >= 0.8) {
    await awardXP("game_high_score", "game", game);
  }
}

export function getScores(game: string): GameScore[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const all: GameScore[] = JSON.parse(raw);
    return all
      .filter((s) => s.game === game)
      .sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

export function getHighScore(game: string): number {
  const scores = getScores(game);
  return scores.length > 0 ? scores[0].score : 0;
}

export function getRecentScores(game: string, limit: number = 10): GameScore[] {
  const scores = getScores(game);
  return scores.slice(0, limit);
}

export async function getGameLeaderboard(game: string, limit: number = 10): Promise<LeaderboardEntry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("game_scores")
    .select("player_name, score, created_at")
    .eq("game", game)
    .order("score", { ascending: false })
    .limit(limit);

  return (data || []).map((d) => ({
    player_name: d.player_name || "Anonymous",
    score: d.score,
    played_at: d.created_at,
  }));
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

export function fmtAED(n: number): string {
  return `AED ${Math.round(n).toLocaleString()}`;
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `AED ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `AED ${(n / 1_000).toFixed(0)}K`;
  return `AED ${Math.round(n).toLocaleString()}`;
}

export function fmtPct(n: number, decimals: number = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString();
}

// ─── Game Timer Hook Helper ─────────────────────────────────────────────────

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// ─── Score Grade ────────────────────────────────────────────────────────────

export function getGrade(score: number, maxScore: number): { grade: string; color: string; label: string } {
  const pct = (score / maxScore) * 100;
  if (pct >= 95) return { grade: "S", color: "text-amber-400", label: "Legendary" };
  if (pct >= 85) return { grade: "A", color: "text-emerald-400", label: "Expert" };
  if (pct >= 70) return { grade: "B", color: "text-blue-400", label: "Skilled" };
  if (pct >= 55) return { grade: "C", color: "text-purple-400", label: "Intermediate" };
  if (pct >= 40) return { grade: "D", color: "text-orange-400", label: "Learning" };
  return { grade: "F", color: "text-red-400", label: "Beginner" };
}

// ─── Difficulty Scaling ─────────────────────────────────────────────────────

export function getDifficulty(round: number): "easy" | "medium" | "hard" | "expert" {
  if (round <= 3) return "easy";
  if (round <= 6) return "medium";
  if (round <= 9) return "hard";
  return "expert";
}

// ─── Streak Tracking ────────────────────────────────────────────────────────

export function getStreakMultiplier(streak: number): number {
  if (streak >= 10) return 3.0;
  if (streak >= 7) return 2.5;
  if (streak >= 5) return 2.0;
  if (streak >= 3) return 1.5;
  return 1.0;
}
