import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdvisoryLock, AdvisoryLockKeys } from "@/lib/db/advisory-lock";
import {
  busyMessageFor,
  checkBackpressure,
  type BackpressureStatus,
} from "@/lib/workflows/backpressure";

import { recordAiCall } from "./cost";

/**
 * Async batch AI runner.
 *
 * For prompts that may exceed the ~30s Vercel serverless ceiling (long
 * orchestrator runs, multi-document summarisation, etc.) we queue a
 * row in `ai_batch_jobs` and let `/api/cron/ai-batch-runner` chew
 * through them on a 1-minute schedule.
 *
 * Public surface:
 *   - enqueueAIBatch(...)     → returns job id, status='queued'
 *   - runQueuedAIBatch(limit) → invoked by the cron route, drains up to N rows
 *
 * The cron runner uses an atomic "claim" pattern: a single UPDATE
 * flips status from queued → running while RETURNING the rows, so two
 * overlapping cron invocations can't race the same job.
 */

const DEFAULT_BATCH_MODEL = "claude-sonnet-4-5";
// Per-job wall-clock cap. The serverless function has 5min, we cap
// each job at 4 to leave room for the bookkeeping + a small batch.
const PER_JOB_TIMEOUT_MS = 4 * 60 * 1000;

let _client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface EnqueueAIBatchInput {
  workspace_id?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  prompt: string;
  model?: string;
  callback_url?: string | null;
}

export interface EnqueueAIBatchResult {
  id: string;
  status: "queued";
}

export interface EnqueueAIBatchBusy {
  busy: true;
  error: string;
  retry_after_seconds: number;
  status: BackpressureStatus;
}

export async function enqueueAIBatch(
  input: EnqueueAIBatchInput
): Promise<EnqueueAIBatchResult | EnqueueAIBatchBusy | { error: string }> {
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) return { error: "prompt required" };

  // Apply backpressure BEFORE the insert so a queue that's already
  // deep doesn't get any deeper. See lib/workflows/backpressure.ts.
  const bp = await checkBackpressure();
  if (bp.busy) {
    return {
      busy: true,
      error: busyMessageFor(bp),
      retry_after_seconds: bp.retry_after_seconds,
      status: bp,
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_batch_jobs")
    .insert({
      workspace_id: input.workspace_id ?? null,
      user_id: input.user_id ?? null,
      agent_id: input.agent_id ?? null,
      prompt,
      model: input.model ?? DEFAULT_BATCH_MODEL,
      status: "queued",
      callback_url: input.callback_url ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "insert failed" };
  }
  return { id: (data as { id: string }).id, status: "queued" };
}

type BatchRow = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  prompt: string;
  model: string;
  callback_url: string | null;
};

export interface BatchRunResult {
  picked: number;
  done: number;
  failed: number;
  ids: string[];
}

/**
 * Pull up to `limit` queued jobs, run them sequentially against
 * Anthropic, and update the row. Designed to be called from the
 * cron route — invoked manually it'll still work but won't have the
 * auth gate.
 *
 * The advisory-lock gate keeps two overlapping cron invocations from
 * trying to drain at once. The CLAIM SQL is already atomic so this
 * is defence-in-depth, but it also stops two simultaneous runners
 * from each spending the function-budget on the same set of rows
 * (queued → running flip succeeds for only one but both still wake
 * up). If we don't get the lock, we no-op cleanly.
 */
export async function runQueuedAIBatch(limit = 5): Promise<BatchRunResult> {
  const gated = await withAdvisoryLock(AdvisoryLockKeys.AiBatchRunner, () =>
    runQueuedAIBatchInternal(limit)
  );
  if (!gated.acquired) {
    return { picked: 0, done: 0, failed: 0, ids: [] };
  }
  return gated.value as BatchRunResult;
}

async function runQueuedAIBatchInternal(limit = 5): Promise<BatchRunResult> {
  const admin = createAdminClient();

  // Claim up to `limit` queued rows. Two-step pattern because
  // PostgREST doesn't expose `ORDER BY ... LIMIT` on UPDATE: we first
  // pick the oldest queued ids, then atomically flip the matching
  // rows from queued → running with a status guard so two cron
  // invocations can't double-claim the same row.
  const queuedIds = await pickQueuedIds(limit);
  if (queuedIds.length === 0) {
    return { picked: 0, done: 0, failed: 0, ids: [] };
  }
  const { data: claimedRaw, error: claimErr } = await admin
    .from("ai_batch_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("status", "queued")
    .in("id", queuedIds)
    .select("id, workspace_id, user_id, agent_id, prompt, model, callback_url");

  if (claimErr) {
    // eslint-disable-next-line no-console
    console.warn("[ai-batch] claim failed:", claimErr.message);
    return { picked: 0, done: 0, failed: 0, ids: [] };
  }
  const claimed = (claimedRaw ?? []) as BatchRow[];
  if (claimed.length === 0) {
    return { picked: 0, done: 0, failed: 0, ids: [] };
  }

  let done = 0;
  let failed = 0;
  for (const row of claimed) {
    const outcome = await runOne(row);
    if (outcome === "done") done += 1;
    else failed += 1;
  }
  return {
    picked: claimed.length,
    done,
    failed,
    ids: claimed.map((r) => r.id),
  };
}

async function pickQueuedIds(limit: number): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_batch_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)));
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function runOne(row: BatchRow): Promise<"done" | "failed"> {
  const admin = createAdminClient();
  const client = anthropic();
  const startedAt = Date.now();

  if (!client) {
    await admin
      .from("ai_batch_jobs")
      .update({
        status: "failed",
        error: "ANTHROPIC_API_KEY not configured",
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return "failed";
  }

  // Race the API call against our wall-clock cap so a stuck row
  // doesn't burn the whole function budget.
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`per-job timeout after ${PER_JOB_TIMEOUT_MS}ms`)),
      PER_JOB_TIMEOUT_MS
    );
  });

  try {
    const response = await Promise.race([
      client.messages.create({
        model: row.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: row.prompt }],
      }),
      timeoutPromise,
    ]);
    const text =
      response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "";

    const latency = Date.now() - startedAt;
    void recordAiCall({
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      agent_id: row.agent_id,
      model: row.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      latency_ms: latency,
      status: "ok",
    });

    await admin
      .from("ai_batch_jobs")
      .update({
        status: "done",
        result: text,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // Best-effort callback. Failure here doesn't fail the job.
    if (row.callback_url) {
      void fireCallback(row.callback_url, {
        id: row.id,
        status: "done",
        result: text,
      });
    }
    return "done";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const latency = Date.now() - startedAt;
    void recordAiCall({
      workspace_id: row.workspace_id,
      user_id: row.user_id,
      agent_id: row.agent_id,
      model: row.model,
      latency_ms: latency,
      status: "error",
      error: message,
    });
    await admin
      .from("ai_batch_jobs")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (row.callback_url) {
      void fireCallback(row.callback_url, {
        id: row.id,
        status: "failed",
        error: message,
      });
    }
    return "failed";
  }
}

async function fireCallback(url: string, payload: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // Don't let the callback hang the cron tick.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ai-batch] callback failed:",
      e instanceof Error ? e.message : String(e)
    );
  }
}
