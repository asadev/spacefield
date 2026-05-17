/**
 * task-assigned.ts — "X assigned you a task".
 *
 * Fired by the Tasks app when a task is created with you as the
 * assignee, OR when an existing task is re-assigned to you.
 *
 * Gated by the user's `task_assigned` toggle on `notification_prefs`
 * (and the new email-channel toggle from /account/email).
 */

import { emailWrap, button, escapeHtml, plainText, STYLES } from "./_chrome";

export interface TaskAssignedVars {
  /** Display name of the assignee receiving the email. */
  assigneeName?: string | null;
  /** Display name of whoever did the assigning. */
  assignerName: string;
  /** Task title. */
  taskTitle: string;
  /** Optional one-line task description / first 200 chars of body. */
  taskSummary?: string | null;
  /** Optional due date, ISO. Rendered if present. */
  dueDate?: string | null;
  /** Workspace label for context. */
  workspaceName: string;
  /** Absolute URL to the task. */
  taskUrl: string;
}

export function taskAssignedEmail(vars: TaskAssignedVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.assigneeName
    ? `Hi ${escapeHtml(vars.assigneeName)},`
    : "Hi,";
  const dueLine = vars.dueDate
    ? `<li><strong>Due:</strong> ${escapeHtml(formatDate(vars.dueDate))}</li>`
    : "";
  const summaryLine = vars.taskSummary
    ? `<li><strong>Details:</strong> ${escapeHtml(vars.taskSummary)}</li>`
    : "";
  const html = emailWrap(`
    <h1 style="${STYLES.h1}">${escapeHtml(vars.assignerName)} assigned you a task.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">
      <strong>${escapeHtml(vars.assignerName)}</strong> just assigned you
      <strong>${escapeHtml(vars.taskTitle)}</strong> in
      <strong>${escapeHtml(vars.workspaceName)}</strong>.
    </p>
    <ul style="${STYLES.ul}">
      ${summaryLine}
      ${dueLine}
    </ul>
    ${button("Open task", vars.taskUrl)}
    <p style="${STYLES.small}">
      You're getting this because "Task assignments" is on in your
      <a href="https://spacefield.co/account/email" style="${STYLES.link}">email preferences</a>.
    </p>
  `);
  return {
    subject: `${vars.assignerName} assigned you a task: ${vars.taskTitle}`,
    html,
    text: plainText(html),
  };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
