/**
 * weekly-digest.ts — Monday-morning summary of last week's activity.
 *
 * Sent by a (future) Monday-morning cron that aggregates per-user
 * stats and fires once per opted-in user. The cron isn't wired in
 * this slice — the template ships first so the cron can be a thin
 * data-gatherer when it lands.
 *
 * Off by default; only sends if `notification_prefs.weekly_digest`
 * is true AND the email-channel toggle for `weekly_digest` is on.
 */

import { emailWrap, button, escapeHtml, plainText, STYLES } from "./_chrome";

export interface WeeklyDigestVars {
  name?: string | null;
  /** ISO date of the Monday-morning send (label only). */
  weekOf: string;

  /** Number of tasks marked done last week. */
  tasksCompleted: number;
  /** Number of tasks still assigned to the user (any status). */
  tasksOpen: number;
  /** Number of comments left on stuff the user follows. */
  commentsOnFollowed: number;
  /** Number of unread @-mentions. */
  unreadMentions: number;

  /** Up to ~5 highlight lines — short, plain strings. Rendered as a list. */
  highlights: string[];

  /** Workspace label for the digest. */
  workspaceName: string;
  /** Deep link back to the workspace overview / dashboard. */
  dashboardUrl: string;
}

export function weeklyDigestEmail(vars: WeeklyDigestVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.name ? `Hi ${escapeHtml(vars.name)},` : "Hi,";
  const weekLabel = formatWeek(vars.weekOf);
  const highlights = (vars.highlights ?? [])
    .slice(0, 5)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const highlightsBlock = highlights
    ? `
      <h2 style="margin: 24px 0 8px; font-size: 16px; font-weight: 600; color: #0a0a0a;">Highlights</h2>
      <ul style="${STYLES.ul}">${highlights}</ul>
    `
    : "";

  const html = emailWrap(`
    <h1 style="${STYLES.h1}">Your week in ${escapeHtml(vars.workspaceName)}.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">Here's how last week shaped up (${escapeHtml(weekLabel)}):</p>
    <ul style="${STYLES.ul}">
      <li><strong>${vars.tasksCompleted}</strong> tasks completed</li>
      <li><strong>${vars.tasksOpen}</strong> tasks still assigned to you</li>
      <li><strong>${vars.commentsOnFollowed}</strong> new comments on things you follow</li>
      <li><strong>${vars.unreadMentions}</strong> unread @-mentions</li>
    </ul>
    ${highlightsBlock}
    ${button("Open workspace", vars.dashboardUrl)}
    <p style="${STYLES.small}">
      You're getting this because "Weekly digest" is on in your
      <a href="https://spacefield.co/account/email" style="${STYLES.link}">email preferences</a>.
      Turn it off there any time.
    </p>
  `);
  return {
    subject: `Your week in ${vars.workspaceName} — ${weekLabel}`,
    html,
    text: plainText(html),
  };
}

function formatWeek(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
