"use client";

import type { ReactNode } from "react";

/**
 * ToolSurface — wraps a tool page body with the per-tool theming contract.
 *
 * Every tool inherits a design theme from its category via `data-tool-theme`,
 * and identifies itself via `data-tool="{slug}"` so flagship tools can layer
 * their own identity on top with selectors like:
 *   [data-tool="global-market-comparison"] .hero { ... }
 *
 * The category-level tokens exposed to children are:
 *   --tool-accent          strong accent (CTAs, active states, underlines)
 *   --tool-accent-soft     translucent tint of the accent (chips, bg)
 *   --tool-accent-ring     focus-ring color
 *   --tool-chrome          subtle chrome/header background
 *   --tool-surface         card surface tint
 *   --tool-heading-family  optional heading font variant
 *   --tool-hero-gradient   2-stop gradient usable as a hero background
 *
 * See app/globals.css → `[data-tool-theme="…"]` blocks for per-category values.
 */
export default function ToolSurface({
  category,
  slug,
  children,
  className,
}: {
  category: string;
  slug: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-tool-theme={category} data-tool={slug} className={className}>
      {children}
    </div>
  );
}
