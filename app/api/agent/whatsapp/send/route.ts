/* Internal helper: POST a text message to a WhatsApp recipient via the
 * Meta Cloud API. Not exposed externally — every caller is server-side
 * (the webhook handler, the dispatch route, the test-message button on
 * the Settings page).
 *
 * We export `sendWhatsAppText` for in-process callers and also keep a
 * thin POST handler so the Settings UI can hit it through a normal
 * fetch (auth via Supabase cookie + workspace_member check).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GRAPH_VERSION = "v22.0";

export interface SendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/** Send a plain-text WhatsApp message. */
export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<SendResult> {
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!phoneNumberId || !token) {
    return {
      ok: false,
      status: 0,
      body: "missing META_WHATSAPP_PHONE_NUMBER_ID or META_SYSTEM_USER_TOKEN",
    };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
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
  // Look up the caller's linked WhatsApp number.
  const { data: link } = await supabase
    .from("agent_whatsapp_links")
    .select("whatsapp_number")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!link) {
    return NextResponse.json(
      { error: "no_whatsapp_linked" },
      { status: 400 }
    );
  }
  const result = await sendWhatsAppText(link.whatsapp_number, text);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
