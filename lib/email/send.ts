import "server-only";

/**
 * lib/email/send.ts — provider-agnostic email sender.
 *
 * Wave-4 Z3: a single `sendEmail()` that "just works" whether or not
 * a transactional provider is wired. Fallthrough order:
 *
 *   1. `RESEND_API_KEY` set       → POST to Resend (https://api.resend.com)
 *   2. else `POSTMARK_API_KEY`    → POST to Postmark (https://api.postmarkapp.com)
 *   3. else                       → persist to `email_outbox` for replay
 *
 * In all three paths we ALSO persist to `email_outbox` if the provider
 * call throws or returns non-2xx — so we never silently lose a message.
 *
 * Why this exists alongside `lib/email.ts`:
 *   The legacy `lib/email.ts` is Resend-only and explodes its own
 *   markup helpers inline. This module is the forward path — call
 *   sites that pre-build `{subject, html, text}` (the way the new
 *   templates do) should use `sendEmail()` from HERE, not from the
 *   legacy file. We don't delete the legacy module yet because too
 *   many existing call sites still depend on its template helpers.
 *
 * Fire-and-forget safety:
 *   `sendEmail()` never throws. The return shape is `{ ok, provider,
 *   message_id?, error? }`. Callers can `void sendEmail(...)` from
 *   inside cron loops or notification handlers without worrying
 *   about an unhandled rejection killing the run.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export type EmailKind =
  | "suspicious-login"
  | "welcome"
  | "task-assigned"
  | "weekly-digest"
  | "account-deletion-confirm"
  // Open string for ad-hoc / future kinds. Persisted as-is.
  | (string & {});

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. If omitted, derived from `html`. */
  text?: string;
  /** Logical kind — see `EmailKind`. Used for metrics + sender routing. */
  kind: EmailKind;
  /** Optional workspace scope. Persisted to `email_outbox` for routing. */
  workspace_id?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  provider: "resend" | "postmark" | "outbox" | "none";
  message_id?: string;
  error?: string;
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM_NOREPLY ||
  "Space Field <noreply@spacefield.co>";

/* ─────────────────────────── public API ─────────────────────────── */

export async function sendEmail(
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const text = args.text ?? deriveText(args.html);

  // 1. Resend.
  if (process.env.RESEND_API_KEY) {
    const res = await sendViaResend({ ...args, text });
    if (res.ok) return res;
    // Persist for retry, fall through to outbox-as-failure-sink.
    await persistOutbox({
      ...args,
      text,
      status: "failed",
      provider: "resend",
      error: res.error ?? "resend_failed",
      attempts: 1,
    });
    return res;
  }

  // 2. Postmark.
  if (process.env.POSTMARK_API_KEY) {
    const res = await sendViaPostmark({ ...args, text });
    if (res.ok) return res;
    await persistOutbox({
      ...args,
      text,
      status: "failed",
      provider: "postmark",
      error: res.error ?? "postmark_failed",
      attempts: 1,
    });
    return res;
  }

  // 3. No provider configured — queue for later.
  log.warn("email.no_provider_configured", {
    kind: args.kind,
    to_hash: hashFor(args.to),
  });
  const id = await persistOutbox({
    ...args,
    text,
    status: "queued",
    provider: null,
    attempts: 0,
  });
  return {
    ok: true,
    provider: "outbox",
    message_id: id ?? undefined,
  };
}

/* ─────────────────────────── Resend path ─────────────────────────── */

interface ResendSendBody {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

async function sendViaResend(
  args: SendEmailArgs & { text: string },
): Promise<SendEmailResult> {
  const body: ResendSendBody = {
    from: DEFAULT_FROM,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await safeReadBody(r);
      return {
        ok: false,
        provider: "resend",
        error: `resend ${r.status}: ${errText}`,
      };
    }
    const json = (await r.json().catch(() => ({}))) as { id?: string };
    return {
      ok: true,
      provider: "resend",
      message_id: json.id,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "resend",
      error: e instanceof Error ? e.message : "resend_fetch_failed",
    };
  }
}

/* ─────────────────────────── Postmark path ────────────────────────── */

interface PostmarkSendBody {
  From: string;
  To: string;
  Subject: string;
  HtmlBody: string;
  TextBody: string;
  MessageStream: string;
}

async function sendViaPostmark(
  args: SendEmailArgs & { text: string },
): Promise<SendEmailResult> {
  const body: PostmarkSendBody = {
    From: DEFAULT_FROM,
    To: args.to,
    Subject: args.subject,
    HtmlBody: args.html,
    TextBody: args.text,
    // 'outbound' is Postmark's default transactional stream. Workspaces
    // with their own stream override via env var.
    MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
  };
  try {
    const r = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_API_KEY ?? "",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errText = await safeReadBody(r);
      return {
        ok: false,
        provider: "postmark",
        error: `postmark ${r.status}: ${errText}`,
      };
    }
    const json = (await r.json().catch(() => ({}))) as { MessageID?: string };
    return {
      ok: true,
      provider: "postmark",
      message_id: json.MessageID,
    };
  } catch (e) {
    return {
      ok: false,
      provider: "postmark",
      error: e instanceof Error ? e.message : "postmark_fetch_failed",
    };
  }
}

/* ─────────────────────── email_outbox persistence ─────────────────── */

interface PersistArgs extends SendEmailArgs {
  text: string;
  status: "queued" | "failed";
  provider: "resend" | "postmark" | null;
  error?: string;
  attempts: number;
}

async function persistOutbox(args: PersistArgs): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("email_outbox")
      .insert({
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        kind: args.kind,
        workspace_id: args.workspace_id ?? null,
        status: args.status,
        provider: args.provider,
        error: args.error ?? null,
        attempts: args.attempts,
      })
      .select("id")
      .single();
    if (error) {
      log.error("email.outbox_insert_failed", {
        kind: args.kind,
        msg: error.message,
      });
      return null;
    }
    return (data?.id as string | undefined) ?? null;
  } catch (e) {
    // Don't let outbox persistence failures cascade — the caller still
    // gets a sensible result and we surface the failure in logs.
    log.error("email.outbox_insert_exception", {
      kind: args.kind,
      msg: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

function deriveText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function safeReadBody(r: Response): Promise<string> {
  try {
    const t = await r.text();
    return t.slice(0, 500);
  } catch {
    return "<unreadable>";
  }
}

/** Short, non-reversible identifier for the recipient. Used only for
 *  log lines so we never write a plaintext email address to a log row. */
function hashFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
