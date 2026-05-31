import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "./client";
import {
  canSendToContact,
  flagSoftBan,
  isInstanceSoftBanned,
  looksLikeSoftBan,
  nextSendDelayMs,
  variateTemplate,
} from "./throttle";
import { isSuppressed } from "./consent";
import { resolveSegmentRecipients, type SegmentQuery } from "./segments";
import { personalizeForContact, type PersonalizeContact } from "./personalize";
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
  // Wave-3 broadcast metadata (nullable — back-compat with old list jobs).
  segment_id: string | null;
  list_id: string | null;
  personalization_template: string | null;
  media_storage_path: string | null;
  media_mime: string | null;
  scheduled_for: string | null;
  recurrence: Record<string, unknown> | null;
  kind: string | null;
}

interface ResolvedTarget {
  phone: string;
  contactId: string | null;
  contact: PersonalizeContact | null;
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
  //
  // EPIC-08/17: claim via the schedule-aware RPC so a future-scheduled
  // blast is not picked early and soft-banned instances are skipped. Falls
  // back to the plain queued-claim if the RPC is missing (older DB).
  for (let i = 0; i < limit; i++) {
    if (Date.now() - startTs > TICK_TIMEOUT_MS) break;

    let job: JobRow | undefined;
    const rpc = await admin.rpc("whatsapp_claim_due_send_jobs", { p_limit: 1 });
    if (!rpc.error) {
      job = (Array.isArray(rpc.data) ? rpc.data[0] : undefined) as
        | JobRow
        | undefined;
    } else {
      // Fallback: plain claim (no schedule/soft-ban awareness).
      const { data: claimed } = await admin
        .from("whatsapp_send_jobs")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .select("*");
      job = (claimed && claimed[0]) as JobRow | undefined;
    }
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

    // EPIC-12: instance soft-banned mid-blast → re-queue and stop. The
    // schedule-aware claim already skips soft-banned instances, but a ban can
    // trip between claim and drain, so we re-check here (defence in depth).
    if (await isInstanceSoftBanned(inst.id)) {
      await admin
        .from("whatsapp_send_jobs")
        .update({ status: "queued" })
        .eq("id", job.id);
      return { sent, failed, skipped };
    }

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

    // Resolve the media source. EPIC-08: a broadcast can carry a re-hosted
    // Supabase Storage object (media_storage_path) — sign it to a public URL
    // Evolution can fetch. Falls back to the legacy media.url bag.
    let mediaUrl =
      job.media && typeof job.media === "object" && "url" in job.media
        ? String((job.media as Record<string, unknown>).url ?? "")
        : "";
    if (!mediaUrl && job.media_storage_path) {
      const { data: signed } = await admin.storage
        .from("whatsapp-media")
        .createSignedUrl(job.media_storage_path, 60 * 30);
      if (signed?.signedUrl) mediaUrl = signed.signedUrl;
    }

    const variants =
      Array.isArray(job.template_variants) && job.template_variants.length > 0
        ? job.template_variants
        : [job.message_template];

    // EPIC-08: per-recipient {{var}} personalization. The personalization
    // template (if set) is the source; else the variated message body.
    const personalize = (target: ResolvedTarget): string => {
      const base =
        job.personalization_template ??
        variateTemplate(variants, `job:${job.id}:${target.phone}`);
      return personalizeForContact(base, target.contact);
    };

    let tickCount = 0;
    for (const target of targets) {
      if (tickCount >= MAX_PER_TICK) break;
      if (alreadySent.has(target.phone)) {
        skipped++;
        continue;
      }

      // EPIC-12: suppress opted-out contacts BEFORE the throttle. A broadcast
      // must never reach a contact who texted STOP.
      if (
        target.contactId &&
        (await isSuppressed(admin, job.workspace_id, target.contactId))
      ) {
        skipped++;
        continue;
      }

      const guard = await canSendToContact(inst.id, target.phone);
      if (!guard.ok) {
        // Cooldown / cap — log + skip but don't fail the job.
        skipped++;
        continue;
      }

      const body = personalize(target);
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
        // EPIC-12: a block signature pauses the whole instance + re-queues
        // the job so the blast resumes after the cooldown instead of burning
        // the rest of the recipients into a deeper ban.
        if (looksLikeSoftBan(errMsg)) {
          await flagSoftBan(inst.id, `broadcast send: ${errMsg}`);
          await admin
            .from("whatsapp_send_jobs")
            .update({
              status: "queued",
              sent_count: job.sent_count + sent,
              failed_count: job.failed_count + failed,
            })
            .eq("id", job.id);
          return { sent, failed, skipped };
        }
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
      // EPIC-08: simple recurrence — when a recurring broadcast completes,
      // clone it as a fresh queued job scheduled for the next occurrence.
      await maybeScheduleRecurrence(admin, job);
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
 * EPIC-08 recurrence. recurrence jsonb = { freq: 'daily'|'weekly'|'monthly',
 * interval?: n } — compute the next run from now and clone the job (fresh
 * segment resolution happens at the next drain, so the audience stays
 * dynamic). No-op when recurrence is absent/invalid. Best-effort.
 */
async function maybeScheduleRecurrence(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
): Promise<void> {
  const rec = job.recurrence;
  if (!rec || typeof rec !== "object") return;
  const freq = typeof rec.freq === "string" ? rec.freq : "";
  if (!["daily", "weekly", "monthly"].includes(freq)) return;
  const interval =
    typeof rec.interval === "number" && rec.interval > 0 ? rec.interval : 1;

  const next = new Date();
  if (freq === "daily") next.setDate(next.getDate() + interval);
  else if (freq === "weekly") next.setDate(next.getDate() + 7 * interval);
  else next.setMonth(next.getMonth() + interval);

  try {
    await admin.from("whatsapp_send_jobs").insert({
      workspace_id: job.workspace_id,
      instance_id: job.instance_id,
      target_type: job.target_type,
      target_id: job.target_id,
      segment_id: job.segment_id,
      list_id: job.list_id,
      message_template: job.message_template,
      template_variants: job.template_variants ?? [],
      personalization_template: job.personalization_template,
      media: job.media ?? {},
      media_storage_path: job.media_storage_path,
      media_mime: job.media_mime,
      status: "queued",
      scheduled_for: next.toISOString(),
      recurrence: job.recurrence,
      kind: job.kind ?? "broadcast",
      total_contacts: job.total_contacts,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.runner] recurrence clone failed",
      job.id,
      e instanceof Error ? e.message : String(e),
    );
  }
}

const CONTACT_FIELDS = "id, phone, first_name, last_name, email, custom";

function toPersonalize(row: {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  custom: Record<string, unknown> | null;
}): PersonalizeContact {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    email: row.email,
    custom: row.custom,
  };
}

/**
 * Expand the job's target into a list of (phone, contactId, contact) tuples.
 * Returns deduplicated phones. EPIC-08 adds segment_id (dynamic, resolved at
 * send time) and list_id resolution alongside the legacy target_type path.
 * The `contact` carries personalization context for {{var}} interpolation.
 */
async function resolveTargets(job: JobRow): Promise<ResolvedTarget[]> {
  const admin = createAdminClient();

  // EPIC-08: a saved segment resolves dynamically (labels + custom + lifecycle
  // + last-contacted) AT SEND TIME, with opt-out suppression baked in.
  if (job.segment_id) {
    const { data: seg } = await admin
      .from("whatsapp_segments")
      .select("query")
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.segment_id)
      .maybeSingle();
    const query = ((seg as { query?: SegmentQuery } | null)?.query ??
      {}) as SegmentQuery;
    const recipients = await resolveSegmentRecipients(
      admin,
      job.workspace_id,
      query,
    );
    return recipients.map((r) => ({
      phone: r.phone,
      contactId: r.contactId,
      contact: r.contact,
    }));
  }

  // EPIC-08: explicit list_id column (alongside legacy target_type='list').
  const listId =
    job.list_id ?? (job.target_type === "list" ? job.target_id : null);
  if (listId) {
    const { data: list } = await admin
      .from("whatsapp_lists")
      .select("contact_ids")
      .eq("workspace_id", job.workspace_id)
      .eq("id", listId)
      .maybeSingle();
    const ids = Array.isArray(
      (list as { contact_ids?: string[] } | null)?.contact_ids,
    )
      ? (list as { contact_ids: string[] }).contact_ids
      : [];
    if (ids.length === 0) return [];
    const { data: contacts } = await admin
      .from("crm_contacts")
      .select(CONTACT_FIELDS)
      .eq("workspace_id", job.workspace_id)
      .in("id", ids);
    const seen = new Set<string>();
    const out: ResolvedTarget[] = [];
    for (const c of contacts ?? []) {
      const row = c as {
        id: string;
        phone: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        custom: Record<string, unknown> | null;
      };
      const phone = normalisePhone(row.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      out.push({ phone, contactId: row.id, contact: toPersonalize(row) });
    }
    return out;
  }

  if (job.target_type === "contact") {
    if (/^\+?[0-9\s\-()]+$/.test(job.target_id)) {
      return [
        { phone: normalisePhone(job.target_id), contactId: null, contact: null },
      ];
    }
    const { data } = await admin
      .from("crm_contacts")
      .select(CONTACT_FIELDS)
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.target_id)
      .maybeSingle();
    if (!data) return [];
    const row = data as {
      id: string;
      phone: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      custom: Record<string, unknown> | null;
    };
    const phone = normalisePhone(row.phone);
    if (!phone) return [];
    return [{ phone, contactId: row.id, contact: toPersonalize(row) }];
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
  return [{ phone: jid, contactId: null, contact: null }];
}
