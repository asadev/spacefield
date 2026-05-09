/* WhatsApp sendMessage POST endpoint.
 *
 * Auth via Supabase cookie + workspace_member check. The actual Meta
 * Cloud API call lives in `_send.ts` so this file exports only HTTP
 * method handlers.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { sendWhatsAppText } from "./_send";

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
