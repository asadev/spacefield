import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/eval
 *   ?suite_id=<id>     filter to a single suite's runs
 *   ?status=running    filter run status
 *
 * Returns either:
 *   - { suites: EvalSuiteRow[] }                when no filters set
 *   - { runs: EvalRunRow[] }                    when suite_id or status set
 *
 * Admin-only. Useful for the eventual external eval runner that polls
 * `?status=running` and picks up scheduled runs.
 */
export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const suiteId = sp.get("suite_id");
  const status = sp.get("status");
  const admin = createAdminClient();

  if (suiteId || status) {
    let runs = admin
      .from("eval_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (suiteId) runs = runs.eq("suite_id", suiteId);
    if (status) runs = runs.eq("status", status);
    const { data, error } = await runs;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ runs: data ?? [] });
  }

  const { data, error } = await admin
    .from("eval_suites")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ suites: data ?? [] });
}
