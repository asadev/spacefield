/* ─────────────────────────────────────────────────────────────────────────
 * Inventory caption AI helper.
 *
 * One canonical place that knows how to turn a `crm_inventory_items` row
 * into a WhatsApp-ready marketing caption. Used by:
 *
 *   1. The HTTP endpoint at `app/api/inventory/[id]/whatsapp-caption/route.ts`
 *      (called from the inventory composer modal in the CRM tool).
 *   2. The `generate_inventory_caption` tool exposed to the workspace
 *      AI assistant (so the user can say "make a WhatsApp caption for
 *      SKU XYZ" from `/chat` and get the same output).
 *
 * Design notes
 * ────────────
 *   • Multilingual. The caller picks a language; the prompt instructs
 *     the model to write only in that language. Default is the
 *     workspace locale (resolved on the call site), then English.
 *   • Currency-agnostic. We pass through the workspace currency, never
 *     hardcoded. No "AED", no "PKR" anywhere in this file.
 *   • Industry-aware. We try to look up the workspace's industry (Agent
 *     C is wiring `workspaces.industry` + a registry); if missing, we
 *     fall through to a generic "retail" framing so the function never
 *     blocks on the other agent's work.
 *   • Variants. The model returns N caption variants in one call so
 *     the user can pick the best one. Default N=3, max 5.
 *   • Uses the same `callWithFallback` + `recordAiCall` plumbing the
 *     rest of the runtime uses, so cost is tracked and the circuit
 *     breaker applies.
 * ─────────────────────────────────────────────────────────────────── */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { recordAiCall } from "@/lib/ai/cost";
import { callWithFallback } from "@/lib/ai/model-fallback";
import { getRuntimeModel } from "@/lib/agent/runtime/_models";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CaptionTone = "casual" | "professional" | "urgent" | "friendly";
export type CaptionLength = "short" | "medium" | "long";

export interface InventoryRow {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  quantity: number | null;
  unit: string | null;
  custom: Record<string, unknown> | null;
}

export interface GenerateCaptionInput {
  item: InventoryRow;
  /** ISO 639-1 like "en", "ur", "ar", "es" — or a display name like
   *  "Roman Urdu". The model accepts either. */
  language: string;
  tone: CaptionTone;
  length: CaptionLength;
  /** 1..5. Defaults to 3. */
  variantCount: number;
  /** Optional industry hint ("clothing_retail", "real_estate", ...).
   *  When unknown, pass null and the helper falls back to generic
   *  retail wording. */
  industry: string | null;
  /** Caller workspace id — only used for cost tracking. */
  workspaceId: string;
  /** Caller user id — only used for cost tracking. */
  userId: string;
}

export interface GenerateCaptionResult {
  variants: string[];
  language: string;
  tone: CaptionTone;
  length: CaptionLength;
  modelUsed: string;
}

const VALID_TONES: ReadonlySet<CaptionTone> = new Set([
  "casual",
  "professional",
  "urgent",
  "friendly",
]);
const VALID_LENGTHS: ReadonlySet<CaptionLength> = new Set([
  "short",
  "medium",
  "long",
]);

export function isCaptionTone(v: unknown): v is CaptionTone {
  return typeof v === "string" && VALID_TONES.has(v as CaptionTone);
}

export function isCaptionLength(v: unknown): v is CaptionLength {
  return typeof v === "string" && VALID_LENGTHS.has(v as CaptionLength);
}

/* ─── Industry framing ────────────────────────────────────────────── */

/**
 * Industry-specific prompt fragments. We keep this short — the model
 * does the heavy lifting. The point of these fragments is to bias the
 * vocabulary so a clothing caption talks about "fabric / fit / size"
 * and a real-estate caption talks about "bedrooms / view / handover".
 *
 * When the industry is unknown we fall through to a generic retail
 * fragment that won't sound wrong for any vertical.
 */
const INDUSTRY_FRAMING: Record<string, string> = {
  clothing_retail:
    "This is for a clothing / fashion business. Lean into fabric, fit, color, sizes, and seasonality where the item description gives you the material.",
  fashion:
    "This is for a fashion business. Lean into fabric, fit, color, sizes, and styling.",
  real_estate:
    "This is for a real-estate business. Lean into location, bedrooms, view, and handover/availability.",
  food_beverage:
    "This is for a food / beverage business. Lean into freshness, taste, portions, and time-of-day fit.",
  cosmetics:
    "This is for a cosmetics / beauty business. Lean into shade, ingredients, finish, and skin/hair type fit.",
  electronics:
    "This is for an electronics business. Lean into spec highlights, compatibility, and warranty.",
  grocery:
    "This is for a grocery business. Lean into freshness, origin, and pack size.",
  jewelry:
    "This is for a jewelry business. Lean into metal, gemstones, weight, and occasion fit.",
  furniture:
    "This is for a furniture business. Lean into material, dimensions, and room fit.",
  generic_retail:
    "This is for a retail business. Use neutral product language; don't invent specs that aren't in the input.",
};

