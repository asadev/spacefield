import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/chat/messages/list?channel_id=<uuid>&before=<iso>
 *   Returns 50 messages (newest first). Each message has its
 *   `attachments` jsonb expanded into resolved file rows.
 */

interface AttachmentLite {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
}

interface MessageRow {
  id: string;
  channel_id: string;
  workspace_id: string;
  user_id: string;
  body: string;
  attachments: unknown;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

interface MessageRowExpanded extends Omit<MessageRow, "attachments"> {
  attachments: AttachmentLite[];
}

const PAGE_SIZE = 50;

function attachmentIdsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const v of value) {
    if (typeof v === "string") {
      ids.push(v);
    } else if (v && typeof v === "object" && "id" in v) {
      const id = (v as { id?: unknown }).id;
      if (typeof id === "string") ids.push(id);
    }
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channel_id");
  const before = req.nextUrl.searchParams.get("before");
  if (!channelId) {
    return NextResponse.json({ error: "missing channel_id" }, { status: 400 });
  }

  let query = supabase
    .from("chat_messages")
    .select(
      "id, channel_id, workspace_id, user_id, body, attachments, reply_to, edited_at, deleted_at, created_at"
    )
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as MessageRow[];
  const ids = new Set<string>();
  for (const r of rows) {
    for (const id of attachmentIdsFrom(r.attachments)) ids.add(id);
  }

  let fileMap = new Map<string, AttachmentLite>();
  if (ids.size > 0) {
    const { data: files, error: fileErr } = await supabase
      .from("workspace_files")
      .select("id, name, size_bytes, content_type")
      .in("id", Array.from(ids));
    if (fileErr) {
      return NextResponse.json({ error: fileErr.message }, { status: 500 });
    }
    fileMap = new Map(
      (files ?? []).map((f) => [
        f.id as string,
        {
          id: f.id as string,
          name: f.name as string,
          size_bytes: Number(f.size_bytes ?? 0),
          content_type: (f.content_type as string | null) ?? null,
        },
      ])
    );
  }

  const expanded: MessageRowExpanded[] = rows.map((r) => {
    const ids = attachmentIdsFrom(r.attachments);
    const resolved: AttachmentLite[] = [];
    for (const id of ids) {
      const f = fileMap.get(id);
      if (f) resolved.push(f);
    }
    return { ...r, attachments: resolved };
  });

  return NextResponse.json({ messages: expanded });
}
