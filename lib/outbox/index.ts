import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { sendEmail } from "@/lib/email/send";
import { accountDeletionConfirmEmail } from "@/lib/email/templates/account-deletion-confirm";

/**
 * lib/outbox/index.ts — Transactional outbox helpers.
 *
 * What it does
 * ────────────
 * The "transactional outbox" pattern (used by e.g. Stripe, every
 * decent event-driven system) solves a single problem cleanly:
 *
 *   "I just wrote a row to my primary table. I also want to fire a
 *    side-effect — push notification, webhook, downstream HTTP call,
 *    analytics ping. How do I guarantee 'exactly once' even if my
 *    code crashes between the two operations, or if the request is
 *    retried at the edge?"
 *
 * Answer: write a row to `event_outbox` INSIDE THE SAME TRANSACTION
 * as your primary write. A separate "relay" process polls the outbox
 * and emits the events; it can be retried freely because the relay
 * marks rows processed only after the side-effect succeeds.
 *
 * Two halves
 * ──────────
 *   `emit(event_type, payload)`  — call this from the server action
 *                                   that just did the primary write.
 *                                   Inserts a 'queued' row. Idempotent
 *                                   if you pass a stable `dedupe_key`.
 *
 *   `runOutboxRelay()`           — called by /api/cron/outbox-relay
 *                                   once a minute. Claims a batch of
 *                                   due rows, dispatches them to the
 *                                   registered handlers, marks results.
 *
 * Event-type taxonomy (current)
 * ─────────────────────────────
 *   webhook.deliver        - payload: { delivery_id, url, body, ... }
 *   notification.fanout    - payload: { recipients[], kind, ... }
 *   audit.record           - payload: { action, target, actor_id, ... }
 *   account.deletion_queued- payload: { user_id, grace_until }
 *   file.finalize_completed- payload: { file_id, workspace_id, key }
 *   comment.mention_fanout - payload: { comment_id, mentioned[] }
 *   ai.batch_callback      - payload: { job_id, status, result }
 *   social.publish_due     - payload: { post_id }
 *
 * Adding a new event type
 * ───────────────────────
 *   1. Pick a name; document it in the list above.
 *   2. Add a handler entry in OUTBOX_HANDLERS below.
 *   3. Call `emit("your.event", { ... })` from the producing code.
 *
 * Degrades gracefully
 * ───────────────────
 *   If the `event_outbox` table doesn't exist yet (migration not
 *   applied), `emit()` logs once and returns ok=false; producers
 *   shouldn't fail their primary write because of an outbox miss.
 *   Same shape as lib/idempotency.ts.
 */

export interface EmitOpts {
  /** Stable dedup token. If two producers emit the same event with
   *  the same dedupe_key, only the first insert survives — second is
   *  silently dropped by the partial unique index. */
  dedupeKey?: string | null;
  /** Override the max retries. Defaults to 5 (table default). */
  maxAttempts?: number;
  /** Delay first dispatch (e.g. for "fire in 5 minutes" semantics). */
  delaySeconds?: number;
}

export interface EmitResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** True if the dedupe_key matched an existing row and we no-op'd. */
  deduped?: boolean;
}

interface OutboxRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  created_at: string;
  processed_at: string | null;
  error: string | null;
  dedupe_key: string | null;
}

let warnedMissingTable = false;

function looksLikeMissingTable(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("event_outbox") &&
    (m.includes("does not exist") ||
      m.includes("not found") ||
      m.includes("pgrst205"))
  );
}

/**
 * Insert a 'queued' row into event_outbox. Returns the new row id.
 *
 * Producers should call this from inside the transaction that did
 * their primary write — typically a server action that just persisted
 * the user-visible row and now wants to fire a side-effect.
 *
 * NOTE: PostgREST insert is *not* in the same DB transaction as a
 * separately-issued INSERT from earlier in your code. To get true
 * transactional semantics, do BOTH writes through a single RPC or
 * use a Postgres function. For most of our call sites the producer
 * is a server action that does ONE row write + ONE outbox emit, both
 * via PostgREST — and the outbox row is what the relay re-tries from,
 * so a partial failure (primary write succeeds, outbox emit fails) is
 * the only case where exactly-once devolves to at-most-once. We
 * accept that for now; document any call site that needs stricter
 * guarantees with an inline note.
 */
