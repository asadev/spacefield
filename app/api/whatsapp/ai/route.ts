import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  aiDraftReply,
  aiSummarize,
  aiTranscribe,
  aiTranslate,
  isAIConfigured,
  type ThreadTurn,
  type TranslateTarget,
} from "@/lib/whatsapp/ai";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// AI completions + transcription can take a while; allow headroom.
export const maxDuration = 60;

/**
 * POST /api/whatsapp/ai   (EPIC-11)
 *
 * One inbox-side AI route, server-side only (keys never reach the browser),
 * reusing the platform's configured AI provider (ANTHROPIC_API_KEY preferred,
 * OPENAI_API_KEY fallback — both SDKs already deps). When NO key is configured
 * it returns { ai_configured: false } with HTTP 200 so the UI degrades to a
 * clear "AI not configured" state instead of erroring.
 *
 * Body (discriminated on `task`):
 *   { workspace_id, task: 'draft',     conversation_id, instruction? }
 *   { workspace_id, task: 'summarize', conversation_id }
 *   { workspace_id, task: 'translate', text, target: 'english'|'urdu'|'roman_urdu' }
 *   { workspace_id, task: 'transcribe', message_id }   // inbound voice note
 *
 * draft/summarize load the last ~40 thread messages (excluding private notes).
 * transcribe pulls the decrypted audio from Evolution, writes the text into
 * whatsapp_messages.transcription, and returns it.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember + ownership.
 */

interface AIBody {
  workspace_id?: string;
  task?: "draft" | "summarize" | "translate" | "transcribe";
  conversation_id?: string;
  message_id?: string;
  text?: string;
  target?: TranslateTarget;
  instruction?: string;
}

const THREAD_LIMIT = 40;

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<AIBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);
  if (!b.task) return jsonError("task required", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  // Graceful "not configured" — never fail the build on a missing key.
  // Transcribe additionally needs OpenAI specifically; the lib returns null.
  if (!isAIConfigured()) {
    return NextResponse.json({ ai_configured: false });
  }

  const admin = createAdminClient();

  // ── translate: no conversation context needed ──
  if (b.task === "translate") {
    if (!b.text?.trim()) return jsonError("text required", 400);
    const target: TranslateTarget =
      b.target === "urdu" || b.target === "roman_urdu" ? b.target : "english";
    try {
      const result = await aiTranslate({ text: b.text, target });
      return NextResponse.json({ ai_configured: true, result });
    } catch (e) {
      return aiError(e);
    }
  }

  // ── transcribe: pull decrypted audio, write transcription ──
  if (b.task === "transcribe") {
    if (!b.message_id) return jsonError("message_id required", 400);
    const { data: msg } = await admin
      .from("whatsapp_messages")
      .select(
        "id, workspace_id, instance_id, media_type, transcription, evolution_message_id, sender_jid, from_number, conversation_id",
      )
      .eq("id", b.message_id)
      .maybeSingle();
    if (!msg) return jsonError("message_not_found", 404);
    const m = msg as {
      id: string;
      workspace_id: string;
      instance_id: string;
      media_type: string | null;
      transcription: string | null;
      evolution_message_id: string | null;
      sender_jid: string | null;
      from_number: string | null;
      conversation_id: string | null;
    };
    if (m.workspace_id !== b.workspace_id) return jsonError("forbidden", 403);
    if (m.media_type !== "audio") return jsonError("not_a_voice_note", 422);
    if (m.transcription) {
      return NextResponse.json({ ai_configured: true, result: m.transcription, cached: true });
    }
    if (!m.evolution_message_id) return jsonError("no_evolution_id", 422);

    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("*")
      .eq("id", m.instance_id)
      .maybeSingle();
    if (!inst) return jsonError("no_instance", 409);
    const instance = inst as WhatsAppInstanceRow;

    try {
      const client = getEvolutionClient();
      // remoteJid for the message key: sender JID (group) or from_number@s.whatsapp.net.
      const remoteJid =
        m.sender_jid ??
        (m.from_number ? `${m.from_number}@s.whatsapp.net` : "");
      const media = await client.getBase64FromMedia(
        instance.evolution_instance_name,
        { id: m.evolution_message_id, remoteJid, fromMe: false },
        { timeoutMs: 25_000 },
      );
      if (!media?.base64) {
        return NextResponse.json({
          ai_configured: true,
          result: null,
          error: "audio_unavailable",
        });
      }
      const text = await aiTranscribe({
        base64: media.base64,
        mimetype: media.mimetype || "audio/ogg",
      });
      if (text === null) {
        // No OpenAI key (Anthropic-only deployment) → clear signal, not 500.
        return NextResponse.json({
          ai_configured: true,
          result: null,
          error: "transcription_unavailable",
        });
      }
      await admin
        .from("whatsapp_messages")
        .update({ transcription: text })
        .eq("id", m.id);
      return NextResponse.json({ ai_configured: true, result: text });
    } catch (e) {
      return aiError(e);
    }
  }

  // ── draft / summarize: need the conversation thread ──
  if (!b.conversation_id) return jsonError("conversation_id required", 400);
  const { data: conv } = await admin
    .from("whatsapp_conversations")
    .select("id, workspace_id, contact_id, title, source_id")
    .eq("id", b.conversation_id)
    .maybeSingle();
  if (!conv) return jsonError("conversation_not_found", 404);
  const c = conv as {
    id: string;
    workspace_id: string;
    contact_id: string | null;
    title: string | null;
    source_id: string;
  };
  if (c.workspace_id !== b.workspace_id) return jsonError("forbidden", 403);

  // Thread: newest-first then reverse to chronological, excluding private notes.
  const { data: rows } = await admin
    .from("whatsapp_messages")
    .select("direction, body, media_type, created_at")
    .eq("conversation_id", b.conversation_id)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(THREAD_LIMIT);
  const turns: ThreadTurn[] = ((rows ?? []) as Array<{
    direction: "inbound" | "outbound";
    body: string | null;
    media_type: string | null;
    created_at: string;
  }>)
    .reverse()
    .map((r) => ({
      direction: r.direction,
      body: (r.body ?? "").trim() || (r.media_type ? `[${r.media_type}]` : ""),
      created_at: r.created_at,
    }))
    .filter((t) => t.body);

  if (turns.length === 0) {
    return jsonError("empty_thread", 422);
  }

  // Contact display name for nicer prompts.
  let contactName: string | null = c.title;
  if (!contactName && c.contact_id) {
    const { data: ct } = await admin
      .from("crm_contacts")
      .select("first_name, last_name")
      .eq("id", c.contact_id)
      .maybeSingle();
    if (ct) {
      const r = ct as { first_name: string | null; last_name: string | null };
      contactName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || null;
    }
  }

  try {
    if (b.task === "draft") {
      const result = await aiDraftReply({
        turns,
        contactName,
        instruction: b.instruction ?? null,
      });
      return NextResponse.json({ ai_configured: true, result });
    }
    if (b.task === "summarize") {
      const result = await aiSummarize({ turns, contactName });
      return NextResponse.json({ ai_configured: true, result });
    }
    return jsonError("unknown task", 400);
  } catch (e) {
    return aiError(e);
  }
}

function aiError(e: unknown): Response {
  const msg = e instanceof Error ? e.message : "ai_failed";
  if (msg === "ai_not_configured") {
    return NextResponse.json({ ai_configured: false });
  }
  // eslint-disable-next-line no-console
  console.error("[whatsapp.ai] error:", msg);
  return NextResponse.json(
    { error: "ai_failed", message: "AI request failed" },
    { status: 502 },
  );
}
