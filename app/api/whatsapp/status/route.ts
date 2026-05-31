import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Status posts (EPIC-18). Schedule/post text/image/video Status via
 * Evolution sendStatus. Posting ALWAYS goes through the queue (status='scheduled')
 * so the send-runner cron drains it under the anti-ban throttle — we never post
 * synchronously. "Post now" simply sets scheduled_at=now.
 *
 * GET    /api/whatsapp/status?workspace_id=                  → { items }
 * POST   /api/whatsapp/status  { workspace_id, kind, text_content?|media_url?,
 *          caption?, background_color?, font?, scheduled_at? }
 * DELETE /api/whatsapp/status?workspace_id=&id=   (only draft/scheduled)
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

const COLS =
  "id, instance_id, kind, caption, text_content, media_url, background_color, font, status, scheduled_at, sent_at, last_error, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_status_posts")
    .select(COLS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

interface StatusBody {
  workspace_id?: string;
  instance_id?: string;
  kind?: "text" | "image" | "video";
  caption?: string | null;
  text_content?: string | null;
  media_url?: string | null;
  background_color?: string | null;
  font?: number | null;
  scheduled_at?: string | null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<StatusBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const kind = b.kind === "image" || b.kind === "video" ? b.kind : "text";
  if (kind === "text" && !b.text_content?.trim()) {
    return jsonError("text_content required for text status", 400);
  }
  if ((kind === "image" || kind === "video") && !b.media_url?.trim()) {
    return jsonError("media_url required for media status", 400);
  }

  const admin = createAdminClient();

  // Resolve target instance: explicit instance_id (validated) or the default
  // connected line. Multi-instance-safe.
  let instanceId = b.instance_id ?? null;
  if (instanceId) {
    const { data: own } = await admin
      .from("whatsapp_instances")
      .select("id")
      .eq("id", instanceId)
      .eq("workspace_id", b.workspace_id)
      .maybeSingle();
    if (!own) return jsonError("instance_not_in_workspace", 403);
  } else {
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("id, status, is_default")
      .eq("workspace_id", b.workspace_id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (inst ?? []) as Array<{ id: string; status: string; is_default: boolean }>;
    const chosen = list.find((i) => i.status === "connected") ?? list[0];
    if (!chosen) return jsonError("no_instance", 409);
    instanceId = chosen.id;
  }

  // Validate scheduled_at; default to now (drains on the next cron tick).
  let scheduledAt = new Date().toISOString();
  if (b.scheduled_at) {
    const t = new Date(b.scheduled_at);
    if (Number.isNaN(t.getTime())) return jsonError("invalid scheduled_at", 400);
    scheduledAt = t.toISOString();
  }

  const { data, error } = await admin
    .from("whatsapp_status_posts")
    .insert({
      workspace_id: b.workspace_id,
      instance_id: instanceId,
      kind,
      caption: b.caption ?? null,
      text_content: kind === "text" ? b.text_content ?? null : null,
      media_url: kind === "text" ? null : b.media_url ?? null,
      background_color: b.background_color ?? null,
      font: b.font ?? null,
      status: "scheduled",
      scheduled_at: scheduledAt,
      created_by: auth.user.id,
    })
    .select(COLS)
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const id = sp.get("id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  if (!id) return jsonError("id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { error } = await admin
    .from("whatsapp_status_posts")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .in("status", ["draft", "scheduled"]);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
