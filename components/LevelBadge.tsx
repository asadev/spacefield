"use client";

import { getLevel } from "@/lib/xp-system";

interface LevelBadgeProps {
  totalXP: number;
  size?: "sm" | "md";
}

export default function LevelBadge({ totalXP, size = "sm" }: LevelBadgeProps) {
  const { level, title } = getLevel(totalXP);

  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[0.55rem] uppercase tracking-[0.15em] text-gray-400">
        Lv.{level}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 border border-white/[0.10] bg-white/[0.05] px-3 py-1">
      <span className="text-[0.65rem] font-semibold text-white">Lv.{level}</span>
      <span className="text-[0.55rem] uppercase tracking-[0.15em] text-gray-500">{title}</span>
    </span>
  );
}
