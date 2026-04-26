"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Compact card for the dashboard home. Shows progress toward Pro and a link
// to the full /dashboard/refer page.
//
// Data is fetched client-side to keep the widget drop-in for the orchestrator
// who will wire it into /dashboard/page.tsx (which we're not allowed to touch
// directly).
export default function ReferralWidget() {
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    converted: number;
    isPro: boolean;
    code: string | null;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }

      const [refs, code, profile] = await Promise.all([
        supabase
          .from("referrals")
          .select("converted_at")
          .eq("inviter_id", user.id),
        supabase
          .from("referral_codes")
          .select("code")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      const list = refs.data || [];
      setStats({
        total: list.length,
        converted: list.filter((r) => r.converted_at).length,
        isPro: !!profile.data?.is_pro,
        code: code.data?.code || null,
      });
      setLoaded(true);
    })();
  }, []);

  if (!loaded) {
    return (
      <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] p-5">
        <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-2 w-full animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (!stats) return null;

  const threshold = 3;
  const progress = Math.min(stats.converted / threshold, 1);
  const remaining = Math.max(threshold - stats.converted, 0);

  return (
    <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-amber-300/80">
            {stats.isPro ? "Pro Unlocked" : "Invite to Unlock Pro"}
          </p>
          <p className="mt-1 text-sm text-white">
            {stats.isPro
              ? `${stats.converted} friends joined. Thanks.`
              : remaining === threshold
                ? "Refer 3 friends, unlock Pro perks."
                : `${stats.converted} of ${threshold} converted. ${remaining} to go.`}
          </p>
        </div>
        <Link
          href="/dashboard/refer"
          className="rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-4 py-2 text-[0.65rem] uppercase tracking-[0.15em] text-amber-200 transition-colors hover:bg-amber-400/[0.14]"
        >
          {stats.isPro ? "Share" : "Invite"}
        </Link>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400/50 to-amber-300/70 transition-[width] duration-700"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[0.55rem] uppercase tracking-[0.15em] text-gray-500">
        <span>{stats.total} invited</span>
        <span>{stats.converted}/{threshold}</span>
      </div>
    </div>
  );
}
