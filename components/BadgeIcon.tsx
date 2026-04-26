interface BadgeIconProps {
  badgeId: string;
  size?: number;
  className?: string;
}

const ICONS: Record<string, string> = {
  // Tools
  first_analysis: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", // search
  tool_explorer: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", // compass-star
  tool_master: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", // lightning
  deal_hunter: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z", // target

  // Games
  first_game: "M6 12h.01M10 12h.01M15 16l2-2-2-2M21 6H3v12h18V6zM7 6V4a1 1 0 011-1h8a1 1 0 011 1v2", // gamepad
  game_explorer: "M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7m10 2h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7m-5-5v14m-4 4h8l-1-4H9l-1 4z", // trophy
  high_scorer: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", // star
  perfect_score: "M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z", // diamond

  // Learning
  first_lesson: "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2V3zm20 0h-6a4 4 0 00-4 4v14a3 3 0 013-3h7V3z", // book-open
  course_graduate: "M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm0 12.55L5 12.4V10l7 3.82 7-3.82v2.4l-7 3.15z", // graduation-cap
  knowledge_seeker: "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v15H6.5A2.5 2.5 0 004 19.5V5A2.5 2.5 0 016.5 2z", // library
  scholar: "M12 15a7 7 0 100-14 7 7 0 000 14zm0-10l1.5 3 3.5.5-2.5 2.5.5 3.5L12 13l-3 1.5.5-3.5L7 8.5l3.5-.5L12 5zm-4 17h8", // medal

  // Community
  first_post: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z", // message
  social_butterfly: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75", // users
  event_organizer: "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18", // calendar

  // Milestones
  level_5: "M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6L12 2z", // star outline
  level_10: "M12 2c.5 2 1.5 4 3 5.5S19 10 21 10c-2 .5-4 1.5-5.5 3S14 17 14 19c-.5-2-1.5-4-3-5.5S7 11 5 10.5c2-.5 4-1.5 5.5-3S12 4 12 2z", // flame
  level_20: "M2 17l3-3h3l2-4 2 4h3l3 3M5 8l2-4h2l3 4h-3L7 4 5 8zm9-4l2-2h2l2 2", // crown
  xp_1000: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83", // sparkles
  xp_5000: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", // zap (same as lightning, intentional)
};

// Lock icon for unearned badges
const LOCK_PATH = "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zm-3 0V7a4 4 0 00-8 0v4";

export default function BadgeIcon({ badgeId, size = 24, className = "" }: BadgeIconProps) {
  const path = ICONS[badgeId];

  if (!path) {
    // Fallback: generic circle
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

export function LockIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={LOCK_PATH} />
    </svg>
  );
}
