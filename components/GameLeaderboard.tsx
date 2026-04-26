"use client";

import { useEffect, useState } from "react";
import { getGameLeaderboard, type LeaderboardEntry } from "@/lib/game-utils";

interface GameLeaderboardProps {
  game: string;
}

export default function GameLeaderboard({ game }: GameLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGameLeaderboard(game, 10).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [game]);

  if (loading) {
    return (
      <div className="mt-6 border border-white/[0.08] bg-white/[0.03] p-5">
        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gray-500">Loading leaderboard...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mt-6 border border-white/[0.08] bg-white/[0.03] p-5">
        <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gray-500 mb-3">Global Leaderboard</p>
        <p className="text-sm text-gray-600">No scores yet. Be the first!</p>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-white/[0.08] bg-white/[0.03] p-5">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-gray-500 mb-4">Global Leaderboard</p>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div
            key={`${entry.player_name}-${i}`}
            className="flex items-center justify-between py-1.5"
          >
            <div className="flex items-center gap-3">
              <span className={`w-5 text-center text-[0.65rem] font-semibold ${
                i === 0 ? "text-amber-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600"
              }`}>
                {i + 1}
              </span>
              <span className="text-xs sm:text-sm text-gray-300">{entry.player_name}</span>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-white">
              {Math.round(entry.score).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
