"use client";

/* IndustryCardGrid — mobile-first card picker for industry slugs.
 *
 * Shared between:
 *   - workspace settings → IndustrySection (change current industry)
 *   - onboarding → IndustryStep (pick industry during first-run)
 *
 * Renders a responsive grid:
 *   - 1 col on phones (< 480px)
 *   - 2 cols on small tablets
 *   - 3 cols on desktop
 *
 * Each card:
 *   - shows label + description
 *   - lights up when selected
 *   - dims while a save is in flight (the parent owns the network call)
 */

import { ALL_INDUSTRIES } from "@/lib/industry/registry";
import type { Industry } from "@/lib/industry/types";

interface Props {
  selected: Industry | null;
  onPick: (industry: Industry) => void;
  /** Disable interaction while a save is in flight. */
  disabled?: boolean;
  /** Slug currently being saved — shows an inline spinner on that card. */
  pendingPick?: Industry | null;
}

export default function IndustryCardGrid({
  selected,
  onPick,
  disabled = false,
  pendingPick = null,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ALL_INDUSTRIES.map((ind) => {
        const isSelected = ind.slug === selected;
        const isPending = ind.slug === pendingPick;
        return (
          <button
            key={ind.slug}
            type="button"
            onClick={() => !disabled && onPick(ind.slug)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              isSelected
                ? "border-tool-accent-soft bg-tool-accent-soft shadow-card"
                : "border-app bg-app hover:border-app-hover hover:shadow-card"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold ${
                isSelected
                  ? "bg-tool-accent text-white"
                  : "bg-surface-strong text-app"
              }`}
              aria-hidden="true"
            >
              {ind.label.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="block text-sm font-semibold text-app">
                  {ind.label}
                </span>
                {isPending && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
                    Saving…
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {ind.description}
              </span>
            </span>
            {isSelected && !isPending && (
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tool-accent text-white"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
