/* Per-workspace persona API.
 *
 *   GET  /api/agent/persona?workspace_id=…  — read (any member)
 *   PUT  /api/agent/persona                 — upsert (owners + admins)
 *
 * Persona affects the bot's name, tone, optional flavor description,
 * and optional first-message override. RLS gates writes to admins/owners.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PERSONA, type AgentPersona } from "@/lib/agent/runtime/persona";

const VALID_TONES: AgentPersona["voice_tone"][] = [
  "friendly",
  "formal",
  "casual",
  "direct",
  "playful",
];

export async function GET(req: NextRequest) {
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
  const { data, error } = await supabase
    .from("agent_personas")
    .select("bot_name, persona_description, voice_tone, custom_greeting, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ ...DEFAULT_PERSONA, updated_at: null });
  }
  return NextResponse.json(data);
}

interface PutBody {
  workspace_id?: string;
  bot_name?: string;
  persona_description?: string;
  voice_tone?: string;
  custom_greeting?: string;
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as PutBody;
  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  // Admin/owner gate. RLS enforces this too — we 403 here for a cleaner
  // error message.
  const { data: mem } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (mem?.role as string | undefined) ?? null;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }

  const botName =
    typeof body.bot_name === "string" && body.bot_name.trim().length > 0
      ? body.bot_name.trim().slice(0, 60)
      : DEFAULT_PERSONA.bot_name;
  const personaDescription =
    typeof body.persona_description === "string"
      ? body.persona_description.trim().slice(0, 200)
      : "";
  const voiceTone: AgentPersona["voice_tone"] =
    typeof body.voice_tone === "string" &&
    (VALID_TONES as string[]).includes(body.voice_tone)
      ? (body.voice_tone as AgentPersona["voice_tone"])
      : "friendly";
  const customGreeting =
    typeof body.custom_greeting === "string"
      ? body.custom_greeting.trim().slice(0, 200)
      : "";

  const { error: upsertErr } = await supabase
    .from("agent_personas")
    .upsert(
      {
        workspace_id: workspaceId,
        bot_name: botName,
        persona_description: personaDescription,
        voice_tone: voiceTone,
        custom_greeting: customGreeting,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }
  return NextResponse.json({
    bot_name: botName,
    persona_description: personaDescription,
    voice_tone: voiceTone,
    custom_greeting: customGreeting,
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
  const { error } = await supabase
    .from("agent_personas")
    .delete()
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...DEFAULT_PERSONA });
}
