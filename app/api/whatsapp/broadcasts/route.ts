import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSegmentRecipients, type SegmentQuery } from "@/lib/whatsapp/segments";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Recipient pre-count for a segment can touch many rows; allow headroom.
export const maxDuration = 60;

/**
 * WhatsApp broadcasts (EPIC-08). A broadcast is a whatsapp_send_jobs row of
 * kind='broadcast' targeting a saved segment (dynamic) OR a list (frozen),
 * with optional {{var}} personalization, re-hosted media, send-later
 * (scheduled_for), and simple recurrence. The proven runner + throttle drain
 * it; opt-out suppression is applied at send time.
 *
 * GET  /api/whatsapp/broadcasts?workspace_id=&status=&limit=&cursor=  → { items, next_cursor }
 * POST /api/whatsapp/broadcasts
 *   { workspace_id, title?, segment_id?|list_id?, message|personalization_template,
 *     template_variants?[], media_storage_path?, media_mime?, scheduled_for?, recurrence? }
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface BroadcastBody {
  workspace_id?: string;
  title?: string;
  segment_id?: string | null;
  list_id?: string | null;
  message?: string;
  personalization_template?: string;
  template_variants?: string[];
  media_storage_path?: string | null;
  media_mime?: string | null;
  scheduled_for?: string | null;
  recurrence?: Record<string, unknown> | null;
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const status = sp.get("status");
  const limit = Math.min(
    Number(sp.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = sp.get("cursor");

  const admin = createAdminClient();
  let q = admin
    .from("whatsapp_send_jobs")
    .select(
      "id, title, kind, status, segment_id, list_id, target_type, message_template, personalization_template, media_storage_path, scheduled_for, recurrence, total_contacts, sent_count, failed_count, started_at, completed_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("kind", "broadcast")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) return jsonError(error.message, 500);

  // Resolve segment names for display (best-effort, single batched query).
  const segIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r as { segment_id: string | null }).segment_id)
        .filter((x): x is string => !!x),
    ),
  );
  const segName = new Map<string, string>();
  if (segIds.length > 0) {
    const { data: segs } = await admin
      .from("whatsapp_segments")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .in("id", segIds);
    for (const s of segs ?? [])
      segName.set((s as { id: string }).id, (s as { name: string }).name);
  }

  const rows = (data ?? []) as Array<Record<string, unknown> & {
    segment_id: string | null;
    created_at: string;
  }>;
  const items = rows.map((row) => ({
    ...row,
    segment_name: row.segment_id ? segName.get(row.segment_id) ?? null : null,
  }));

  const lastCreatedAt =
    rows.length === limit ? rows[rows.length - 1].created_at : null;
  return NextResponse.json({
    items,
    next_cursor: lastCreatedAt,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<BroadcastBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.segment_id && !b.list_id) {
    return jsonError("segment_id or list_id required", 400);
  }
  const bodyTemplate = (b.personalization_template ?? b.message ?? "").trim();
  if (!bodyTemplate && !b.media_storage_path) {
    return jsonError("message or media required", 400);
  }

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const admin = createAdminClient();

  // Need a connected instance to attribute the job to.
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", b.workspace_id)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow) return jsonError("no_connected_instance", 409);
  const inst = instRow as WhatsAppInstanceRow;

  // Verify ownership of the segment/list and compute a recipient estimate.
  let totalContacts = 0;
  if (b.segment_id) {
    const { data: seg } = await admin
      .from("whatsapp_segments")
      .select("query")
      .eq("workspace_id", b.workspace_id)
      .eq("id", b.segment_id)
      .maybeSingle();
    if (!seg) return jsonError("segment_not_found", 404);
    const recipients = await resolveSegmentRecipients(
      admin,
      b.workspace_id,
      ((seg as { query?: SegmentQuery }).query ?? {}) as SegmentQuery,
    );
    totalContacts = recipients.length;
  } else if (b.list_id) {
    const { data: list } = await admin
      .from("whatsapp_lists")
      .select("contact_ids")
      .eq("workspace_id", b.workspace_id)
      .eq("id", b.list_id)
      .maybeSingle();
    if (!list) return jsonError("list_not_found", 404);
    totalContacts = Array.isArray(
      (list as { contact_ids?: string[] }).contact_ids,
    )
      ? (list as { contact_ids: string[] }).contact_ids.length
      : 0;
  }

  // Validate scheduled_for (must be a parseable future-ish timestamp if set).
  let scheduledFor: string | null = null;
  if (b.scheduled_for) {
    const t = new Date(b.scheduled_for);
    if (Number.isNaN(t.getTime())) return jsonError("invalid scheduled_for", 400);
    scheduledFor = t.toISOString();
  }

  const { data: job, error } = await admin
    .from("whatsapp_send_jobs")
    .insert({
      workspace_id: b.workspace_id,
      instance_id: inst.id,
      kind: "broadcast",
      title: b.title?.trim() || null,
      // target_type is NOT NULL on the legacy table; use 'list' as a benign
      // discriminator (the runner branches on segment_id/list_id first).
      target_type: "list",
      target_id: b.segment_id ?? b.list_id ?? "",
      segment_id: b.segment_id ?? null,
      list_id: b.list_id ?? null,
      message_template: bodyTemplate || "(media)",
      personalization_template: b.personalization_template?.trim() || null,
      template_variants: Array.isArray(b.template_variants)
        ? b.template_variants.filter((v) => typeof v === "string" && v.trim())
        : [],
      media: {},
      media_storage_path: b.media_storage_path ?? null,
      media_mime: b.media_mime ?? null,
      scheduled_for: scheduledFor,
      recurrence: b.recurrence ?? null,
      status: "queued",
      total_contacts: totalContacts,
      created_by: auth.user.id,
    })
    .select("id, status, total_contacts, scheduled_for")
    .single();
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({
    item: job,
    enqueued: true,
    total_contacts: totalContacts,
  });
}
