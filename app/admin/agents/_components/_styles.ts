/**
 * Client-safe style constants and pure formatters used by the agents
 * client components. These mirror the values in `app/admin/_lib.ts` but
 * live here because that file is `server-only` (it imports the Supabase
 * server client) and cannot be referenced from client modules.
 *
 * Keep these in sync with `_lib.ts` — they're intentionally identical.
 */

export const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

export const buttonGhostClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent disabled:opacity-50";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}
