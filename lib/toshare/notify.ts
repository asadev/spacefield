/* Form-submit notification fan-out.
 *
 * When a public form is submitted, we (a) record it in the DB and (b)
 * notify the owner via webhook + email if configured. Both notifications
 * fire concurrently with timeouts so a slow webhook never delays the
 * user's "Thanks!" response.
 */

import "server-only";
import { sendEmail } from "@/lib/email";
import type { FormPayload, ToShareLinkRow } from "./types";
import { buildToShareUrl } from "./types";

const WEBHOOK_TIMEOUT_MS = 5_000;

export interface SubmitNotifyInput {
  link: ToShareLinkRow;
  values: Record<string, unknown>;
  ipHash: string;
}

/* Fire-and-forget webhook + email. Does NOT throw; errors are logged. */
export async function notifyOnSubmit(input: SubmitNotifyInput): Promise<void> {
  const { link, values } = input;
  if (link.type !== "form") return;
  const payload = link.payload as unknown as FormPayload;

  const url = buildToShareUrl(link);
  const summary = formatSummary(payload, values);

  await Promise.allSettled([
    payload.webhookUrl ? fireWebhook(payload.webhookUrl, link, values, url) : Promise.resolve(),
    payload.notifyEmail ? fireEmail(payload.notifyEmail, payload, summary, url) : Promise.resolve(),
  ]);
}

function formatSummary(payload: FormPayload, values: Record<string, unknown>): string {
  // Human-readable: Label: value, one per line
  const lines: string[] = [];
  for (const f of payload.fields) {
    const v = values[f.id];
    if (v === undefined || v === null || v === "") continue;
    lines.push(`${f.label}: ${typeof v === "boolean" ? (v ? "✓" : "✗") : String(v)}`);
  }
  return lines.join("\n");
}

async function fireWebhook(
  webhookUrl: string,
  link: ToShareLinkRow,
  values: Record<string, unknown>,
  publicUrl: string
): Promise<void> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), WEBHOOK_TIMEOUT_MS);
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "toshare-webhook/1.0",
      },
      body: JSON.stringify({
        event: "form.submitted",
        timestamp: new Date().toISOString(),
        linkId: link.id,
        slug: link.slug,
        sourceTool: link.source_tool,
        publicUrl,
        values,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    console.warn("[toshare] webhook failed:", err instanceof Error ? err.message : err);
  }
}

async function fireEmail(
  to: string,
  payload: FormPayload,
  summary: string,
  publicUrl: string
): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  try {
    const html = renderSubmitEmail({ payload, summary, publicUrl });
    await sendEmail({
      to,
      subject: `New submission · ${payload.title || "Form"}`,
      html,
      text: `New submission to ${payload.title || "your form"}.\n\n${summary}\n\nForm URL: ${publicUrl}`,
      from: "noreply",
    });
  } catch (err) {
    console.warn("[toshare] email notify failed:", err instanceof Error ? err.message : err);
  }
}

function renderSubmitEmail(args: {
  payload: FormPayload;
  summary: string;
  publicUrl: string;
}): string {
  const accent = args.payload.brandColor ?? "#0f172a";
  const escaped = args.summary
    .split("\n")
    .map((l) => `<div style="margin-bottom:6px;">${escapeHtml(l)}</div>`)
    .join("");
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <div style="border-left:3px solid ${accent};padding-left:12px;margin-bottom:18px;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">New submission</div>
      <div style="font-size:18px;font-weight:600;color:#0f172a;margin-top:2px;">${escapeHtml(args.payload.title || "Form")}</div>
    </div>
    <div style="color:#334155;font-size:14px;line-height:1.5;">
      ${escaped}
    </div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <a href="${escapeAttr(args.publicUrl)}" style="font-size:13px;color:#64748b;text-decoration:none;">View form</a>
    </div>
  </div>
  <div style="text-align:center;margin-top:14px;font-size:11px;color:#94a3b8;">
    Sent via toshare.net
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
