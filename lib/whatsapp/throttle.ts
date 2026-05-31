import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Send-throttling helpers.
 *
 * Two layers of throttle prevent WhatsApp bans:
 *   1. Per-instance limits (per hour + per day).
 *   2. Per-contact cooldown (don't reach the same number twice
 *      inside COOLDOWN_HOURS).
 *
 * Warm-up reduces the cap for the first WARMUP_DAYS days after the
 * instance pairs, when the number is youngest and most-likely to be
 * flagged.
 *
 * The send-runner reads `nextSendDelayMs()` between every message to
 * keep gaps inside the human-typing band.
 */

export const MAX_PER_HOUR = 50;
export const MAX_PER_DAY = 200;
export const MIN_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 30_000;
export const WARMUP_DAYS = 14;
export const WARMUP_DAILY_CAP = 30;
export const COOLDOWN_HOURS = 24;

/**
 * Soft-ban cooldown (EPIC-12). When a real Baileys block signal is observed
 * (a send rejected with a connection/forbidden/rate signature), the runner
 * pauses ALL sends for this instance for SOFTBAN_COOLDOWN_MS by stamping
 * whatsapp_instances.soft_ban_until. The throttle was always the anti-ban
 * strength but couldn't react to an ACTUAL block until now — this closes
 * that gap so the queue self-protects instead of hammering a flagged number.
 */
export const SOFTBAN_COOLDOWN_MS = 6 * 60 * 60 * 1_000; // 6h pause on a block signal

/**
 * Error-message signatures that indicate WhatsApp/Baileys pushed back hard
 * enough that we should stop sending (vs a one-off per-message failure).
 * Matched case-insensitively against the thrown Evolution error text.
 */
const SOFTBAN_SIGNATURES = [
  "forbidden",
  "blocked",
  "ban",
  "rate limit",
  "rate-limit",
  "429",
  "too many",
  "connection closed",
  "not connected",
  "disconnected",
  "logged out",
  "401",
  "403",
];

/** Does this send-error text look like a soft-ban / block signal? */
export function looksLikeSoftBan(errMessage: string): boolean {
  const m = (errMessage || "").toLowerCase();
  return SOFTBAN_SIGNATURES.some((s) => m.includes(s));
}

function ms(hours: number): number {
  return hours * 60 * 60 * 1_000;
}

function deterministicHash(input: string): number {
  // Stable, non-crypto. Sufficient for variant rotation.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Compute the next inter-message delay for a given instance.
 *
 * Pulls the most-recent send from whatsapp_messages (outbound only),
 * and combines a baseline jitter inside [MIN_DELAY_MS, MAX_DELAY_MS]
 * with the warm-up cap if the instance is younger than WARMUP_DAYS.
 * During warm-up we widen the random band so the runner naturally
 * slows down even without exceeding the daily cap.
 */
export async function nextSendDelayMs(instanceId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("paired_at, created_at")
    .eq("id", instanceId)
    .maybeSingle();

  const refDate = inst?.paired_at ?? inst?.created_at ?? null;
  const ageDays = refDate
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(refDate).getTime()) / (24 * 60 * 60 * 1_000),
        ),
      )
    : 0;

  const inWarmup = ageDays < WARMUP_DAYS;
  const min = inWarmup ? Math.max(MIN_DELAY_MS, 10_000) : MIN_DELAY_MS;
  const max = inWarmup ? Math.max(MAX_DELAY_MS, 60_000) : MAX_DELAY_MS;

  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Decide whether we're allowed to send to this contact right now.
 *
 * Hard guards (returns false):
 *   - Contact was messaged inside COOLDOWN_HOURS (avoid harassment +
 *     stay below WhatsApp's anti-bulk thresholds).
 *   - Instance hit its hourly or daily cap.
 *
 * Soft guard: during warm-up the daily cap is WARMUP_DAILY_CAP, so
 * the second result still bites earlier.
 */
export async function canSendToContact(
  instanceId: string,
  contactPhone: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!contactPhone) return { ok: false, reason: "missing_phone" };
  const normalised = contactPhone.replace(/\D/g, "");
  if (!normalised) return { ok: false, reason: "invalid_phone" };

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - ms(COOLDOWN_HOURS)).toISOString();

  const { data: recent, error: recentErr } = await admin
    .from("whatsapp_send_log")
    .select("id, sent_at")
    .eq("instance_id", instanceId)
    .eq("to_number", normalised)
    .gte("sent_at", cutoff)
    .limit(1);
  if (recentErr) {
    return { ok: false, reason: `cooldown_check_failed:${recentErr.message}` };
  }
  if (recent && recent.length > 0) {
    return { ok: false, reason: "cooldown_active" };
  }

  const stats = await getInstanceSendStats(instanceId);
  if (stats.sent_last_hour >= MAX_PER_HOUR) {
    return { ok: false, reason: "hourly_cap_reached" };
  }
  if (stats.sent_last_day >= stats.daily_cap) {
    return { ok: false, reason: "daily_cap_reached" };
  }
  return { ok: true };
}

