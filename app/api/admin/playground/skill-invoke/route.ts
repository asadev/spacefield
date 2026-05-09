import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { recordAdminAction } from "@/app/admin/_audit";
import type { AiSkillRow, SkillToolDef } from "@/app/admin/_types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST /api/admin/playground/skill-invoke
 *
 * Body: {
 *   skill_id: string,
 *   tool_name?: string,         // pick a specific tool from tools_json
 *   input: Record<string, unknown>
 * }
 *
 * For `kind=custom` skills with a tool whose `handler_kind=rpc`, we invoke
 * the named Postgres RPC with the input. Otherwise we return a placeholder
 * describing how the runtime *would* dispatch, so the admin can verify
 * shape without firing live writes.
 *
 * Audit: `playground.skill_invoke`.
 */

type SkillInvokeBody = {
  skill_id?: unknown;
  tool_name?: unknown;
  input?: unknown;
};

function pickTool(skill: AiSkillRow, toolName: string | null): SkillToolDef | null {
  const tools = Array.isArray(skill.tools_json) ? skill.tools_json : [];
  if (tools.length === 0) return null;
  if (!toolName) return tools[0];
  return tools.find((t) => t.name === toolName) ?? null;
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

  let parsed: SkillInvokeBody;
  try {
    parsed = (await req.json()) as SkillInvokeBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const skillId =
    typeof parsed.skill_id === "string" ? parsed.skill_id.trim() : "";
  if (!skillId) {
    return NextResponse.json(
      { ok: false, error: "skill_id_required" },
      { status: 400 }
    );
  }

  const requestedTool =
    typeof parsed.tool_name === "string" && parsed.tool_name.trim()
      ? parsed.tool_name.trim()
      : null;

  const input =
    parsed.input && typeof parsed.input === "object" && !Array.isArray(parsed.input)
      ? (parsed.input as Record<string, unknown>)
      : {};

  const adminDb = createAdminClient();
  const { data: skillData, error: skillErr } = await adminDb
    .from("ai_skills")
    .select("*")
    .eq("id", skillId)
    .maybeSingle();
  if (skillErr) {
    return NextResponse.json(
      { ok: false, error: skillErr.message },
      { status: 500 }
    );
  }
  const skill = skillData as AiSkillRow | null;
  if (!skill) {
    return NextResponse.json(
      { ok: false, error: "skill_not_found" },
      { status: 404 }
    );
  }

  const startedAt = Date.now();
  const tool = skill.kind === "custom" ? pickTool(skill, requestedTool) : null;

  let dispatch: Record<string, unknown> = {};
  let result: unknown = null;
  let dispatchError: string | null = null;
  let dispatched = false;

  if (skill.kind === "code") {
    dispatch = {
      kind: "code",
      handler_module: skill.handler_module,
      tool_name: requestedTool,
      note:
        "Code-defined skills run inside the agent runtime (lib/agent/skills/*). The playground does not import handler modules to keep this surface side-effect-free.",
    };
  } else if (!tool) {
    dispatch = {
      kind: "custom",
      note: "No tools defined on this custom skill (or tool_name not found).",
      requested_tool: requestedTool,
    };
  } else if (tool.handler_kind === "rpc") {
    dispatch = {
      kind: "custom",
      handler_kind: "rpc",
      handler_target: tool.handler_target,
      input,
    };
    try {
      const { data, error } = await adminDb.rpc(tool.handler_target, input);
      if (error) {
        dispatchError = error.message;
      } else {
        result = data;
        dispatched = true;
      }
    } catch (e) {
      dispatchError = e instanceof Error ? e.message : String(e);
    }
  } else if (tool.handler_kind === "http") {
    dispatch = {
      kind: "custom",
      handler_kind: "http",
      handler_target: tool.handler_target,
      input,
      note:
        "HTTP handlers are dispatched by the runtime with HMAC signing. The playground does not POST to live URLs from this surface.",
    };
  }

  const durationMs = Date.now() - startedAt;

  try {
    await recordAdminAction({
      action: "playground.skill_invoke",
      targetType: "ai_skill",
      targetId: skill.id,
      metadata: {
        tool_name: tool?.name ?? requestedTool,
        kind: skill.kind,
        dispatched,
        duration_ms: durationMs,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: dispatchError ? false : true,
    error: dispatchError,
    dispatched,
    skill_kind: skill.kind,
    tool: tool
      ? {
          name: tool.name,
          description: tool.description,
          handler_kind: tool.handler_kind,
          handler_target: tool.handler_target,
          read_only: tool.read_only,
          requires_confirmation: tool.requires_confirmation ?? false,
        }
      : null,
    dispatch,
    result,
    duration_ms: durationMs,
  });
}
