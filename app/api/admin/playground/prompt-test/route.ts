import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { recordAdminAction } from "@/app/admin/_audit";
import {
  AGENT_MODELS,
  type AgentModelId,
  type PromptLibraryRow,
  type PromptVersionRow,
} from "@/app/admin/_types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST /api/admin/playground/prompt-test
 *
 * Body: {
 *   prompt_id: string,
 *   variables?: Record<string, string>,
 *   run_model?: boolean,        // default false
 *   model?: AgentModelId,       // optional override
 * }
 *
 * Loads the prompt's current_version body, substitutes `{{var}}` tokens
 * with the provided values, optionally hits the model with the resolved
 * prompt as a single user turn. Returns
 * `{ ok, resolved_prompt, missing_vars, response?, model? }`.
 *
 * Audit: `playground.prompt_test`.
 */

type PromptTestBody = {
  prompt_id?: unknown;
  variables?: unknown;
  run_model?: unknown;
  model?: unknown;
};

const VALID_MODELS = new Set(AGENT_MODELS.map((m) => m.id) as string[]);

function detectVariables(body: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return Array.from(out);
}

function substitute(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name];
    }
    return `{{${name}}}`;
  });
}

function readVars(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  let parsed: PromptTestBody;
  try {
    parsed = (await req.json()) as PromptTestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const promptId =
    typeof parsed.prompt_id === "string" ? parsed.prompt_id.trim() : "";
  if (!promptId) {
    return NextResponse.json(
      { ok: false, error: "prompt_id_required" },
      { status: 400 }
    );
  }
  const variables = readVars(parsed.variables);
  const runModel = parsed.run_model === true;
  const modelOverride =
    typeof parsed.model === "string" && VALID_MODELS.has(parsed.model)
      ? (parsed.model as AgentModelId)
      : null;

  const adminDb = createAdminClient();
  const { data: promptData, error: promptErr } = await adminDb
    .from("prompt_library")
    .select("*")
    .eq("id", promptId)
    .maybeSingle();
  if (promptErr) {
    return NextResponse.json(
      { ok: false, error: promptErr.message },
      { status: 500 }
    );
  }
  const prompt = promptData as PromptLibraryRow | null;
  if (!prompt) {
    return NextResponse.json(
      { ok: false, error: "prompt_not_found" },
      { status: 404 }
    );
  }

  const { data: versionData, error: versionErr } = await adminDb
    .from("prompt_versions")
    .select("*")
    .eq("prompt_id", prompt.id)
    .eq("version", prompt.current_version)
    .maybeSingle();
  if (versionErr) {
    return NextResponse.json(
      { ok: false, error: versionErr.message },
      { status: 500 }
    );
  }
  const version = versionData as PromptVersionRow | null;
  if (!version) {
    return NextResponse.json(
      { ok: false, error: "version_not_found" },
      { status: 404 }
    );
  }

  const detected = detectVariables(version.body);
  const missing = detected.filter(
    (v) => !Object.prototype.hasOwnProperty.call(variables, v)
  );
  const resolved = substitute(version.body, variables);

  // Optional model call.
  let response: string | null = null;
  let modelId: string | null = null;
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let modelError: string | null = null;
  const startedAt = Date.now();

  if (runModel) {
    if (!process.env.ANTHROPIC_API_KEY) {
      modelError = "no_api_key";
    } else {
      modelId = modelOverride ?? "claude-sonnet-4-6";
      try {
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        const r = await client.messages.create({
          model: modelId,
          max_tokens: 2048,
          temperature: 0.4,
          messages: [{ role: "user", content: resolved }],
        });
        let text = "";
        for (const block of r.content) {
          if (block.type === "text") text += block.text;
        }
        response = text;
        tokensIn = r.usage?.input_tokens ?? null;
        tokensOut = r.usage?.output_tokens ?? null;
      } catch (e) {
        modelError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const durationMs = Date.now() - startedAt;

  try {
    await recordAdminAction({
      action: "playground.prompt_test",
      targetType: "prompt",
      targetId: prompt.id,
      metadata: {
        version: prompt.current_version,
        ran_model: runModel,
        model: modelId,
        missing_vars: missing.length,
        duration_ms: runModel ? durationMs : null,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: !modelError,
    resolved_prompt: resolved,
    detected_variables: detected,
    missing_vars: missing,
    response,
    model: modelId,
    model_error: modelError,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    duration_ms: runModel ? durationMs : null,
    version: prompt.current_version,
  });
}
