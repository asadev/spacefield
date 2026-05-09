/**
 * DB-driven email templates.
 *
 * Templates live in `public.email_templates` and are edited from the admin
 * panel at `/admin/emails`. Any code path that needs to send a templated
 * email should call `sendTemplate({ templateKey, to, vars })` instead of
 * hard-coding markup — the admin can then tweak subject/body without a
 * deploy.
 *
 * - `renderTemplate()` is a pure substitution helper for `{{var}}` tokens.
 *   Safe to call from previews (no DB, no network).
 * - `sendTemplate()` reads the template from Supabase, substitutes vars,
 *   delegates to the existing Resend wrapper in `lib/email.ts`, and logs
 *   every attempt to `email_sends`. If the template key isn't found the
 *   call is a noop (returns null) — caller should handle null gracefully.
 *
 * This file imports `sendEmail` from `lib/email.ts`. It must NOT modify
 * that file.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { sendEmail } from "@/lib/email";
import type { EmailRole } from "@/lib/email-senders";

/* ─────────────────────── renderTemplate ─────────────────────── */

/**
 * Substitute `{{variable}}` tokens in `html` with values from `vars`.
 * Tokens may have whitespace around the name (`{{ name }}`). Unknown
 * tokens are left untouched so previews surface them.
 */
export function renderTemplate(
  html: string,
  vars: Record<string, string>
): string {
  if (!html) return "";
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key] ?? "");
    }
    return full;
  });
}

/* ─────────────────────── sendTemplate ─────────────────────── */

interface SendTemplateOpts {
  templateKey: string;
  to: string | string[];
  vars: Record<string, string>;
  workspaceId?: string;
  /** Optional override for who triggered this send (for audit). */
  sentBy?: string;
}

/**
 * Read the template, substitute vars, send via Resend, and log to
 * `email_sends`. Returns the Resend message id (`{ id }`) on success,
 * `null` if the template is missing/disabled or Resend wasn't sent (e.g.
 * RESEND_API_KEY not set).
 */
export async function sendTemplate(
  opts: SendTemplateOpts
): Promise<{ id: string } | null> {
  const admin = createAdminClient();

  const { data: tpl, error: tplErr } = await admin
    .from("email_templates")
    .select(
      "key, display_name, subject, html, plain_text, role, enabled"
    )
    .eq("key", opts.templateKey)
    .maybeSingle();

  if (tplErr || !tpl) {
    console.warn(
      `[email-templates] template not found: ${opts.templateKey}` +
        (tplErr ? ` (${tplErr.message})` : "")
    );
    return null;
  }

  if (!tpl.enabled) {
    console.warn(
      `[email-templates] template disabled, skipping: ${opts.templateKey}`
    );
    return null;
  }

  const subject = renderTemplate(tpl.subject ?? "", opts.vars);
  const html = renderTemplate(tpl.html ?? "", opts.vars);
  const text = tpl.plain_text
    ? renderTemplate(tpl.plain_text, opts.vars)
    : undefined;

  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];
  const role = tpl.role as EmailRole | null;

  let sendResult: { id: string } | null = null;
  let sendError: string | null = null;

  try {
    sendResult = await sendEmail({
      to: opts.to,
      subject,
      html,
      text,
      from: role ?? "noreply",
    });
  } catch (err) {
    sendError =
      err instanceof Error ? err.message : "email send failed";
  }

  // Log every recipient as its own row so the admin can see per-address
  // status. status='sent' if Resend returned an id, 'failed' otherwise.
  const rows = recipients.map((recipient) => ({
    template_key: tpl.key,
    to_email: recipient,
    subject,
    status: sendError
      ? ("failed" as const)
      : sendResult
        ? ("sent" as const)
        : ("queued" as const),
    provider_id: sendResult?.id ?? null,
    error: sendError,
    sent_by: opts.sentBy ?? null,
    workspace_id: opts.workspaceId ?? null,
    metadata: {} as Record<string, unknown>,
  }));

  const { error: logErr } = await admin.from("email_sends").insert(rows);
  if (logErr) {
    // Don't throw — the email may have already been sent. Surface for ops.
    console.error("[email-templates] failed to log email_sends:", logErr);
  }

  if (sendError) {
    throw new Error(sendError);
  }

  return sendResult;
}
