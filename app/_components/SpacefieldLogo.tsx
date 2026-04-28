"use client";

/* Spacefield brand mark + wordmark.
 *
 * Concept (Mark A): an iOS-style squircle "field" cut into a 2x2 grid by
 * thin lines that take the page background color — so the grid reads as
 * a notch out of the mark, not as additive ink. The squircle is a
 * superellipse approximation (smoother than a rounded-rect) so it has
 * the same calm, premium feel as iOS app icons.
 *
 * The mark uses `currentColor` so callers control the color via Tailwind
 * (text-app, text-tool-accent, etc.). The grid divider uses
 * `var(--bg, #fff)` so it matches whatever surface the logo sits on,
 * making the cut-out illusion work in light + dark + colored panels.
 *
 * Sizes:
 *   sm — 16px (use in dense chrome, tab strips)
 *   md — 24px (default; top nav, footer)
 *   lg — 36px (hero, marketing pages, email headers)
 *
 * The wordmark "Space Field" sits to the right of the mark, vertically
 * centered, with a 6px gap. Type is Inter (loaded via next/font in
 * layout.tsx) — semibold, tight tracking, sized at 70% of the mark
 * height so the cap height aligns with the squircle's optical center. */

interface SpacefieldLogoProps {
  size?: "sm" | "md" | "lg";
  wordmark?: boolean;
  className?: string;
}

const SIZE_PX: Record<NonNullable<SpacefieldLogoProps["size"]>, number> = {
  sm: 16,
  md: 24,
  lg: 36,
};

/* Superellipse-ish squircle path on a 24x24 grid.
 * Drawn as four cubic curves so the corner curvature is continuous
 * (G2-ish), matching the iOS app-icon shape better than rounded-rect.
 * Inset by 1px on every side so a 16px favicon still has crisp edges. */
const SQUIRCLE_PATH =
  "M12 1 " +
  "C 18.5 1, 23 5.5, 23 12 " +
  "C 23 18.5, 18.5 23, 12 23 " +
  "C 5.5 23, 1 18.5, 1 12 " +
  "C 1 5.5, 5.5 1, 12 1 Z";

export default function SpacefieldLogo({
  size = "md",
  wordmark = true,
  className = "",
}: SpacefieldLogoProps) {
  const dims = SIZE_PX[size];
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label="Spacefield"
    >
      <svg
        width={dims}
        height={dims}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Filled squircle takes parent text color */}
        <path d={SQUIRCLE_PATH} fill="currentColor" />
        {/* 2x2 grid divider — color matches page bg so it reads as a
         * cut-out. Inset 5px from edges so the four quadrants stay
         * visually balanced at 16px. */}
        <path
          d="M12 5 L12 19 M5 12 L19 12"
          stroke="var(--bg, #fff)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      {wordmark && (
        <span
          className="font-semibold text-app"
          style={{
            fontSize: `${Math.round(dims * 0.7)}px`,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          Space Field
        </span>
      )}
    </span>
  );
}
