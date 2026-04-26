"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import AnimatedCounter from "@/components/ui/AnimatedCounter";

interface PlatformStatsData {
  totalUsers: number;
  totalXPEarned: number;
  gamesPlayed: number;
}

export default function PlatformStats() {
  const [stats, setStats] = useState<PlatformStatsData>({
    totalUsers: 0,
    totalXPEarned: 0,
    gamesPlayed: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function fetchStats() {
      const [usersRes, xpRes, gamesRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("total_xp"),
        supabase.from("game_scores").select("id", { count: "exact", head: true }),
      ]);

      const totalXP = xpRes.data?.reduce((sum: number, p: any) => sum + (p.total_xp || 0), 0) || 0;

      setStats({
        totalUsers: usersRes.count || 0,
        totalXPEarned: totalXP,
        gamesPlayed: gamesRes.count || 0,
      });
      setLoaded(true);
    }
    fetchStats();
  }, []);

  if (!loaded) return null;

  const items = [
    { label: "Members", value: stats.totalUsers, suffix: "" },
    { label: "XP Earned", value: stats.totalXPEarned, suffix: "" },
    { label: "Games Played", value: stats.gamesPlayed, suffix: "" },
  ];

  return (
    <div className="flex items-center justify-center gap-8 rounded-lg border border-white/[0.06] bg-white/[0.02] px-6 py-4">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3">
          {i > 0 && <div className="h-4 w-px bg-white/10" />}
          <div className="text-center">
            <p className="text-lg font-bold text-white">
              <AnimatedCounter value={item.value} suffix={item.suffix} />
            </p>
            <p className="text-[0.65rem] uppercase tracking-widest text-white/40">
              {item.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
