"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLevel } from "@/lib/xp-system";

interface Player {
  id: string;
  full_name: string;
  total_xp: number;
  avatar_url: string | null;
}

const MEDAL = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];

export default function TopPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, total_xp, avatar_url")
        .order("total_xp", { ascending: false })
        .limit(3);
      if (data) setPlayers(data);
    }
    fetch();
  }, []);

  if (players.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-widest text-white/60">
          Top Players
        </h3>
        <Link href="/leaderboard" className="text-xs text-white/30 hover:text-white/70 transition">
          View all →
        </Link>
      </div>
      <div className="space-y-3">
        {players.map((player, i) => {
          const { level } = getLevel(player.total_xp);
          return (
            <div key={player.id} className="flex items-center gap-3">
              <span className="text-sm">{MEDAL[i]}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-medium overflow-hidden">
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt="" className="h-7 w-7 object-cover" />
                ) : (
                  (player.full_name?.[0] || "?").toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{player.full_name || "Anonymous"}</p>
              </div>
              <span className="text-xs text-white/40">Lv.{level}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
