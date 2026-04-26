// StreakWidget — server component. Reads (and optionally bumps) the user's
// streak, renders flame + current / longest / next milestone.
//
// Two usage modes:
//   <StreakWidget userId={user.id} bump />    — bumps on load (dashboard)
//   <StreakWidget userId={user.id} />         — read-only

import { bumpStreak, getStreak, nextMilestone } from "@/lib/streaks/server";

interface StreakWidgetProps {
  userId: string;
  bump?: boolean;
}

export default async function StreakWidget({ userId, bump = false }: StreakWidgetProps) {
  const snap = bump ? await bumpStreak(userId) : await getStreak(userId);

  const current = snap?.current_streak ?? 0;
  const longest = snap?.longest_streak ?? 0;
  const next = nextMilestone(current);
  const toGo = Math.max(next - current, 0);

  return (
    <div className="border border-white/[0.10] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[0.55rem] uppercase tracking-[0.25em] text-gray-500">
            Daily streak
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span aria-hidden className="text-2xl">{current > 0 ? "\u{1F525}" : "\u26AA"}</span>
            <span className="text-3xl font-semibold text-white">{current}</span>
            <span className="text-[0.6rem] uppercase tracking-[0.15em] text-gray-500">
              {current === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
        <div className="text-right text-[0.55rem] uppercase tracking-[0.2em] text-gray-500">
          <div>Longest</div>
          <div className="mt-1 text-sm font-semibold text-gray-300">{longest}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-[0.15em] text-gray-500">
          <span>Next milestone</span>
          <span>{next} days</span>
        </div>
        <div className="mt-2 h-1 w-full bg-white/[0.05]">
          <div
            className="h-full bg-teal-400/70"
            style={{
              width: `${next > 0 ? Math.min((current / next) * 100, 100) : 0}%`,
            }}
          />
        </div>
        <div className="mt-2 text-[0.6rem] text-gray-500">
          {toGo === 0
            ? "Milestone reached — keep going."
            : `${toGo} ${toGo === 1 ? "day" : "days"} to go.`}
        </div>
      </div>

      {snap?.milestone_awarded ? (
        <div className="mt-4 border-t border-white/[0.08] pt-3 text-[0.6rem] uppercase tracking-[0.15em] text-teal-300">
          +XP milestone — {snap.milestone_awarded} days
        </div>
      ) : null}
    </div>
  );
}
