import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import type { AiAgentRunRow } from "@/app/admin/_types";
import { safeErrorMessage } from "@/lib/safe-error";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agents/[id]/runs?limit=50&since=ISO
 *
 * Returns the most recent ai_agent_runs rows for a given agent. Admin
 * only. Backs the side-panel "Recent runs" widget when it needs to
 * refresh without a full server reload.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "admin.agents.runs.list.auth",
          fallback: "forbidden",
        }),
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(
    500,
    Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 50)
  );
  const since = url.searchParams.get("since");

  const admin = createAdminClient();
  let query = admin
    .from("ai_agent_runs")
    .select(
      "id, agent_id, workspace_id, user_id, channel, status, input_excerpt, output_excerpt, tokens_in, tokens_out, duration_ms, model, error, metadata, created_at"
    )
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    const t = Date.parse(since);
    if (!Number.isNaN(t)) {
      query = query.gte("created_at", new Date(t).toISOString());
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      {
        error: safeErrorMessage(error, {
          source: "admin.agents.runs.list",
          userId: auth.userId,
          fallback: "agent_runs_list_failed",
        }),
      },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as AiAgentRunRow[];
  return NextResponse.json({ ok: true, runs: rows, count: rows.length });
}