function frameFor(industry: string | null): string {
  if (!industry) return INDUSTRY_FRAMING.generic_retail;
  return INDUSTRY_FRAMING[industry] ?? INDUSTRY_FRAMING.generic_retail;
}

/* ─── Prompt build ────────────────────────────────────────────────── */

function lengthHint(length: CaptionLength): string {
  switch (length) {
    case "short":
      return "Keep each caption tight — under 200 characters.";
    case "long":
      return "Each caption can run 350–500 characters. Include a couple of bullet-style highlights if natural.";
    case "medium":
    default:
      return "Each caption should land around 250–350 characters.";
  }
}

function toneHint(tone: CaptionTone): string {
  switch (tone) {
    case "professional":
      return "Tone: polished, professional, no slang.";
    case "urgent":
      return "Tone: scarcity / urgency — limited stock, last few, ending soon. Don't lie about quantity.";
    case "friendly":
      return "Tone: warm and friendly, like writing to a regular customer.";
    case "casual":
    default:
      return "Tone: casual and conversational.";
  }
}

/**
 * Build a compact item summary the model can read in one pass. We
 * deliberately surface common clothing/retail custom fields by name so
 * the model picks them up, but the call also dumps the full custom blob
 * as JSON so nothing is hidden.
 */
function describeItem(item: InventoryRow): string {
  const c = item.custom ?? {};
  const lines: string[] = [`Name: ${item.name}`];
  if (item.sku) lines.push(`SKU: ${item.sku}`);
  if (item.category) lines.push(`Category: ${item.category}`);
  if (item.description) lines.push(`Description: ${item.description}`);
  if (item.price !== null && Number.isFinite(item.price)) {
    lines.push(`Price: ${item.price} ${item.currency}`);
  }
  if (item.quantity !== null && Number.isFinite(item.quantity)) {
    lines.push(
      `Quantity available: ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
    );
  }
  // Surface a few well-known custom fields explicitly. Anything not
  // matched falls through to the JSON dump below.
  const HIGHLIGHTS = [
    "fabric",
    "fabric_type",
    "material",
    "color",
    "colour",
    "sizes",
    "size",
    "season",
    "brand",
    "origin",
    "weight",
    "dimensions",
    "warranty",
    "bedrooms",
    "bathrooms",
    "view",
    "location",
  ];
  for (const key of HIGHLIGHTS) {
    const v = (c as Record<string, unknown>)[key];
    if (v == null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    lines.push(`${key}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  // Dump remaining custom fields as JSON for the model.
  const seen = new Set([
    ...HIGHLIGHTS,
    "fabric_type",
  ]);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (!seen.has(k) && v != null && v !== "") rest[k] = v;
  }
  if (Object.keys(rest).length > 0) {
    lines.push(`Other attributes (JSON): ${JSON.stringify(rest)}`);
  }
  return lines.join("\n");
}

function buildPrompt(input: GenerateCaptionInput): {
  system: string;
  user: string;
} {
  const n = Math.max(1, Math.min(5, input.variantCount));
  const system = `You write short product marketing captions for WhatsApp messages.

You are writing for a real business with real customers. The audience is reading on a phone. Be specific, concrete, and easy to scan. Never invent facts that aren't in the product input — if the input doesn't say something, don't make it up.

${frameFor(input.industry)}

${lengthHint(input.length)}
${toneHint(input.tone)}

End every caption with a short call to action like "DM to order" or "Reply to reserve" — phrased in the requested language.

LANGUAGE: Write ONLY in ${input.language}. Do not mix English unless the requested language IS English. If the language is "Roman Urdu" or "Roman Hindi" write in Latin script using Urdu/Hindi words. If the language is a script-based language (Urdu, Arabic, Hindi, Chinese), write in that script.

OUTPUT FORMAT — strict:
Return exactly ${n} caption variant${n === 1 ? "" : "s"}, one per line, separated by the marker \`---\` on its own line. No preamble, no numbering, no quotes. Just the captions and the separators.`;
  const user = `Generate ${n} WhatsApp caption variant${n === 1 ? "" : "s"} for the product below.

${describeItem(input.item)}

The price is in ${input.item.currency} — keep the currency code as shown, don't translate it to a different one.`;
  return { system, user };
}

/* ─── Public generator ────────────────────────────────────────────── */

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropic;
}

