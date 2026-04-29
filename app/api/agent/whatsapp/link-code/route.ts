/* Mint a 6-digit WhatsApp linking code.
 *
 * Called by the Settings UI when the user taps "Link WhatsApp". We
 * generate a 6-digit code, store it with a 10-minute TTL keyed to
 * (user_id, workspace_id), and return it to the UI which displays:
 *
 *   "From your WhatsApp, send this code to +1 555-646-8961: 482-913"
 *
 * The webhook handler matches incoming messages against this table.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateCode(): string {
  // 6 digits, leading zeros allowed. Cryptographically strong RNG —
  // Math.random() is predictable enough to be brute-forced over the
  // 1M-key, 10-min-TTL space if an attacker can guess concurrently
  // with active codes.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    workspace_id?: string;
  };
  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  // Confirm membership via service-role lookup. The auth.getUser()
  // call above already verified the caller's identity; the membership
  // check just validates the requested workspace is theirs. We use the
  // admin client because RLS on workspace_members can hide a user's
  // own row in some Supabase SSR sessions.
  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // Drop any existing codes for this user/workspace pair. Use the admin
  // client for the same reason as the membership check — the JWT-flake
  // that hides the membership row would silently no-op the
  // insert/delete and the user would see a 200 with no working code
  // server-side.
  await admin
    .from("agent_whatsapp_link_codes")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await admin.from("agent_whatsapp_link_codes").insert({
    code,
    workspace_id: workspaceId,
    user_id: user.id,
    expires_at: expiresAt,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    code,
    expires_at: expiresAt,
    bot_number: "+1 555-646-8961",
  });
}

export async function DELETE(req: NextRequest) {
  // Unlink the caller's WhatsApp number from their account.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  // Service role for the same JWT-flake reason as POST.
  const { error } = await createAdminClient()
    .from("agent_whatsapp_links")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