export async function emit(
  event_type: string,
  payload: Record<string, unknown>,
  opts: EmitOpts = {},
): Promise<EmitResult> {
  if (!event_type || typeof event_type !== "string") {
    return { ok: false, error: "event_type required" };
  }
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    event_type,
    payload: payload ?? {},
    status: "queued",
    next_attempt_at: opts.delaySeconds
      ? new Date(Date.now() + opts.delaySeconds * 1000).toISOString()
      : new Date().toISOString(),
  };
  if (opts.maxAttempts && opts.maxAttempts > 0) {
    row.max_attempts = Math.min(opts.maxAttempts, 20);
  }
  if (opts.dedupeKey) {
    row.dedupe_key = opts.dedupeKey;
  }

  const { data, error } = await admin
    .from("event_outbox")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    if (looksLikeMissingTable(error.message)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        log.warn("outbox.table_missing", {
          note: "event_outbox table not found — outbox emits are no-ops until migration applies",
        });
      }
      return { ok: false, error: "table missing" };
    }
    // Unique-constraint violation on dedupe_key — treat as success
    // ("the event was already queued"). PG error code 23505.
    const isDup =
      (error.code && String(error.code) === "23505") ||
      /duplicate key|unique constraint/i.test(error.message ?? "");
    if (isDup && opts.dedupeKey) {
      return { ok: true, deduped: true };
    }
    log.warn("outbox.emit_failed", { event_type, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true, id: (data as { id: string } | null)?.id };
}

/* ────────────────────── handlers + relay ────────────────────── */

/**
 * Handler: given a claimed outbox row, do the side-effect and return
 * `{ ok: true }` on success or `{ ok: false, error }` on failure. The
 * relay handles status updates + retry scheduling — handlers focus on
 * the actual delivery.
 */
type OutboxHandler = (
  row: OutboxRow,
) => Promise<{ ok: boolean; error?: string }>;

