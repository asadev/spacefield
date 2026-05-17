/**
 * welcome.ts — post-signup welcome.
 *
 * Sent the first time a user confirms their email. Distinct from the
 * legacy `welcomeEmail()` in lib/email.ts (which still services older
 * call paths). When a call site is migrated to the new `sendEmail()`
 * helper from `lib/email/send.ts`, it should use this template.
 */

import { emailWrap, button, escapeHtml, plainText, STYLES } from "./_chrome";

export interface WelcomeVars {
  name?: string | null;
  /** Optional deep link — usually the OS desktop. Defaults to homepage. */
  ctaUrl?: string;
}

export function welcomeEmail(vars: WelcomeVars): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = vars.name ? `Hi ${escapeHtml(vars.name)},` : "Hi,";
  const cta = vars.ctaUrl ?? "https://spacefield.co";
  const html = emailWrap(`
    <h1 style="${STYLES.h1}">Welcome to Space Field.</h1>
    <p style="${STYLES.p}">${greeting}</p>
    <p style="${STYLES.p}">
      Space Field is a desktop OS that runs in your browser. Create
      workspaces, install tools, invite your team — your setup
      follows you across devices.
    </p>
    <p style="${STYLES.p}">A few quick starts:</p>
    <ul style="${STYLES.ul}">
      <li>Press <strong>⌘ K</strong> anywhere to open the launcher.</li>
      <li>Click your avatar (top-right) to manage your profile.</li>
      <li>Right-click the dock to customize what's pinned.</li>
      <li>File menu → New Workspace to set up a second one.</li>
    </ul>
    ${button("Open Space Field", cta)}
    <p style="${STYLES.small}">
      Reply to this email any time — it goes straight to us.
    </p>
  `);
  return {
    subject: "Welcome to Space Field",
    html,
    text: plainText(html),
  };
}
