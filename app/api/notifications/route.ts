// Notifications API
//   GET  /api/notifications?since=<iso>   — returns unread + recent read (max 10)
//   POST /api/notifications               — body: { ids?: string[], all?: boolean }
//                                            marks listed (or all) as read
//
// Called from <NotificationBell /> every ~60s.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since");

  let query = supabase
    .from("notifications")
    .select("id, kind, title, body, href, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ items: [], unread: 0, error: error.message }, { status: 500 });
  }

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  return NextResponse.json({ items: data || [], unread: unread || 0 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { ids?: string[]; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.all) {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .in("id", body.ids);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "no ids" }, { status: 400 });
}
