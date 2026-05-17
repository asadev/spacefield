/**
 * account-deletion-confirm.ts — 30-day grace warning + final purge notice.
 *
 * Wave-4 Z3 ships the email; the cron that fires it is in the
 * account-lifecycle slice (Wave-3 / 20260517a_account_lifecycle.sql
 * scheduled the grace period; /api/cron/account-purge runs daily).
 *
 * Two render modes, picked by `kind`:
 *   - "scheduled" → "You asked to delete your account, here's what
 *     happens in the next 30 days and how to cancel."
 *   - "final"     → "Today's the day — your data has been purged."
 *
 * Always-on. Security/account-state changes ignore the email channel
 * toggles so a user can't accidentally silence themselves into
 * losing data.
 */

import { emailWrap, button, escapeHtml, plainText, STYLES } from "./_chrome";

export interface AccountDeletionVars {
  name?: string | null;
  kind: "scheduled" | "final";
  /** ISO date the purge runs / ran. */
  purgeAt: string;
  /** Absolute URL to the cancel-deletion page. Only used in "scheduled". */
  cancelUrl?: string;
}

export function accountDeletionConfirmEmail(vars: AccountDeletionVars): {
  subject: string;
  html: string;
  text: string;
} {
  return vars.kind === "final"
    ? renderFinal(vars)
    : renderScheduled(vars);
}

function renderScheduled(vars: AccountDeletionVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.name ? `Hi ${escapeHtml(vars.name)},` : "Hi,";
  const when = formatDate(vars.purgeAt);
  const cancelUrl = vars.cancelUrl ?? "https://spacefield.co/account";
  const html = emailWrap(`
    <h1 style="${STYLES.h1}">Your account is scheduled for deletion.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">
      We received your request to delete your Space Field account.
      Here's what happens next:
    </p>
    <ul style="${STYLES.ul}">
      <li>Your account is now in a 30-day grace period.</li>
      <li>On <strong>${escapeHtml(when)}</strong>, we permanently delete
          your profile, workspaces you own, and all associated data.</li>
      <li>Workspaces where you're a member (but don't own) keep
          running; you're just removed.</li>
    </ul>
    <p style="${STYLES.p}">
      Changed your mind? Sign back in any time in the next 30 days and
      we'll cancel the deletion automatically. Or use this link:
    </p>
    ${button("Cancel deletion", cancelUrl)}
    <p style="${STYLES.small}">
      This is an account-state notice; it always sends regardless of
      your email preferences.
    </p>
  `);
  return {
    subject: `Account scheduled for deletion on ${when}`,
    html,
    text: plainText(html),
  };
}

function renderFinal(vars: AccountDeletionVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.name ? `Hi ${escapeHtml(vars.name)},` : "Hi,";
  const html = emailWrap(`
    <h1 style="${STYLES.h1}">Your account has been deleted.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">
      As requested, your Space Field account and the data we hold for
      it has been permanently deleted. We're sorry to see you go.
    </p>
    <p style="${STYLES.p}">
      You can sign up again any time with the same email — but this
      will be a brand-new account; we can't recover the deleted one.
    </p>
    <p style="${STYLES.small}">
      This is an account-state notice; it always sends regardless of
      your email preferences. After this email, we won't contact you
      again unless you create a new account.
    </p>
  `);
  return {
    subject: "Your Space Field account has been deleted",
    html,
    text: plainText(html),
  };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
