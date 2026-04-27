/* Plain CSS class constants pulled out of admin/_lib.ts so they can
 * be imported by client components. Kept tiny — anything that touches
 * supabase / cookies stays in _lib.ts behind `server-only`. */

export const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50";
