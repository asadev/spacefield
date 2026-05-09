import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { recordAdminAction } from "@/app/admin/_audit";
import type { AiSkillRow, SkillToolDef } from "@/app/admin/_types";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* POST /api/admin/skills/[id]/test-tool
 *
 * Body: { tool_name: string, input: Record<string, unknown> }
 *
 * Looks up the skill, finds the tool by name in tools_json, and:
 *   - handler_kind=rpc  → admin Supabase rpc(handler_target, input)
 *   - handler_kind=http → fetch handler_target with POST + JSON body
 *
 * Returns:
 *   { ok, result?, error?, duration_ms, http_status?, dispatched, ... }
 *
 * Audit: action="tool.test_invoke".
 */

type Body = {
  tool_name?: unknown;
  input?: unknown;
};

function pickTool(skill: AiSkillRow, name: string): SkillToolDef | null {
  const list = Array.isArray(skill.tools_json) ? skill.tools_json : [];
  return list.find((t) => t.name === name) ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const { id: rawId } = await params;
  const skillId = decodeURIComponent(rawId);

  let parsed: Body;
  try {
    parsed = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const toolName =
    typeof parsed.tool_name === "string" ? parsed.tool_name.trim() : "";
  if (!toolName) {
    return NextResponse.json(
      { ok: false, error: "tool_name_required" },
      { status: 400 }
    );
  }

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

  if (skill.kind !== "custom") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "only_custom_skills_dispatchable_here — code skills run inside the agent runtime",
      },
      { status: 400 }
    );
  }

  const tool = pickTool(skill, toolName);
  if (!tool) {
    return NextResponse.json(
      { ok: false, error: `tool_not_found: ${toolName}` },
      { status: 404 }
    );
  }

  const startedAt = Date.now();
  let okFlag = false;
  let resultData: unknown = null;
  let errorMsg: string | null = null;
  let httpStatus: number | null = null;
  let dispatched = false;

  try {
    if (tool.handler_kind === "rpc") {
      const target = tool.handler_target.trim();
      if (!target) {
        errorMsg = "handler_target_required";
      } else {
        const { data, error } = await adminDb.rpc(target, input);
        dispatched = true;
        if (error) {
          errorMsg = error.message;
        } else {
          resultData = data;
          okFlag = true;
        }
      }
    } else if (tool.handler_kind === "http") {
      const target = tool.handler_target.trim();
      if (!/^https?:\/\//i.test(target)) {
        errorMsg = "handler_target_must_be_http_or_https_url";
      } else {
        try {
          const res = await fetch(target, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Spacefield-Test-Tool": "1",
            },
            body: JSON.stringify(input),
          });
          dispatched = true;
          httpStatus = res.status;
          const ct = res.headers.get("content-type") ?? "";
          let body: unknown = null;
          try {
            if (ct.includes("application/json")) {
              body = await res.json();
            } else {
              body = await res.text();
            }
          } catch (parseErr) {
            body = `<unparseable response: ${
              parseErr instanceof Error ? parseErr.message : String(parseErr)
            }>`;
          }
          resultData = body;
          if (res.ok) {
            okFlag = true;
          } else {
            errorMsg = `http_${res.status}`;
          }
        } catch (fetchErr) {
          errorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        }
      }
    } else {
      errorMsg = `unsupported_handler_kind: ${String(tool.handler_kind)}`;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - startedAt;

  try {
    await recordAdminAction({
      action: "tool.test_invoke",
      targetType: "ai_skill",
      targetId: skill.id,
      metadata: {
        tool_name: tool.name,
        handler_kind: tool.handler_kind,
        handler_target: tool.handler_target,
        ok: okFlag,
        dispatched,
        http_status: httpStatus,
        duration_ms: durationMs,
        error: errorMsg,
      },
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: okFlag,
    error: errorMsg,
    result: resultData,
    duration_ms: durationMs,
    http_status: httpStatus,
    dispatched,
    handler_kind: tool.handler_kind,
    handler_target: tool.handler_target,
  });
}
