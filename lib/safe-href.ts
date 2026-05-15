/**
 * URL scheme allowlist for href/src attributes that come from user input
 * (markdown links, KB articles, employee document file_url, etc.).
 *
 * Blocks XSS vectors like `javascript:`, `data:`, `vbscript:`, `file:`, by
 * accepting only:
 *   - Absolute URLs with `http:` or `https:`
 *   - `mailto:` and `tel:`
 *   - Same-origin paths starting with `/`
 *   - Fragment-only links starting with `#`
 *
 * Anything else (including empty strings, scheme-relative `//`, and
 * unknown protocols) returns null.
 *
 * Findings hardened: SB-004 (admin help markdown), SB-011 (employee
 * documents), SB-012 (markdown-preview tool).
 */

const SAFE_SCHEME_RE = /^(?:https?:|mailto:|tel:|\/(?!\/)|#)/i;

export function isSafeScheme(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  return SAFE_SCHEME_RE.test(s.trim());
}

export function safeHref(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  if (!SAFE_SCHEME_RE.test(trimmed)) return null;
  return trimmed;
}
