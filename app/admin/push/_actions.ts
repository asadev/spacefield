"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { PushAudience, PushCampaignRow } from "../_types";

/**
 * Server actions for /admin/push.
 *
 *   createCampaign  → insert row
 *   updateCampaign  → patch row
 *   sendCampaign    → flip status to 'sending'/'sent', enumerate
 *                     push_subscriptions matching audience, populate
 *                     total_targets. Actual web-push transport is
 *                     environmental — recorded as a placeholder in
 *                     metadata.
 *   deleteCampaign  → remove row
 *
 * All call assertAdmin() AND recordAdminAction(...).
 * Audit verbs: push.create, push.update, push.send, push.delete.
 */

const AUDIENCES: ReadonlyArray<PushAudience> = [
  "all",
  "tier",
  "allowlist",
  "workspace",
];

function pickAudience(value: unknown): PushAudience {
  const s = String(value ?? "").trim();
  return (AUDIENCES as ReadonlyArray<string>).includes(s)
    ? (s as PushAudience)
    : "all";
}

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTimestamp(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchCampaign(id: string): Promise<PushCampaignRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as PushCampaignRow | null) ?? null;
}

function patchFromForm(formData: FormData): {
  title: string;
  body: string;
  url: string | null;
  audience: PushAudience;
  audience_tiers: string[];
  audience_user_ids: string[];
  audience_workspace_ids: string[];
  scheduled_at: string | null;
} {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing title");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("missing body");
  const urlRaw = String(formData.get("url") ?? "").trim();
  const audience = pickAudience(formData.get("audience"));
  const audience_tiers = formData
    .getAll("audience_tier")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const audience_user_ids = parseLines(formData.get("audience_user_ids"));
  const audience_workspace_ids = parseLines(
    formData.get("audience_workspace_ids")
  );
  const scheduled_at = parseTimestamp(formData.get("scheduled_at"));
  return {
    title,
    body,
    url: urlRaw.length ? urlRaw : null,
    audience,
    audience_tiers,
    audience_user_ids,
    audience_workspace_ids,
    scheduled_at,
  };
}

/* ─────────────────────── create ─────────────────────── */

export async function createCampaign(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const patch = patchFromForm(formData);

  const status = patch.scheduled_at ? "scheduled" : "draft";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("push_campaigns")
    .insert({ ...patch, status, updated_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "push.create",
    targetType: "push_campaigns",
    targetId: (data as { id: string }).id,
    after: { ...patch, status },
  });

  revalidatePath("/admin/push");
}

/* ─────────────────────── update ─────────────────────── */

export async function updateCampaign(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchCampaign(id);
  if (!before) throw new Error("campaign not found");
  if (before.status === "sending" || before.status === "sent") {
    throw new Error("cannot edit a campaign that has been sent");
  }

  const patch = patchFromForm(formData);
  // Refresh status if user added/removed schedule.
  const status = patch.scheduled_at ? "scheduled" : "draft";

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_campaigns")
    .update({ ...patch, status, updated_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "push.update",
    targetType: "push_campaigns",
    targetId: id,
    before: {
      title: before.title,
      body: before.body,
      url: before.url,
      audience: before.audience,
      audience_tiers: before.audience_tiers,
      audience_user_ids: before.audience_user_ids,
      audience_workspace_ids: before.audience_workspace_ids,
      scheduled_at: before.scheduled_at,
      status: before.status,
    },
    after: { ...patch, status },
  });

  revalidatePath("/admin/push");
  revalidatePath(`/admin/push/${id}`);
}

/* ─────────────────────── send now ─────────────────────── */

/**
 * Flip a campaign to 'sending' and enumerate matching push_subscriptions
 * to populate total_targets. The real web-push transport is an
 * environmental follow-up — we record the campaign metadata here so the
 * dispatch worker has the full target set.
 */
export async function sendCampaign(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchCampaign(id);
  if (!before) throw new Error("campaign not found");
  if (before.status === "sending" || before.status === "sent") {
    throw new Error("campaign already sent");
  }

  const admin = createAdminClient();

  // Enumerate push_subscriptions matching the campaign audience.
  // We only need the count for total_targets; the per-row transport
  // happens in a follow-up worker. We keep this single round-trip.
  let q = admin
    .from("push_subscriptions")
    .select("id, user_id", { count: "exact" })
    .eq("enabled", true);

  if (before.audience === "allowlist" && before.audience_user_ids.length > 0) {
    q = q.in("user_id", before.audience_user_ids);
  }
  // tier and workspace audiences require a join with subscriptions /
  // workspace_members which the migration has data for, but for the
  // admin "send now" we record the intent and let the worker resolve
  // the join. So total_targets for tier/workspace is filled in by the
  // worker — we set 0 here.
  if (before.audience !== "all" && before.audience !== "allowlist") {
    q = q.in("user_id", []); // 0 rows — worker will recompute.
  }

  const subsRes = await q;
  const total_targets =
    before.audience === "all" || before.audience === "allowlist"
      ? subsRes.count ?? 0
      : 0;

  const sentAt = new Date().toISOString();
  // We mark 'sending' (not 'sent') — the worker is responsible for
  // flipping to 'sent' once all transports complete.
  const { error } = await admin
    .from("push_campaigns")
    .update({
      status: "sending",
      sent_at: sentAt,
      total_targets,
      updated_by: userId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "push.send",
    targetType: "push_campaigns",
    targetId: id,
    before: { status: before.status, total_targets: before.total_targets },
    after: { status: "sending", sent_at: sentAt, total_targets },
    metadata: {
      audience: before.audience,
      audience_tiers: before.audience_tiers,
      audience_user_ids_count: before.audience_user_ids.length,
      audience_workspace_ids_count: before.audience_workspace_ids.length,
      transport_note:
        "marked 'sending' — worker resolves transport + flips to 'sent'",
    },
  });

  revalidatePath("/admin/push");
  revalidatePath(`/admin/push/${id}`);
}

/* ─────────────────────── delete ─────────────────────── */

export async function deleteCampaign(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchCampaign(id);

  const admin = createAdminClient();
  const { error } = await admin.from("push_campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "push.delete",
    targetType: "push_campaigns",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/push");
}
