"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolved, toggle } = useTheme();

  const label =
    theme === "system"
      ? `System (${resolved})`
      : theme === "light"
        ? "Light"
        : "Dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Theme: ${label}. Click to cycle theme.`}
      title={`Theme: ${label}`}
      className={`flex h-8 w-8 items-center justify-center rounded-md border border-app bg-surface bg-surface-hover text-secondary hover:text-app transition-colors ${className}`}
    >
      {resolved === "dark" ? (
        // Moon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        // Sun
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
      {theme === "system" && (
        <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
      )}
    </button>
  );
}
