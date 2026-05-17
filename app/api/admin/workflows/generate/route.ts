import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { withApiHandler } from "@/lib/api-wrap";
import {
  validateWorkflowDefinition,
  type WorkflowDefinition,
} from "@/lib/workflows/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/workflows/generate
 *
 * Takes a natural-language description and returns a WorkflowDefinition
 * JSON for the visual builder to review. Nothing is persisted — the
 * admin clicks Save in the builder once they're happy.
 *
 * Body:
 *   {
 *     prompt: string,
 *     workspace_id: string  // UUID; embedded into the returned shape
 *   }
 *
 * Returns:
 *   { ok: true, definition: WorkflowDefinition }
 *   { ok: false, error: string }
 *
 * Implementation: we ask Haiku to emit JSON matching our shape, with a
 * tight system prompt that lists the allowed step kinds verbatim. We
 * then `JSON.parse` + run our own validator. If the validator rejects,
 * we surface the errors so the admin can rephrase.
 */

const SYSTEM_PROMPT = `You are a workflow JSON generator for a SaaS admin panel.

Given a natural-language description, output a SINGLE JSON object matching this TypeScript type. Do NOT wrap in markdown. Do NOT include explanation. Output JSON ONLY.

interface WorkflowDefinition {
  id: "";                          // always empty string — caller fills in
  workspace_id: string;            // copy verbatim from the user input
  name: string;                    // 3-60 chars, title-cased
  description?: string;            // one short sentence
  trigger: {
    kind: "manual" | "schedule" | "event";
    payload?: unknown;
  };
  conditions?: Array<{
    left: string;                  // JSON path like "task.priority"
    op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
    right: unknown;
  }>;
  steps: Array<
    | { kind: "create_task"; payload: { title: string; description?: string; priority?: "low" | "normal" | "high"; project_name?: string } }
    | { kind: "send_webhook"; url: string; body: string }
    | { kind: "post_comment"; entity: { type: string; id: string }; body: string }
    | { kind: "wait"; seconds: number }
  >;
}

Rules:
- The "id" field MUST be an empty string.
- "workspace_id" MUST be exactly the UUID the user gave you.
- Include 1-6 steps. Prefer the simplest step list that achieves the goal.
- For send_webhook, use placeholder URLs like "https://hooks.example.com/your-endpoint" unless the user gave one.
- For post_comment, set entity.id to "{{trigger.id}}" if you can't infer a concrete id.
- "wait" is for explicit delays the user asked for — don't sprinkle waits between every step.
- Don't invent step kinds.`;

interface GenerateBody {
  prompt: unknown;
  workspace_id: unknown;
}

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const POST = withApiHandler(
  async (req: NextRequest) => {
    let body: GenerateBody;
    try {
      body = (await req.json()) as GenerateBody;
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid JSON body" },
        { status: 400 }
      );
    }

    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() : "";
    const workspaceId =
      typeof body.workspace_id === "string" ? body.workspace_id : "";

    if (!prompt || prompt.length < 3) {
      return NextResponse.json(
        { ok: false, error: "prompt is required (min 3 chars)" },
        { status: 400 }
      );
    }
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      return NextResponse.json(
        { ok: false, error: "workspace_id must be a UUID" },
        { status: 400 }
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const userText = `Workspace UUID: ${workspaceId}\n\nWorkflow description:\n${prompt}`;

    let raw: string;
    try {
      const resp = await anthropic().messages.create({
        // Haiku is fast + cheap; the task is mechanical JSON shaping.
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      });
      const textBlock = resp.content.find((c) => c.type === "text");
      raw = textBlock && "text" in textBlock ? textBlock.text : "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "anthropic call failed";
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    // The model sometimes wraps JSON in code fences despite the system
    // prompt — strip them defensively before parsing.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "model did not return valid JSON",
          raw: cleaned.slice(0, 500),
        },
        { status: 502 }
      );
    }

    // Force-correct the workspace_id even if the model echoed something
    // different — we never want to persist a foreign workspace ref.
    if (parsed && typeof parsed === "object") {
      (parsed as Record<string, unknown>).workspace_id = workspaceId;
      (parsed as Record<string, unknown>).id = "";
    }

    const errors = validateWorkflowDefinition(parsed);
    if (errors.length > 0) {
      return NextResponse.json(
        { ok: false, error: `model output failed validation: ${errors.join("; ")}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      definition: parsed as WorkflowDefinition,
    });
  },
  {
    requireAdmin: true,
    source: "admin.workflows.generate",
    rateLimit: { count: 30, window_sec: 60 },
  }
);
