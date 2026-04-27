import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/chat/messages/send
 *   body: { channel_id, body, attachment_ids?: string[], reply_to?: string }
 *   returns: { message }
 *
 * Authorization is enforced two ways:
 *   1. RLS on chat_messages requires is_workspace_member + author = auth.uid()
 *   2. We re-check that every attachment_id belongs to the same workspace
 *      (defence-in-depth — files are inserted via /api/files/save-content
 *      which already RLS-checks membership, but we verify ownership here
 *      so a member can't reference some other workspace's file id).
 */

interface MessageBody {
  channel_id?: string;
  body?: string;
  attachment_ids?: string[];
  reply_to?: string;
}

const MAX_BODY_LEN = 8000;
const MAX_ATTACHMENTS = 10;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: MessageBody;
  try {
    parsed = (await req.json()) as MessageBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const channelId = parsed.channel_id;
  const rawBody = (parsed.body ?? "").toString();
  const attachmentIds = Array.isArray(parsed.attachment_ids)
    ? parsed.attachment_ids.filter((s): s is string => typeof s === "string")
    : [];
  const replyTo =
    typeof parsed.reply_to === "string" && parsed.reply_to.length > 0
      ? parsed.reply_to
      : null;

  if (!channelId) {
    return NextResponse.json({ error: "missing channel_id" }, { status: 400 });
  }
  const trimmed = rawBody.slice(0, MAX_BODY_LEN);
  if (trimmed.trim().length === 0 && attachmentIds.length === 0) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  if (attachmentIds.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `max ${MAX_ATTACHMENTS} attachments` },
      { status: 400 }
    );
  }

  // Resolve channel → workspace_id (RLS scopes this to channels the
  // caller can see, i.e. they must be a member already).
  const { data: channel, error: chErr } = await supabase
    .from("chat_channels")
    .select("id, workspace_id")
    .eq("id", channelId)
    .maybeSingle();
  if (chErr) {
    return NextResponse.json({ error: chErr.message }, { status: 500 });
  }
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  // Verify each attachment lives in the same workspace.
  if (attachmentIds.length > 0) {
    const { data: files, error: filesErr } = await supabase
      .from("workspace_files")
      .select("id, workspace_id")
      .in("id", attachmentIds);
    if (filesErr) {
      return NextResponse.json({ error: filesErr.message }, { status: 500 });
    }
    if (!files || files.length !== attachmentIds.length) {
      return NextResponse.json(
        { error: "attachment_not_found" },
        { status: 400 }
      );
    }
    for (const f of files) {
      if ((f.workspace_id as string) !== channel.workspace_id) {
        return NextResponse.json(
          { error: "attachment_workspace_mismatch" },
          { status: 400 }
        );
      }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      workspace_id: channel.workspace_id,
      user_id: user.id,
      body: trimmed,
      attachments: attachmentIds,
      reply_to: replyTo,
    })
    .select(
      "id, channel_id, workspace_id, user_id, body, attachments, reply_to, edited_at, deleted_at, created_at"
    )
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "insert failed" },
      { status: 500 }
    );
  }

  // Touch read state so the author doesn't see their own message as unread.
  await supabase.from("chat_read_state").upsert(
    {
      user_id: user.id,
      channel_id: channelId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,channel_id" }
  );

  return NextResponse.json({ message: inserted });
}
