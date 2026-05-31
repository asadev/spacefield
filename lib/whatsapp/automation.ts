import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { executeActions, type WhatsAppAction, type ActionContext } from "./actions";
import { detectConsentKeyword } from "./consent";
import type { PersonalizeContact } from "./personalize";
import type { WhatsAppInstanceRow } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * App-side automation engine (EPIC-09): keyword auto-reply, welcome, away /
 * out-of-office, business-hours gating and a numbered-menu router. Evaluated
 * on the inbound MESSAGES_UPSERT webhook AFTER the message is persisted.
 *
 * Pipeline per inbound INDIVIDUAL text message:
 *   0. Skip if STOP/START keyword (consent handled separately, never auto-reply).
 *   1. Load active rules (priority asc) + business hours once.
 *   2. For each rule whose event + conditions match, run its actions via the
 *      shared executor; if it sent something and stop_on_match, stop.
 *   3. If NO rule fired AND it's the conversation's first inbound message,
 *      fall back to the welcome / away message (so no first-timer is left on
 *      read). away wins when outside business hours.
 *
 * All outbound goes through the throttle + opt-out via the action executor.
 * Groups are excluded (automation is a 1:1 customer concept). NO native
 * buttons — numbered text menus only.
 */

interface BusinessHours {
  timezone: string;
  weekly: Record<string, Array<{ open: string; close: string }>>;
  holidays: string[];
  away_message: string | null;
  welcome_message: string | null;
}

interface AutomationRule {
  id: string;
  name: string;
  event_name: "conversation_created" | "message_created";
  conditions: {
    keywords?: string[];
    match?: "contains" | "starts_with" | "equals" | "any";
    business_hours?: "inside" | "outside";
    first_message_only?: boolean;
  };
  actions: WhatsAppAction[];
  active: boolean;
  priority: number;
  stop_on_match: boolean;
}

/**
 * Resolve "now" into the workspace timezone and decide if it's inside
 * business hours. Uses Intl with the stored IANA tz (no extra deps). If no
 * hours are configured (empty weekly), business is considered ALWAYS OPEN
 * (so away/welcome don't misfire before the operator sets hours).
 */
export function isInsideBusinessHours(hours: BusinessHours | null): boolean {
  if (!hours) return true;
  const weekly = hours.weekly ?? {};
  if (Object.keys(weekly).length === 0) return true;

  const tz = hours.timezone || "Asia/Karachi";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
  } catch {
    return true; // bad tz → don't gate
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdName = get("weekday"); // e.g. "Mon"
  const hh = get("hour");
  const mm = get("minute");
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;

  if ((hours.holidays ?? []).includes(isoDate)) return false;

  const WD: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = WD[wdName];
  if (dow === undefined) return true;

  const ranges = weekly[String(dow)] ?? [];
  if (ranges.length === 0) return false; // configured closed day

  const cur = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  for (const r of ranges) {
    const [oh, om] = (r.open || "00:00").split(":").map((n) => parseInt(n, 10));
    const [ch, cm] = (r.close || "23:59").split(":").map((n) => parseInt(n, 10));
    const start = oh * 60 + om;
    const end = ch * 60 + cm;
    if (cur >= start && cur <= end) return true;
  }
  return false;
}

/** Does an inbound body match a keyword rule's condition? */
function keywordMatches(
  body: string,
  keywords: string[] | undefined,
  match: AutomationRule["conditions"]["match"],
): boolean {
  if (match === "any" || !keywords || keywords.length === 0) {
    return match === "any"; // "any" = match every message; no keywords = no match
  }
  const norm = body.toLowerCase().trim();
  return keywords.some((kw) => {
    const k = kw.toLowerCase().trim();
    if (!k) return false;
    switch (match) {
      case "equals":
        return norm === k;
      case "starts_with":
        return norm.startsWith(k);
      case "contains":
      default:
        return norm.includes(k);
    }
  });
}