function parseVariants(text: string, want: number): string[] {
  // Model is instructed to use --- separators. Be lenient on
  // whitespace / blank-line dividers; fall back to a single variant if
  // the model returns one block.
  const raw = text
    .split(/^\s*-{3,}\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (raw.length === 0) return [text.trim()];
  return raw.slice(0, want);
}

export async function generateInventoryCaption(
  input: GenerateCaptionInput
): Promise<GenerateCaptionResult> {
  const { system, user } = buildPrompt(input);
  const resolved = await getRuntimeModel("executor");

  const callRun = async () => {
    const t0 = Date.now();
    const res = await anthropic().messages.create({
      model: resolved.id,
      max_tokens: Math.min(2048, resolved.maxTokens * 2),
      temperature: 0.8,
      system,
      messages: [{ role: "user", content: user }],
    });
    const latencyMs = Date.now() - t0;
    const text = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text,
      latencyMs,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: res.usage.cache_creation_input_tokens ?? 0,
    };
  };

  const fallback = await getRuntimeModel("formatter");

  const result = await callWithFallback({
    primary: {
      provider: resolved.provider,
      model: resolved.id,
      run: callRun,
    },
    fallback:
      fallback.id !== resolved.id
        ? {
            provider: fallback.provider,
            model: fallback.id,
            run: async () => {
              const t0 = Date.now();
              const res = await anthropic().messages.create({
                model: fallback.id,
                max_tokens: Math.min(2048, fallback.maxTokens * 2),
                temperature: 0.8,
                system,
                messages: [{ role: "user", content: user }],
              });
              return {
                text: res.content
                  .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
                  .map((b) => b.text)
                  .join("\n")
                  .trim(),
                latencyMs: Date.now() - t0,
                inputTokens: res.usage.input_tokens,
                outputTokens: res.usage.output_tokens,
                cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
                cacheCreationTokens: res.usage.cache_creation_input_tokens ?? 0,
              };
            },
          }
        : null,
    recordAttempt: (entry) => {
      // We record success rows via recordAiCall outside this hook (we
      // have token counts there); failures we log to console for
      // observability.
      if (entry.status === "error") {
        // eslint-disable-next-line no-console
        console.warn(
          `[inventory-caption] ${entry.provider}/${entry.model} ${entry.status}: ${entry.error ?? ""}`
        );
      }
    },
    callKind: "executor",
  });

  await recordAiCall({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    model: result.modelUsed,
    input_tokens: result.value.inputTokens,
    output_tokens: result.value.outputTokens,
    latency_ms: result.value.latencyMs,
    status: "ok",
  });

  return {
    variants: parseVariants(result.value.text, input.variantCount),
    language: input.language,
    tone: input.tone,
    length: input.length,
    modelUsed: result.modelUsed,
  };
}

/* ─── Lookup helpers (used by route + skill) ──────────────────────── */

/**
 * Fetch a single inventory row by id, scoped via the caller's RLS.
 * Returns null if not found / not authorised.
 */
export async function fetchInventoryItem(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string
): Promise<InventoryRow | null> {
  const { data, error } = await supabase
    .from("crm_inventory_items")
    .select(
      "id, sku, name, category, description, price, currency, quantity, unit, custom"
    )
    .eq("workspace_id", workspaceId)
    .eq("id", itemId)
    .maybeSingle();
  if (error || !data) return null;
  return data as InventoryRow;
}

/**
 * Look up the workspace's currency. The `workspaces` table doesn't (as
 * of this writing) carry a `currency` column — the source of truth
 * for "workspace currency" is the user's `spacefield-currency` cookie
 * read on the call site. So this helper exists for one purpose: when
 * the inventory row itself doesn't pin a currency, we ask the DB if a
 * workspace-wide default is set, and otherwise fall back to whatever
 * the caller passes in.
 *
 * Forward-compatible: if a later migration adds `workspaces.currency`,
 * this helper will pick it up via the dynamic column select.
 */
export async function fetchWorkspaceCurrency(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const c = row["currency"] ?? row["default_currency"];
  if (typeof c === "string" && c.trim()) return c;
  return null;
}

/**
 * Look up the workspace's industry slug, if Agent C's column exists.
 * Tolerates a missing column by returning null. We do a `select("*")`
 * + dynamic key read so a TypeScript strict build doesn't reject the
 * unknown field name.
 */
