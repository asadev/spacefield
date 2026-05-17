import "server-only";

/**
 * lib/email/unsubscribe-token.ts — HMAC-signed unsubscribe tokens.
 *
 * Gmail's 2024 bulk-sender rules require a one-click unsubscribe path.
 * That path has to work WITHOUT the recipient being signed in — they
 * click a link in an email, possibly forwarded, possibly on a device
 * they've never signed in on. So the token has to be self-contained
 * and tamper-proof.
 *
 * Token shape:
 *   base64url(json) + "." + base64url(hmac_sha256(json, secret))
 *
 * The payload is `{ u: user_id, k: email_kind, e: expires_at_seconds }`.
 * `email_kind` maps to a column on `notification_prefs` (see
 * KIND_TO_COLUMN below). When /unsubscribe verifies, it flips THAT
 * column to false — never blanket-mutes everything.
 *
 * Secret:
 *   `UNSUBSCRIBE_TOKEN_SECRET` (preferred) or falls back to
 *   `AUTH_FINGERPRINT_SECRET` so single-engineer dev setups don't have
 *   to wire a fourth secret. In production we use the dedicated one.
 *
 * Why HMAC and not a row in `unsubscribe_tokens`:
 *   - We mail tokens to people who may never click. A row table grows
 *     unboundedly and we'd have to garbage-collect it.
 *   - HMAC tokens with embedded expiry are stateless — verification
 *     is constant-time and there's no DB round-trip.
 *   - One-click unsub has to be fast (Gmail expects <2s round trip).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { log } from "@/lib/log";

/**
 * Logical email kinds that are subject to one-click unsubscribe.
 *
 * Anything NOT in this map is transactional (suspicious-login, password
 * reset, account-deletion confirm, etc.) — those don't get the
 * List-Unsubscribe header and don't accept unsub tokens.
 */
const KIND_TO_COLUMN: Record<string, keyof NotificationPrefsCols> = {
  "weekly-digest": "weekly_digest",
  "email-marketing": "email_marketing",
  "task-assigned": "task_assigned",
  "task-completed": "task_completed",
  "comment-mention": "comment_mention",
  "timeoff-decision": "timeoff_decision",
  "workspace-invite": "workspace_invite",
};

interface NotificationPrefsCols {
  comment_mention: boolean;
  task_assigned: boolean;
  task_completed: boolean;
  timeoff_decision: boolean;
  workspace_invite: boolean;
  weekly_digest: boolean;
  email_marketing: boolean;
}

export type UnsubKind = keyof typeof KIND_TO_COLUMN;

/** Email kinds that bypass List-Unsubscribe entirely. */
const TRANSACTIONAL_KINDS: ReadonlySet<string> = new Set([
  "suspicious-login",
  "account-deletion-confirm",
  "password-reset",
  "email-verify",
  "magic-link",
  "billing-receipt",
  "invoice",
]);

export function isTransactionalKind(kind: string): boolean {
  return TRANSACTIONAL_KINDS.has(kind);
}

export function columnForKind(kind: string): keyof NotificationPrefsCols | null {
  return KIND_TO_COLUMN[kind] ?? null;
}

interface Payload {
  /** user_id */
  u: string;
  /** email kind */
  k: UnsubKind;
  /** expires_at, unix seconds */
  e: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

function secret(): string {
  const s =
    process.env.UNSUBSCRIBE_TOKEN_SECRET ||
    process.env.AUTH_FINGERPRINT_SECRET ||
    "spacefield-unsubscribe-dev-secret-do-not-use-in-prod";
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(
    s.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

/**
 * Sign a token. Returns the opaque string to embed in a List-Unsubscribe
 * URL (`https://spacefield.co/unsubscribe?t=<token>`).
 *
 * `ttlSeconds` defaults to 90 days. Most marketing/digest emails won't
 * be opened months after sending, but the link in someone's archive
 * should still work — 90 days is the sensible upper bound.
 */
export function signUnsubscribeToken(
  user_id: string,
  kind: UnsubKind,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const payload: Payload = {
    u: user_id,
    k: kind,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const json = JSON.stringify(payload);
  const body = b64urlEncode(Buffer.from(json, "utf8"));
  const sig = createHmac("sha256", secret()).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export type VerifyResult =
  | { ok: true; user_id: string; kind: UnsubKind }
  | {
      ok: false;
      reason: "malformed" | "bad_signature" | "expired" | "unknown_kind";
    };

/**
 * Verify and unpack a token. Constant-time signature comparison; does
 * not log the token (logging tokens is the same mistake as logging
 * password-reset links). On any failure we return a structured reason
 * so the route can log the failure category without leaking which
 * specific failure mode the attacker triggered.
 */
export function verifyUnsubscribeToken(token: string): VerifyResult {
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const [body, sigB64] = token.split(".", 2);
  if (!body || !sigB64) return { ok: false, reason: "malformed" };

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", secret()).update(body).digest();
    provided = b64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (expected.length !== provided.length) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: Payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as Payload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    !payload ||
    typeof payload.u !== "string" ||
    typeof payload.k !== "string" ||
    typeof payload.e !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.e < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  if (!KIND_TO_COLUMN[payload.k]) {
    return { ok: false, reason: "unknown_kind" };
  }
  return { ok: true, user_id: payload.u, kind: payload.k as UnsubKind };
}

/**
 * Apply an unsubscribe: flip the matching notification_prefs column to
 * false. Idempotent — if the row doesn't exist, insert one with the
 * usual defaults but with the target column set to false. If the
 * column is already false, no-op (the user still sees a confirmation).
 *
 * Uses the service-role admin client because the user is, by
 * construction, NOT authenticated when they click the link.
 */
export async function applyUnsubscribe(
  user_id: string,
  kind: UnsubKind,
): Promise<{ ok: boolean; error?: string }> {
  const col = KIND_TO_COLUMN[kind];
  if (!col) return { ok: false, error: "unknown_kind" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { error } = await admin
      .from("notification_prefs")
      .upsert(
        {
          user_id,
          [col]: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) {
      log.error("unsubscribe.upsert_failed", {
        kind,
        msg: error.message,
      });
      return { ok: false, error: error.message };
    }
    log.info("unsubscribe.applied", { kind });
    return { ok: true };
  } catch (e) {
    log.error("unsubscribe.exception", {
      kind,
      msg: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "exception" };
  }
}

/**
 * Build the List-Unsubscribe header value for a given user + kind. Use
 * this from `sendEmail()`. Returns null when the email is transactional
 * (caller should not set the header at all in that case).
 */
export function buildListUnsubscribeHeaders(
  user_id: string | null | undefined,
  kind: string,
  baseUrl: string = "https://spacefield.co",
): { listUnsubscribe: string; listUnsubscribePost: string } | null {
  if (!user_id) return null;
  if (isTransactionalKind(kind)) return null;
  if (!KIND_TO_COLUMN[kind]) return null;

  const token = signUnsubscribeToken(user_id, kind as UnsubKind);
  const httpUrl = `${baseUrl}/unsubscribe?t=${encodeURIComponent(token)}`;
  const mailto = `mailto:unsubscribe@spacefield.co?subject=${encodeURIComponent(
    "Unsub",
  )}`;
  return {
    listUnsubscribe: `<${httpUrl}>, <${mailto}>`,
    listUnsubscribePost: "List-Unsubscribe=One-Click",
  };
}
