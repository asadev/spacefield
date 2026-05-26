import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "./client";
import {
  canSendToContact,
  nextSendDelayMs,
  variateTemplate,
} from "./throttle";
import type {
  ThrottleConfig,
  WhatsAppInstanceRow,
} from "./types";

/**
 * Background runner for queued whatsapp_send_jobs. Picks up to N
 * `queued` jobs, flips them to `running`, drains their target list
 * under throttle, and finalises status when done.
 *
 * Strictly capped:
 *   - One job per runner tick (concurrency lives in the cron schedule,
 *     not inside a single invocation).
 *   - Up to MAX_PER_TICK contacts inside that one job before yielding,
 *     so we always fit inside Vercel's 300s ceiling.
 *
 * The runner is idempotent: a job can be picked up again after a
 * restart and will skip contacts that already have a whatsapp_send_log
 * row for the current job. That trades a small amount of work for
 * crash-safety, which matters with a 5min serverless ceiling.
 */

const MAX_PER_TICK = 25; // contacts per cron invocation per job
const TICK_TIMEOUT_MS = 250_000; // wall-clock cap inside the runner

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalisePhone(p: string | null | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

interface JobRow {
  id: string;
  workspace_id: string;
  instance_id: string;
  target_type: "contact" | "group" | "list";
  target_id: string;
  message_template: string;
  template_variants: string[];
  media: Record<string, unknown> | null;
  status: string;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  throttle_config: ThrottleConfig | null;
}

/** Run a single tick — returns counts per job processed. */
export async function runQueuedWhatsAppJobs(limit: number): Promise<{
  processed_jobs: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const admin = createAdminClient();
  const startTs = Date.now();

  let processed = 0;
  let sentTotal = 0;
  let failedTotal = 0;
  let skippedTotal = 0;

  // Greedy: claim one job per iteration up to `limit`. Each job is
  // capped at MAX_PER_TICK contacts; we re-pick it next tick if there
  // are more to process.
  for (let i = 0; i < limit; i++) {
    if (Date.now() - startTs > TICK_TIMEOUT_MS) break;

    // Atomic claim — flip the oldest queued row to running.
    const { data: claimed } = await admin
      .from("whatsapp_send_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .select("*");

    const job = (claimed && claimed[0]) as JobRow | undefined;
    if (!job) break;

    processed++;

    const counts = await processJob(job);
    sentTotal += counts.sent;
    failedTotal += counts.failed;
    skippedTotal += counts.skipped;
  }

  return {
    processed_jobs: processed,
    sent: sentTotal,
    failed: failedTotal,
    skipped: skippedTotal,
  };
}

/** Drain a single job up to MAX_PER_TICK contacts. */
async function processJob(
  job: JobRow,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const client = getEvolutionClient();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Fetch instance (must still be connected).
    const { data: instRow } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("id", job.instance_id)
      .maybeSingle();
    if (!instRow || (instRow as WhatsAppInstanceRow).status !== "connected") {
      await admin
        .from("whatsapp_send_jobs")
        .update({
          status: "failed",
          error_message: "instance_not_connected",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { sent, failed, skipped };
    }
    const inst = instRow as WhatsAppInstanceRow;

    // Resolve targets.
    const targets = await resolveTargets(job);
    if (targets.length === 0) {
      await admin
        .from("whatsapp_send_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return { sent, failed, skipped };
    }

    // Already-sent set (idempotency).
    const { data: existingLogs } = await admin
      .from("whatsapp_send_log")
      .select("to_number")
      .eq("job_id", job.id);
    const alreadySent = new Set<string>(
      (existingLogs ?? []).map(
        (r) => (r as { to_number: string | null }).to_number ?? "",
      ),
    );

    const mediaUrl =
      job.media && typeof job.media === "object" && "url" in job.media
        ? String((job.media as Record<string, unknown>).url ?? "")
        : "";

    const variants =
      Array.isArray(job.template_variants) && job.template_variants.length > 0
        ? job.template_variants
        : [job.message_template];

    let tickCount = 0;
    for (const target of targets) {
      if (tickCount >= MAX_PER_TICK) break;
      if (alreadySent.has(target.phone)) {
        skipped++;
        continue;
      }

      const guard = await canSendToContact(inst.id, target.phone);
      if (!guard.ok) {
        // Cooldown / cap — log + skip but don't fail the job.
        skipped++;
        continue;
      }

      const body = variateTemplate(variants, `job:${job.id}:${target.phone}`);
      try {
        const sentRes = mediaUrl
          ? await client.sendMedia(
              inst.evolution_instance_name,
              target.phone,
              mediaUrl,
              body,
            )
          : await client.sendText(
              inst.evolution_instance_name,
              target.phone,
              body,
            );

        await admin.from("whatsapp_send_log").insert({
          workspace_id: job.workspace_id,
          job_id: job.id,
          instance_id: inst.id,
          contact_id: target.contactId,
          to_number: target.phone,
          body,
          status: "sent",
          evolution_message_id: sentRes.messageId || null,
        });
        await admin.from("whatsapp_messages").insert({
          workspace_id: job.workspace_id,
          instance_id: inst.id,
          contact_id: target.contactId,
          direction: "outbound",
          to_number: target.phone,
          body,
          media_url: mediaUrl || null,
          status: "sent",
          evolution_message_id: sentRes.messageId || null,
          sent_at: new Date().toISOString(),
        });

        sent++;
        await admin
          .from("whatsapp_send_jobs")
          .update({ sent_count: job.sent_count + sent })
          .eq("id", job.id);
      } catch (e) {
        failed++;
        const errMsg = e instanceof Error ? e.message : "send_failed";
        await admin.from("whatsapp_send_log").insert({
          workspace_id: job.workspace_id,
          job_id: job.id,
          instance_id: inst.id,
          contact_id: target.contactId,
          to_number: target.phone,
          body,
          status: "failed",
        });
        await admin
          .from("whatsapp_send_jobs")
          .update({ failed_count: job.failed_count + failed })
          .eq("id", job.id);
        // eslint-disable-next-line no-console
        console.error(
          `[whatsapp.runner] send failed job=${job.id} to=${target.phone}:`,
          errMsg,
        );
      }

      tickCount++;
      // Random delay between messages.
      const delay = await nextSendDelayMs(inst.id);
      await sleep(delay);
    }

    // Decide next state.
    const stillRemaining =
      targets.length - sent - failed - skipped - alreadySent.size;

    if (stillRemaining <= 0) {
      await admin
        .from("whatsapp_send_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          sent_count: job.sent_count + sent,
          failed_count: job.failed_count + failed,
        })
        .eq("id", job.id);
    } else {
      // Yield: requeue this job so the next tick picks it back up.
      await admin
        .from("whatsapp_send_jobs")
        .update({
          status: "queued",
          sent_count: job.sent_count + sent,
          failed_count: job.failed_count + failed,
        })
        .eq("id", job.id);
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "runner_error";
    await admin
      .from("whatsapp_send_jobs")
      .update({
        status: "failed",
        error_message: errMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    // eslint-disable-next-line no-console
    console.error("[whatsapp.runner] job crashed", job.id, errMsg);
  }

  return { sent, failed, skipped };
}

/**
 * Expand the job's target into a list of (phone, contactId) tuples.
 * Returns deduplicated phones.
 */
async function resolveTargets(job: JobRow): Promise<
  Array<{ phone: string; contactId: string | null }>
> {
  const admin = createAdminClient();

  if (job.target_type === "contact") {
    if (/^\+?[0-9\s\-()]+$/.test(job.target_id)) {
      return [{ phone: normalisePhone(job.target_id), contactId: null }];
    }
    const { data } = await admin
      .from("crm_contacts")
      .select("id, phone")
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.target_id)
      .maybeSingle();
    if (!data) return [];
    const row = data as { id: string; phone: string | null };
    const phone = normalisePhone(row.phone);
    if (!phone) return [];
    return [{ phone, contactId: row.id }];
  }

  if (job.target_type === "list") {
    const { data: list } = await admin
      .from("whatsapp_lists")
      .select("contact_ids")
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.target_id)
      .maybeSingle();
    const ids = Array.isArray((list as { contact_ids?: string[] } | null)?.contact_ids)
      ? ((list as { contact_ids: string[] }).contact_ids)
      : [];
    if (ids.length === 0) return [];
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select("id, phone")
      .eq("workspace_id", job.workspace_id)
      .in("id", ids);
    const seen = new Set<string>();
    const out: Array<{ phone: string; contactId: string | null }> = [];
    for (const c of contacts ?? []) {
      const row = c as { id: string; phone: string | null };
      const phone = normalisePhone(row.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push({ phone, contactId: row.id });
    }
    return out;
  }

  // target_type === 'group' — single JID target.
  let jid = job.target_id;
  if (!jid.includes("@")) {
    const { data: grpRow } = await admin
      .from("whatsapp_groups")
      .select("evolution_group_id")
      .eq("id", jid)
      .eq("workspace_id", job.workspace_id)
      .maybeSingle();
    if (!grpRow) return [];
    jid = (grpRow as { evolution_group_id: string }).evolution_group_id;
  }
  return [{ phone: jid, contactId: null }];
}
