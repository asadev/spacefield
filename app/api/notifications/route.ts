import { NextResponse, type NextRequest } from "next/server";

import {
  archiveNotification,
  countUnread,
  listForUser,
  markAllRead,
  markRead,
} from "@/lib/collab/notifications";
import { safeErrorMessage } from "@/lib/safe-error";
import { createClient } from "@/lib/supabase/server";

/* /api/notifications — single inbox API.
 *
 * GET  ?unread=1&kind=<kind>&limit=<n>
 *   Returns { items: [...], unread: <count> } where each item is shaped
 *   for the existing NotificationBell client (id, kind, title, body,
 *   href, read, created_at).
 *
 * POST { ids: string[] }     → mark those notifications read.
 *      { all: true, kind? }  → mark all (optionally filtered by kind) read.
 *      { archive: string }   → archive a single notification.
 *
 * RLS gates everything to recipient_user_id = auth.uid(); we additionally
 * 401 when there's no session so the bell can render nothing.
 */

interface ListedItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  created_at: string;
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const kind = req.nextUrl.searchParams.get("kind") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), 200))
    : 50;

  try {
    const [rows, unread] = await Promise.all([
      listForUser(user.id, { unreadOnly, kind, limit }),
      countUnread(user.id),
    ]);
    const items: ListedItem[] = rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? "",
      href: n.href,
      read: n.read_at !== null,
      created_at: n.created_at,
    }));
    return NextResponse.json({ items, unread });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "notifications.list",
          userId: user.id,
          fallback: "list_failed",
        }),
      },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    if (payload.all === true) {
      const kind =
        typeof payload.kind === "string" ? (payload.kind as string) : undefined;
      const n = await markAllRead(user.id, kind);
      return NextResponse.json({ ok: true, updated: n });
    }
    if (typeof payload.archive === "string") {
      await archiveNotification(payload.archive);
      return NextResponse.json({ ok: true });
    }
    if (Array.isArray(payload.ids)) {
      const ids = (payload.ids as unknown[]).map(String).filter(Boolean);
      for (const id of ids) {
        await markRead(id, user.id);
      }
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "notifications.update",
          userId: user.id,
          fallback: "post_failed",
        }),
      },
      { status: 400 }
    );
  }
}