const OUTBOX_HANDLERS: Record<string, OutboxHandler> = {
  /** Generic webhook delivery: POST payload.body to payload.url. */
  "webhook.deliver": async (row) => {
    const p = row.payload as { url?: string; body?: unknown };
    if (!p?.url || typeof p.url !== "string") {
      return { ok: false, error: "payload.url required" };
    }
    try {
      const res = await safeFetch(p.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(p.body ?? {}),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `http ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (e) {
      if (e instanceof SafeFetchError) {
        return { ok: false, error: `ssrf_blocked:${e.reason}` };
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /** Insert notifications rows for a batch of recipients. */
  "notification.fanout": async (row) => {
    const p = row.payload as {
      recipients?: Array<{ user_id: string; workspace_id?: string | null }>;
      kind?: string;
      title?: string;
      body?: string;
      href?: string;
      source_entity_type?: string;
      source_entity_id?: string;
      actor_user_id?: string | null;
      extra?: Record<string, unknown>;
    };
    if (!Array.isArray(p?.recipients) || p.recipients.length === 0) {
      return { ok: true };
    }
    const admin = createAdminClient();
    const inserts = p.recipients
      .filter((r) => r && typeof r.user_id === "string")
      .map((r) => ({
        recipient_user_id: r.user_id,
        workspace_id: r.workspace_id ?? null,
        kind: p.kind ?? "system",
        title: p.title ?? null,
        body: p.body ?? null,
        href: p.href ?? null,
        source_entity_type: p.source_entity_type ?? null,
        source_entity_id: p.source_entity_id ?? null,
        actor_user_id: p.actor_user_id ?? null,
        payload: p.extra ?? {},
      }));
    if (inserts.length === 0) return { ok: true };
    const { error } = await admin.from("notifications").insert(inserts);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  /** Record an audit row. */
  "audit.record": async (row) => {
    const p = row.payload as Record<string, unknown>;
    const admin = createAdminClient();
    const { error } = await admin.from("audit_log").insert({
      action: typeof p.action === "string" ? p.action : "outbox.event",
      target_type: typeof p.target_type === "string" ? p.target_type : null,
      target_id: typeof p.target_id === "string" ? p.target_id : null,
      actor_user_id: typeof p.actor_user_id === "string" ? p.actor_user_id : null,
      metadata: p.metadata ?? null,
    });
    if (error) {
      // audit_log may not exist in some test DBs — don't fail loudly.
      if (/does not exist|PGRST205/i.test(error.message)) {
        return { ok: true };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  /** account.deletion_queued — fires the lifecycle confirmation email.
   *  Two variants distinguished by payload.kind:
   *    "scheduled" → 30-day grace warning, sent at request time.
   *    "final"     → "your data has been purged" notice, sent right
   *                  before the cron purges the row.
   *  Defaults to "scheduled" for backwards-compat with rows queued
   *  before the kind field existed.
   *  Email lookup goes through admin.auth.admin.getUserById since the
   *  payload only carries user_id, not the email. If the user is
   *  already gone (deleted between queue + dispatch) we treat that as
   *  ok=true — there's no one to email anyway.
   *
   *  We also accept an explicit `email` in payload as a fallback for
   *  the "final" case: the cron snapshots emails BEFORE deletion and
   *  passes them in so we don't race the cascade. */
  "account.deletion_queued": async (row) => {
    const p = row.payload as {
      user_id?: string;
      grace_until?: string;
      reason?: string | null;
      kind?: "scheduled" | "final";
      email?: string;
      name?: string | null;
    };
    const kind = p?.kind === "final" ? "final" : "scheduled";
    const userId = typeof p?.user_id === "string" ? p.user_id : null;
    if (!userId && !p?.email) {
      return { ok: false, error: "payload.user_id or payload.email required" };
    }

    let email = typeof p?.email === "string" ? p.email : "";
    let name: string | null = typeof p?.name === "string" ? p.name : null;
    if (!email && userId) {
      try {
        const admin = createAdminClient();
        const { data, error } = await admin.auth.admin.getUserById(userId);
        if (error) {
          // User no longer exists — final-purge race. Treat as success
          // so the row marks processed (no email is the right outcome).
          if (/not found|user_not_found/i.test(error.message)) {
            return { ok: true };
          }
          return { ok: false, error: error.message };
        }
        email = data?.user?.email ?? "";
        if (!name) {
          const meta = data?.user?.user_metadata as
            | { full_name?: string; name?: string }
            | undefined;
          name = meta?.full_name ?? meta?.name ?? null;
        }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    if (!email) {
      // Nothing to send to — count as processed; no point retrying.
      return { ok: true };
    }

    const purgeAt = typeof p?.grace_until === "string" ? p.grace_until : new Date().toISOString();
    const tpl = accountDeletionConfirmEmail({
      kind,
      purgeAt,
      name,
      cancelUrl: "https://spacefield.co/account",
    });

    const result = await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      kind: "account-deletion-confirm",
      user_id: userId,
    });
    // sendEmail never throws and persists to email_outbox on any
    // provider failure, so ok=false here means we genuinely couldn't
    // queue it at all (e.g. DB down). Surface to the outbox so it
    // retries with backoff.
    if (!result.ok) {
      return { ok: false, error: result.error ?? "send_failed" };
    }
    return { ok: true };
  },

  /** file.finalize_completed — no-op for now; reserved for indexing
   *  + virus-scanning hooks to subscribe to. */
  "file.finalize_completed": async () => ({ ok: true }),

  /** comment.mention_fanout — same: producer already wrote the
   *  notifications rows. This event lets future subscribers (push,
   *  email digest) plug in without changing the producer. */
  "comment.mention_fanout": async () => ({ ok: true }),

  /** ai.batch_callback — reserved hook for AI batch downstream. */
  "ai.batch_callback": async () => ({ ok: true }),

  /** social.publish_due — reserved. */
  "social.publish_due": async () => ({ ok: true }),
};

export interface RelayResult {
  claimed: number;
  processed: number;
  failed: number;
  skipped_unhandled: number;
  ids: string[];
}

/**
 * Drain a batch of due outbox rows. Designed to be called from
 * /api/cron/outbox-relay every minute.
 *
 * The flow:
 *   1. claim_outbox_batch RPC atomically flips up to N due rows to
 *      status='processing' and returns them.
 *   2. For each row, look up the handler by event_type and call it.
 *   3. On success: event_outbox_mark_processed.
 *      On failure: event_outbox_mark_failed (which sets status='dead'
 *      once attempts >= max_attempts, otherwise 'failed' + a backoff).
 *   4. Unhandled event_types are marked failed with a stable error
 *      message so they show up in observability without thrashing.
 */
export async function runOutboxRelay(limit = 25): Promise<RelayResult> {
  const admin = createAdminClient();
  const result: RelayResult = {
    claimed: 0,
    processed: 0,
    failed: 0,
    skipped_unhandled: 0,
    ids: [],
  };

  const { data, error } = await admin.rpc("claim_outbox_batch", {
    p_limit: Math.max(1, Math.min(limit, 100)),
  });
  if (error) {
    if (looksLikeMissingTable(error.message) || /not find the function|PGRST202/i.test(error.message)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        log.warn("outbox.relay_skipped_no_migration", { error: error.message });
      }
      return result;
    }
    log.warn("outbox.relay_claim_failed", { error: error.message });
    return result;
  }

  const rows = (data ?? []) as OutboxRow[];
  result.claimed = rows.length;
  result.ids = rows.map((r) => r.id);

  for (const row of rows) {
    const handler = OUTBOX_HANDLERS[row.event_type];
    if (!handler) {
      result.skipped_unhandled += 1;
      // Mark as failed so the row gets retried with backoff. After
      // max_attempts it'll move to 'dead' and stop polluting the queue.
      await markFailed(row.id, `no handler for event_type=${row.event_type}`);
      continue;
    }
    try {
      const outcome = await handler(row);
      if (outcome.ok) {
        await markProcessed(row.id);
        result.processed += 1;
      } else {
        await markFailed(row.id, outcome.error ?? "handler returned ok=false");
        result.failed += 1;
      }
    } catch (e) {
      await markFailed(row.id, e instanceof Error ? e.message : String(e));
      result.failed += 1;
    }
  }

  return result;
}

async function markProcessed(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("event_outbox_mark_processed", { p_id: id });
  if (error) {
    log.warn("outbox.mark_processed_failed", { id, error: error.message });
  }
}

async function markFailed(
  id: string,
  errMsg: string,
  backoffSeconds = 60,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("event_outbox_mark_failed", {
    p_id: id,
    p_error: errMsg.slice(0, 1000),
    p_backoff_seconds: backoffSeconds,
  });
  if (error) {
    log.warn("outbox.mark_failed_failed", { id, error: error.message });
  }
}

/** Re-export the event-type taxonomy as a constant so producers don't
 *  free-string the event_type. Doesn't enforce — just documents. */
export const OutboxEventTypes = {
  WebhookDeliver: "webhook.deliver",
  NotificationFanout: "notification.fanout",
  AuditRecord: "audit.record",
  AccountDeletionQueued: "account.deletion_queued",
  FileFinalizeCompleted: "file.finalize_completed",
  CommentMentionFanout: "comment.mention_fanout",
  AiBatchCallback: "ai.batch_callback",
  SocialPublishDue: "social.publish_due",
} as const;

export type OutboxEventType =
  (typeof OutboxEventTypes)[keyof typeof OutboxEventTypes];