export interface AutomationInput {
  admin: Admin;
  instance: WhatsAppInstanceRow;
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  contact: PersonalizeContact | null;
  /** Remote phone digits (individual). */
  toNumber: string;
  body: string;
  isFirstInbound: boolean; // conversation had no prior inbound before this one
}

/**
 * Evaluate + run automation for one inbound message. Best-effort: never
 * throws (caller is the webhook, which must always ack 200). Returns a short
 * trace for logging.
 */
export async function runInboundAutomation(
  input: AutomationInput,
): Promise<{ fired: string[]; sent: boolean }> {
  const {
    admin, instance, workspaceId, conversationId, contactId, contact, toNumber, body, isFirstInbound,
  } = input;
  const fired: string[] = [];
  let sentAnything = false;

  try {
    // 0. Consent keywords are handled by the webhook's STOP path; never
    //    auto-reply to a STOP/START message.
    if (detectConsentKeyword(body).signal !== null) {
      return { fired, sent: false };
    }

    // 1. Load rules + business hours (one round trip each).
    const [{ data: ruleRows }, { data: bhRow }] = await Promise.all([
      admin
        .from("whatsapp_automation_rules")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .order("priority", { ascending: true }),
      admin
        .from("whatsapp_business_hours")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    const hours = (bhRow as BusinessHours | null) ?? null;
    const inside = isInsideBusinessHours(hours);
    const rules = (ruleRows ?? []) as AutomationRule[];

    const ctx: ActionContext = {
      workspaceId,
      instance,
      conversationId,
      toNumber,
      contactId,
      contact,
      actorUserId: null,
    };

    // 2. Evaluate rules in priority order.
    for (const rule of rules) {
      // event gate
      if (rule.event_name === "conversation_created" && !isFirstInbound) continue;
      const c = rule.conditions ?? {};
      if (c.first_message_only && !isFirstInbound) continue;
      if (c.business_hours === "inside" && !inside) continue;
      if (c.business_hours === "outside" && inside) continue;
      // keyword gate (only when keywords/match are present; otherwise the rule
      // is event/time-gated and matches any message satisfying the above)
      const hasKeywordCond =
        (c.keywords && c.keywords.length > 0) || c.match === "any";
      if (hasKeywordCond && !keywordMatches(body, c.keywords, c.match)) continue;

      const results = await executeActions(admin, ctx, rule.actions ?? []);
      const didSend = results.some(
        (r) => r.ok && ["send_text", "send_canned", "send_media", "send_menu"].includes(r.type),
      );
      fired.push(rule.name);
      if (didSend) sentAnything = true;
      if (rule.stop_on_match && (didSend || results.some((r) => r.ok))) break;
    }

    // 3. Default fallback: no rule replied AND first inbound → welcome/away so
    //    a first-timer is never left on read.
    if (!sentAnything && isFirstInbound) {
      const fallbackMsg = !inside && hours?.away_message
        ? hours.away_message
        : hours?.welcome_message ?? null;
      if (fallbackMsg && fallbackMsg.trim()) {
        const results = await executeActions(admin, ctx, [
          { type: "send_text", params: { text: fallbackMsg } },
        ]);
        if (results.some((r) => r.ok)) {
          sentAnything = true;
          fired.push(!inside && hours?.away_message ? "_away_fallback" : "_welcome_fallback");
        }
      }
    } else if (!sentAnything && !inside && hours?.away_message?.trim()) {
      // Repeat-customer messaging outside hours still gets the away notice
      // (once per inbound is acceptable; throttle/cooldown bounds spam).
      const results = await executeActions(admin, ctx, [
        { type: "send_text", params: { text: hours.away_message } },
      ]);
      if (results.some((r) => r.ok)) {
        sentAnything = true;
        fired.push("_away_fallback");
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[whatsapp.automation] error:",
      e instanceof Error ? e.message : String(e),
    );
  }

  return { fired, sent: sentAnything };
}
