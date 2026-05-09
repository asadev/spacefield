"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type {
  ModerationAction,
  ModerationApplyTo,
  ModerationQueueRow,
  ModerationRuleRow,
} from "../_types";

/**
 * Server actions for `/admin/moderation` (rules) and
 * `/admin/moderation/queue` (queue review). Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * Constants and pure types live in `_helpers.ts` because `"use server"`
 * modules can only export async functions.
 */

const VALID_RULE_KINDS: ModerationRuleRow["rule_kind"][] = [
  "banned_word",
  "regex",
  "threshold",
  "length",
];

const VALID_ACTIONS: ModerationAction[] = ["block", "flag", "review"];

const VALID_APPLIES_TO: ModerationApplyTo[] = [
  "any",
  "chat",
  "crm",
  "social",
  "toshare",
];

function parseRuleKind(raw: unknown): ModerationRuleRow["rule_kind"] {
  const s = String(raw ?? "").trim();
  return (VALID_RULE_KINDS as string[]).includes(s)
    ? (s as ModerationRuleRow["rule_kind"])
    : "banned_word";
}

function parseAction(raw: unknown): ModerationAction {
  const s = String(raw ?? "").trim();
  return (VALID_ACTIONS as string[]).includes(s)
    ? (s as ModerationAction)
    : "flag";
}

function parseAppliesTo(raw: unknown): ModerationApplyTo {
  const s = String(raw ?? "").trim();
  return (VALID_APPLIES_TO as string[]).includes(s)
    ? (s as ModerationApplyTo)
    : "any";
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ───────────────────── createRule ───────────────────── */

export async function createRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const rule_kind = parseRuleKind(formData.get("rule_kind"));
  const pattern = String(formData.get("pattern") ?? "").trim();
  if (!pattern) throw new Error("pattern required");

  const action = parseAction(formData.get("action"));
  const applies_to = parseAppliesTo(formData.get("applies_to"));
  const severity = clampInt(formData.get("severity"), 1, 5, 3);
  const enabled = formData.get("enabled") === "on";

  // Light validation per rule_kind. Don't be too strict — we want to
  // let admins paste in anything they need; the runtime moderator is
  // tolerant.
  if (rule_kind === "regex") {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error("regex pattern is not valid");
    }
  } else if (rule_kind === "length") {
    const n = Number(pattern);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("length pattern must be a positive integer");
    }
  }

  const insertRow = {
    rule_kind,
    pattern,
    action,
    applies_to,
    severity,
    enabled,
    metadata: { created_by: auth.userId },
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("moderation_rules")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");

  await recordAdminAction({
    action: "moderation_rule.create",
    targetType: "moderation_rule",
    targetId: (data as { id: string }).id,
    after: { id: (data as { id: string }).id, ...insertRow },
  });

  revalidatePath("/admin/moderation");
  redirect(`/admin/moderation/${(data as { id: string }).id}`);
}

/* ───────────────────── updateRule ───────────────────── */

export async function updateRule(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const rule_kind = parseRuleKind(formData.get("rule_kind"));
  const pattern = String(formData.get("pattern") ?? "").trim();
  if (!pattern) throw new Error("pattern required");

  const action = parseAction(formData.get("action"));
  const applies_to = parseAppliesTo(formData.get("applies_to"));
  const severity = clampInt(formData.get("severity"), 1, 5, 3);
  const enabled = formData.get("enabled") === "on";

  if (rule_kind === "regex") {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error("regex pattern is not valid");
    }
  } else if (rule_kind === "length") {
    const n = Number(pattern);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("length pattern must be a positive integer");
    }
  }

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("moderation_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle<ModerationRuleRow>();

  const update = {
    rule_kind,
    pattern,
    action,
    applies_to,
    severity,
    enabled,
    metadata: { ...(before?.metadata ?? {}), last_edited_by: auth.userId },
  };

  const { error } = await admin
    .from("moderation_rules")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "moderation_rule.update",
    targetType: "moderation_rule",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/moderation");
  revalidatePath(`/admin/moderation/${id}`);
}

/* ───────────────────── toggleRule ───────────────────── */

export async function toggleRule(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const next = String(formData.get("enabled") ?? "false") === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("moderation_rules")
    .select("id, pattern, enabled, rule_kind")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("moderation_rules")
    .update({ enabled: next })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "moderation_rule.toggle",
    targetType: "moderation_rule",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/moderation");
  revalidatePath(`/admin/moderation/${id}`);
}

/* ───────────────────── deleteRule ───────────────────── */

export async function deleteRule(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("moderation_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle<ModerationRuleRow>();

  const { error } = await admin.from("moderation_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "moderation_rule.delete",
    targetType: "moderation_rule",
    targetId: id,
    before,
  });

  revalidatePath("/admin/moderation");
  redirect("/admin/moderation");
}

/* ─────────────── moderation queue actions ─────────────── */

async function setQueueItemStatus(
  formData: FormData,
  next: ModerationQueueRow["status"],
  verb: "approve" | "reject" | "escalate"
): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("moderation_queue")
    .select("*")
    .eq("id", id)
    .maybeSingle<ModerationQueueRow>();

  const update = {
    status: next,
    reviewed_by: auth.userId,
    reviewed_at: new Date().toISOString(),
    notes,
  };

  const { error } = await admin
    .from("moderation_queue")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: `moderation_queue.${verb}`,
    targetType: "moderation_queue",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/moderation/queue");
}

export async function approveItem(formData: FormData): Promise<void> {
  await setQueueItemStatus(formData, "approved", "approve");
}

export async function rejectItem(formData: FormData): Promise<void> {
  await setQueueItemStatus(formData, "rejected", "reject");
}

export async function escalateItem(formData: FormData): Promise<void> {
  await setQueueItemStatus(formData, "escalated", "escalate");
}
