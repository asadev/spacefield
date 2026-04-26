"use client";

import { useEffect, useState } from "react";
import { isProClient } from "@/lib/pro/client";

interface Props {
  userId: string | null | undefined;
  // Optional label shown next to the dot. When omitted only the amber dot
  // renders — use that in dense feeds.
  showLabel?: boolean;
  className?: string;
}

// Subtle amber dot shown on community posts, leaderboards, etc. to signal
// that the user has unlocked Pro (referred ≥3 friends). Intentionally
// low-key — the product is free and we don't want a two-tier vibe.
export default function ProBadge({ userId, showLabel = false, className = "" }: Props) {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isProClient(userId).then((v) => {
      if (!cancelled) setIsPro(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!isPro) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title="Pro — unlocked by referring 3 friends"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      </span>
      {showLabel && (
        <span className="text-[0.55rem] uppercase tracking-[0.15em] text-amber-300/80">
          Pro
        </span>
      )}
    </span>
  );
}
