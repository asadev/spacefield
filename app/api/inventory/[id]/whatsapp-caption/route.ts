/* ─────────────────────────────────────────────────────────────────────────
 * POST /api/inventory/[id]/whatsapp-caption
 *
 * Generate one-to-five WhatsApp marketing caption variants for a single
 * inventory item. Pro-gated (the call costs AI tokens) and scoped via
 * the caller's Supabase client so RLS owns the read.
 *
 * Body (all fields optional):
 *   {
 *     language?: string,       // "en", "ur", "ar", "Roman Urdu", ...
 *     tone?: "casual" | "professional" | "urgent" | "friendly",
 *     length?: "short" | "medium" | "long",
 *     variantCount?: number    // 1..5, default 3
 *   }
 *
 * Returns:
 *   { variants: string[], language, tone, length, model }
 * ─────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import {
  fetchInventoryItem,
  fetchWorkspaceIndustry,
  generateInventoryCaption,
  isCaptionLength,
  isCaptionTone,
  type CaptionLength,
  type CaptionTone,
} from "@/lib/ai/skills/inventory-caption";
import { isPro } from "@/lib/pro/features";
import { jsonError, readJson, requireUser } from "@/app/api/crm/_helpers";
import { logError } from "@/lib/error-log";

interface CaptionRequestBody {
  language?: string;
  tone?: string;
  length?: string;
  variantCount?: number;
}

const ALLOWED_LANGUAGES = new Set<string>([
  "English",
  "Spanish",
  "Arabic",
  "French",
  "Portuguese",
  "Roman Urdu",
  "Urdu",
  "Hindi",
  "Chinese",
  "Indonesian",
  "Turkish",
  "German",
  "Italian",
  "Russian",
  "Bengali",
  "Persian",
  "Filipino",
  "Vietnamese",
  "Thai",
  "Japanese",
  "Korean",
  // ISO codes
  "en",
  "es",
  "ar",
  "fr",
  "pt",
  "ur",
  "hi",
  "zh",
  "id",
  "tr",
  "de",
  "it",
  "ru",
  "bn",
  "fa",
  "tl",
  "vi",
  "th",
  "ja",
  "ko",
]);

function sanitiseLanguage(raw: unknown): string {
  if (typeof raw !== "string") return "English";
  const trimmed = raw.trim().slice(0, 32);
  if (!trimmed) return "English";
  // Allow any of the known languages; otherwise fall back to English so
  // the model isn't fed garbage. We don't error — keeps the surface
  // forgiving for new callers.
  if (ALLOWED_LANGUAGES.has(trimmed)) return trimmed;
  // Tolerate well-formed locale strings like "pt-BR" → "pt".
  const head = trimmed.split(/[-_]/)[0];
  if (ALLOWED_LANGUAGES.has(head)) return head;
  return "English";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Pro gate — the body lives in lib/pro/features.ts, which only takes
  // a user id. (No fancy team-tier matrix yet.) On any error we fail
  // closed: hitting an AI endpoint without Pro is the surface we don't
  // want to leak.
  let pro = false;
  try {
    pro = await isPro(auth.user.id);
  } catch {
    pro = false;
  }
  if (!pro) {
    return NextResponse.json(
      {
        error: "pro_required",
        message:
          "AI caption generation is part of Pro. Refer friends to unlock.",
      },
      { status: 402 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  // Membership check via RLS — fetch the inventory item under the
  // caller's client. If the row isn't readable they get 404.
  const params = await ctx.params;
  const itemId = params.id;
  if (!itemId || typeof itemId !== "string") {
    return jsonError("item id required");
  }

  const item = await fetchInventoryItem(auth.supabase, workspaceId, itemId);
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await readJson<CaptionRequestBody>(req);
  if (!body.ok) return body.response;
  const input = body.body;

  const language = sanitiseLanguage(input.language ?? "English");
  const tone: CaptionTone = isCaptionTone(input.tone) ? input.tone : "casual";
  const length: CaptionLength = isCaptionLength(input.length)
    ? input.length
    : "medium";
  const variantCount = Math.max(
    1,
    Math.min(5, Math.floor(Number(input.variantCount ?? 3)) || 3)
  );

  let industry: string | null = null;
  try {
    industry = await fetchWorkspaceIndustry(auth.supabase, workspaceId);
  } catch {
    industry = null;
  }

  try {
    const result = await generateInventoryCaption({
      item,
      language,
      tone,
      length,
      variantCount,
      industry,
      workspaceId,
      userId: auth.user.id,
    });
    return NextResponse.json({
      variants: result.variants,
      language: result.language,
      tone: result.tone,
      length: result.length,
      model: result.modelUsed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "caption_failed";
    await logError({
      source: "inventory.whatsapp_caption",
      message,
      stack: e instanceof Error ? e.stack ?? null : null,
      url: req.nextUrl.toString(),
      level: "error",
      user_id: auth.user.id,
    });
    return NextResponse.json(
      { error: "caption_failed", message },
      { status: 500 }
    );
  }
}