/**
 * Stable rotation across `templates` keyed off `seed` (typically the
 * contact phone or job id). Same seed always selects the same variant
 * so re-sends to the same contact don't flip wording mid-thread.
 */
export function variateTemplate(templates: string[], seed: string): string {
  if (templates.length === 0) return "";
  if (templates.length === 1) return templates[0];
  const idx = deterministicHash(seed) % templates.length;
  return templates[idx];
}

/** Aggregate send stats over the last hour + last day for an instance. */
export async function getInstanceSendStats(instanceId: string): Promise<{
  sent_last_hour: number;
  sent_last_day: number;
  warmup_age_days: number;
  daily_cap: number;
}> {
  const admin = createAdminClient();
  const oneHourAgo = new Date(Date.now() - ms(1)).toISOString();
  const oneDayAgo = new Date(Date.now() - ms(24)).toISOString();

  const [hourRes, dayRes, instRes] = await Promise.all([
    admin
      .from("whatsapp_send_log")
      .select("id", { count: "exact", head: true })
      .eq("instance_id", instanceId)
      .gte("sent_at", oneHourAgo),
    admin
      .from("whatsapp_send_log")
      .select("id", { count: "exact", head: true })
      .eq("instance_id", instanceId)
      .gte("sent_at", oneDayAgo),
    admin
      .from("whatsapp_instances")
      .select("paired_at, created_at")
      .eq("id", instanceId)
      .maybeSingle(),
  ]);

  const sent_last_hour = hourRes.count ?? 0;
  const sent_last_day = dayRes.count ?? 0;

  const refDate = instRes.data?.paired_at ?? instRes.data?.created_at ?? null;
  const warmup_age_days = refDate
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(refDate).getTime()) / (24 * 60 * 60 * 1_000),
        ),
      )
    : 0;

  const daily_cap =
    warmup_age_days < WARMUP_DAYS ? WARMUP_DAILY_CAP : MAX_PER_DAY;

  return { sent_last_hour, sent_last_day, warmup_age_days, daily_cap };
}

/**
 * Is this instance currently soft-ban paused? Reads
 * whatsapp_instances.soft_ban_until. The runner checks this before draining
 * (defence-in-depth on top of the schedule-aware claim RPC, which already
 * skips soft-banned instances).
 */
export async function isInstanceSoftBanned(
  instanceId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("soft_ban_until")
    .eq("id", instanceId)
    .maybeSingle();
  const until = (data as { soft_ban_until: string | null } | null)
    ?.soft_ban_until;
  return Boolean(until && new Date(until).getTime() > Date.now());
}

/**
 * Flag a soft-ban on an instance: pauses sends for SOFTBAN_COOLDOWN_MS via
 * the whatsapp_softban_pause RPC. Best-effort; logged on failure. Called by
 * the runner when a send fails with a soft-ban signature.
 */
export async function flagSoftBan(
  instanceId: string,
  reason: string,
): Promise<void> {
  const admin = createAdminClient();
  const until = new Date(Date.now() + SOFTBAN_COOLDOWN_MS).toISOString();
  const { error } = await admin.rpc("whatsapp_softban_pause", {
    p_instance_id: instanceId,
    p_reason: reason.slice(0, 300),
    p_until: until,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[whatsapp.throttle] flagSoftBan failed:", error.message);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[whatsapp.throttle] instance ${instanceId} soft-ban paused until ${until}: ${reason.slice(0, 120)}`,
    );
  }
}
