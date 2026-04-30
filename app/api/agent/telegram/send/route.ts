/* Telegram sendMessage helper.
 *
 * Internal — server-side callers (the webhook handler, the test-message
 * button on the Settings page). Keeps a thin POST handler so the
 * Settings UI can hit it via fetch.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface SendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function sendTelegramText(
  chatId: number,
  text: string
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, status: 0, body: "missing TELEGRAM_BOT_TOKEN" };
  }
  // Telegram caps single messages at 4096 chars.
  const safe = text.length > 4096 ? text.slice(0, 4093) + "..." : text;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safe,
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = (await req.json().catch(() => ({}))) as {
    text?: string;
    workspace_id?: string;
  };
  const text = payload.text?.trim();
  const workspaceId = payload.workspace_id?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  const { data: role, error: roleErr } = await supabase.rpc(
    "workspace_role_of",
    { ws_id: workspaceId }
  );
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }
  if (role !== "owner" && role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  const { data: link } = await supabase
    .from("agent_telegram_links")
    .select("telegram_user_id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json({ error: "no_telegram_linked" }, { status: 400 });
  }
  const result = await sendTelegramText(
    Number(link.telegram_user_id),
    text
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
