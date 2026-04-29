/* Mint a 6-digit Telegram linking code.
 *
 * The Settings UI displays:
 *   "Open https://t.me/SpaceField_Bot?start=482913 to link your account."
 *
 * The webhook receives `/start <code>`, looks it up here, creates an
 * agent_telegram_links row, and replies "linked".
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomInt } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BOT_USERNAME = "SpaceField_Bot";

function generateCode(): string {
  // Cryptographically strong RNG. Math.random() is brute-forceable
  // over the 1M-key, 10-min-TTL space.
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
  const { data: mem } = await createAdminClient()
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  // Use admin client for the write — same JWT-propagation flake that
  // hits the membership check would silently no-op the insert/delete
  // and the user would see a 200 with no working code on the server.
  const adm = createAdminClient();
  await adm
    .from("agent_telegram_link_codes")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await adm.from("agent_telegram_link_codes").insert({
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
    bot_username: BOT_USERNAME,
    deep_link: `https://t.me/${BOT_USERNAME}?start=${code}`,
  });
}

export async function DELETE(req: NextRequest) {
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
    .from("agent_telegram_links")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
