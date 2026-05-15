/**
 * Server-safe HTML helpers used when we *must* feed
 * `dangerouslySetInnerHTML`. The pattern is: escape first, then
 * structurally re-wrap.
 *
 * Findings hardened: SB-001 (quote terms), and a reusable helper for any
 * other "user typed plain text but the renderer treats it as HTML" site.
 */

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/**
 * HTML-escape the five XML-special characters plus the backtick (which
 * helps when the value flows into an inline template literal somewhere
 * downstream). Pure function, safe for any input including null bytes.
 */
export function escapeHtml(s: string): string {
  if (typeof s !== "string") return "";
  return s.replace(/[&<>"'`]/g, (c) => ESCAPE_MAP[c]!);
}

/**
 * Convert a user's plain-text "Terms" textarea into safe HTML for
 * `dangerouslySetInnerHTML`.
 *
 * Strategy:
 *   1. HTML-escape the raw text so no tag or attribute can survive.
 *   2. Split on newlines and re-wrap each non-empty segment in <p>...</p>.
 *
 * Result contains zero inline JS, zero inline event handlers, and zero
 * unsafe URL schemes — just paragraphs of text.
 */
export function sanitiseTermsHtml(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  const escaped = escapeHtml(raw);
  // Split on one-or-more newlines; drop empty paragraphs so a
  // double-newline doesn't render as `<p></p>`.
  const paragraphs = escaped
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}