export async function fetchWorkspaceIndustry(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const v = row["industry"] ?? row["industry_slug"];
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

/* ──────────────────────────────────────────────────────────────────
 * Skill definition — exposed to the workspace AI assistant.
 *
 * Lets a user say things like "make a WhatsApp caption for SKU XYZ"
 * from /chat and get the same output as the inventory composer modal.
 *
 * Registered from lib/agent/skills/index.ts.
 * ─────────────────────────────────────────────────────────────── */

// Late import: keeps this file usable from non-skill call sites
// (the route handler in particular) without dragging the agent
// runtime's type-graph in.
import type {
  SkillDefinition,
  ToolDefinition,
  UserContext,
} from "@/lib/agent/runtime/types";
import { toolError, toolOk } from "@/lib/agent/skills/_helpers";
import { checkRole } from "@/lib/agent/skills/_helpers";

async function lookupItemByIdOrSku(
  ctx: UserContext,
  query: string
): Promise<InventoryRow | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  // Try id first (UUID-ish), then fall back to SKU lookup.
  const isUuid = /^[0-9a-f-]{32,36}$/i.test(trimmed);
  if (isUuid) {
    const r = await ctx.supabase
      .from("crm_inventory_items")
      .select(
        "id, sku, name, category, description, price, currency, quantity, unit, custom"
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("id", trimmed)
      .maybeSingle();
    if (r.data) return r.data as InventoryRow;
  }
  const r2 = await ctx.supabase
    .from("crm_inventory_items")
    .select(
      "id, sku, name, category, description, price, currency, quantity, unit, custom"
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("sku", trimmed)
    .maybeSingle();
  if (r2.data) return r2.data as InventoryRow;
  return null;
}

const generate_inventory_caption: ToolDefinition = {
  name: "generate_inventory_caption",
  description:
    "Generate 1–5 WhatsApp marketing caption variants for one inventory item. Pass an item id or SKU.",
  input_schema: {
    type: "object",
    properties: {
      item: {
        type: "string",
        description:
          "Inventory item id (UUID) or SKU. SKU lookup is exact-match against the workspace.",
      },
      language: {
        type: "string",
        description:
          "Language for the caption. Free-form (e.g. 'English', 'Roman Urdu', 'es', 'ar'). Defaults to English.",
      },
      tone: {
        type: "string",
        enum: ["casual", "professional", "urgent", "friendly"],
        description: "Tone of the caption. Defaults to casual.",
      },
      length: {
        type: "string",
        enum: ["short", "medium", "long"],
        description: "Caption length budget. Defaults to medium.",
      },
      variantCount: {
        type: "number",
        description:
          "How many caption variants to return (1–5, default 3).",
      },
    },
    required: ["item"],
    additionalProperties: false,
  },
  required_role: "member",
  // Generation costs AI tokens — keep it off the free-tier read-only
  // allowlist by marking as a write action.
  read_only: false,
  execute: async (input, ctx) => {
    // Manual Pro check — skill helpers gate free tier at the read_only
    // boundary, but we want a friendlier message here.
    const roleErr = checkRole(ctx, "member");
    if (roleErr) return toolError(roleErr);
    if (ctx.tier === "free") {
      return toolError(
        "AI caption generation requires Pro. Refer 3 friends to unlock."
      );
    }
    const { item, language, tone, length, variantCount } = input as {
      item: string;
      language?: string;
      tone?: string;
      length?: string;
      variantCount?: number;
    };
    if (typeof item !== "string" || !item.trim()) {
      return toolError("item id or SKU required");
    }
    const row = await lookupItemByIdOrSku(ctx, item);
    if (!row) return toolError("inventory item not found");
    const industry = await fetchWorkspaceIndustry(ctx.supabase, ctx.workspaceId);
    try {
      const result = await generateInventoryCaption({
        item: row,
        language: typeof language === "string" && language.trim()
          ? language.trim()
          : "English",
        tone: isCaptionTone(tone) ? tone : "casual",
        length: isCaptionLength(length) ? length : "medium",
        variantCount: Math.max(
          1,
          Math.min(5, Math.floor(Number(variantCount ?? 3)) || 3)
        ),
        industry,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
      });
      return toolOk({
        item_id: row.id,
        item_name: row.name,
        sku: row.sku,
        variants: result.variants,
        language: result.language,
        tone: result.tone,
        length: result.length,
        model: result.modelUsed,
      });
    } catch (e) {
      return toolError(
        e instanceof Error ? e.message : "caption_generation_failed"
      );
    }
  },
};

export const inventoryCaptionSkill: SkillDefinition = {
  id: "inventory.captions",
  label: "Inventory Captions",
  description:
    "Generate WhatsApp marketing captions for inventory items, multilingual, in the workspace currency and industry voice.",
  systemFragment:
    "When the user asks for a WhatsApp caption / blast text / sales copy / promo message for an inventory item, call generate_inventory_caption. Accepts item id or SKU. Multilingual: pass through the user's requested language. Pro-tier only.",
  tools: [generate_inventory_caption],
};
