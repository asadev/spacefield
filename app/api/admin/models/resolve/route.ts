import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { CALL_KINDS, type CallKind } from "@/app/admin/_types";
import { getRuntimeModel } from "@/lib/agent/runtime/_models";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/models/resolve?call_kind=executor
 *
 * Returns the model the runtime would dispatch with right now for the
 * given call_kind. Reads through the same `_models.ts` resolver the
 * runtime files use, so the answer matches what production will do.
 *
 * If no `call_kind` is provided, returns all four. Useful for the
 * runtime page to show a quick "what's actually live" debug panel and
 * for the orchestrator agent to verify changes propagated.
 */
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("call_kind")?.trim() ?? "";

  if (kindParam) {
    if (!(CALL_KINDS as readonly string[]).includes(kindParam)) {
      return NextResponse.json(
        { error: `invalid call_kind "${kindParam}"` },
        { status: 400 }
      );
    }
    const info = await getRuntimeModel(kindParam as CallKind);
    return NextResponse.json({ ok: true, call_kind: kindParam, ...info });
  }

  const all: Record<string, unknown> = {};
  for (const k of CALL_KINDS) {
    all[k] = await getRuntimeModel(k);
  }
  return NextResponse.json({ ok: true, assignments: all });
}
