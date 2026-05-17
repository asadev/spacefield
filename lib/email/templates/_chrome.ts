/**
 * lib/email/templates/_chrome.ts — shared markup primitives.
 *
 * Each template in this directory builds its body string with these
 * helpers so the typography, brand bar, and footer stay consistent
 * without re-importing the legacy `lib/email.ts` helpers (which we
 * don't want to entangle with the new send path).
 */

export const FONT =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;";

export const STYLES = {
  h1: "margin: 0 0 12px; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: #0a0a0a;",
  p: "margin: 0 0 16px; font-size: 15px; line-height: 1.65; color: #2a2a2a;",
  ul: "margin: 0 0 16px; padding-left: 18px; font-size: 14px; line-height: 1.6; color: #2a2a2a;",
  small: "margin: 24px 0 0; font-size: 12px; color: #888; line-height: 1.6;",
  link: "color: #7c3aed; text-decoration: underline;",
};

export function emailWrap(inner: string): string {
  return `
    <div style="${FONT} max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #0a0a0a; background: #ffffff;">
      <div style="margin-bottom: 32px;">
        <span style="display: inline-block; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; color: #0a0a0a;">
          Space Field
        </span>
      </div>
      ${inner}
      <hr style="border: 0; border-top: 1px solid #eee; margin: 32px 0;">
      <p style="margin: 0; font-size: 11px; color: #999; ${FONT}">
        <a href="https://spacefield.co" style="color: #999; text-decoration: none;">spacefield.co</a>
        — your workspace, in the browser.
        &middot;
        <a href="https://spacefield.co/account/email" style="color: #999; text-decoration: none;">Email preferences</a>
      </p>
    </div>
  `;
}

export function button(label: string, href: string): string {
  return `
    <p style="margin: 24px 0;">
      <a href="${escapeHtml(href)}"
         style="display: inline-block; padding: 12px 22px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px;">
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip HTML to a plain-text body. Templates can override if they
 *  want a richer plain-text version, but most don't bother. */
export function plainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
