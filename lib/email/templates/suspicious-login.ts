/**
 * suspicious-login.ts — "New device sign-in" notification.
 *
 * Sent by the `/api/cron/suspicious-login-scan` worker when
 * `record_login` flags a login_events row with a new (ip_hash, ua_hash)
 * combination that hasn't been seen for the user in 60 days.
 *
 * Intentionally light on detail — we don't show the raw IP or
 * user-agent (we never have the plaintext after hashing) and we don't
 * link directly to "revoke this session" because per-event session
 * revocation isn't wired yet. The CTA is the security page where the
 * user can sign out everywhere and rotate their password.
 */

import { emailWrap, button, escapeHtml, plainText, STYLES } from "./_chrome";

export interface SuspiciousLoginVars {
  /** Optional display name. If omitted we use "Hi," as the greeting. */
  name?: string | null;
  /** Human-readable timestamp, ISO ok — formatted on render. */
  occurredAt: string;
  /** Short fingerprint shown to the user (first 10 chars of ip_hash). */
  fingerprint: string;
  /** Absolute URL to the security page. */
  securityUrl: string;
}

export function suspiciousLoginEmail(vars: SuspiciousLoginVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.name ? `Hi ${escapeHtml(vars.name)},` : "Hi,";
  const when = formatWhen(vars.occurredAt);
  const fp = escapeHtml(vars.fingerprint || "unknown");
  const html = emailWrap(`
    <h1 style="${STYLES.h1}">New sign-in to your account.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">
      We noticed a sign-in to your Space Field account from a device
      we hadn't seen before:
    </p>
    <ul style="${STYLES.ul}">
      <li><strong>When:</strong> ${escapeHtml(when)}</li>
      <li><strong>Device fingerprint:</strong> <code>${fp}</code></li>
    </ul>
    <p style="${STYLES.p}">
      If that was you, no action needed.
    </p>
    <p style="${STYLES.p}">
      If it wasn't, sign out everywhere and reset your password right
      now:
    </p>
    ${button("Review activity", vars.securityUrl)}
    <p style="${STYLES.small}">
      You're getting this because "New device sign-in" is enabled in
      your email preferences. We always send this even if it's off for
      security-critical events — but you can mute the routine ones.
    </p>
  `);
  return {
    subject: "New sign-in to your Space Field account",
    html,
    text: plainText(html),
  };
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}
