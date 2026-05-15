import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveOnboardingRun,
  listOnboardingTemplates,
} from "@/lib/people/server";
import {
  startOnboardingRun,
  toggleOnboardingTask,
} from "@/lib/people/actions";

/**
 * GET /api/people/onboarding
 *   ?workspace_id=…  → list templates for a workspace
 *   ?employee_id=…   → current active run for that employee
 *
 * POST /api/people/onboarding   → start a run
 *   body: { workspace_id, employee_id, template_id }
 *
 * PATCH /api/people/onboarding  → toggle a task
 *   body: { run_id, index, done }
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspace_id = url.searchParams.get("workspace_id");
  const employee_id = url.searchParams.get("employee_id");
  if (workspace_id) {
    const rows = await listOnboardingTemplates(workspace_id);
    return NextResponse.json({ templates: rows });
  }
  if (employee_id) {
    const run = await getActiveOnboardingRun(employee_id);
    return NextResponse.json({ run });
  }
  return NextResponse.json(
    { error: "workspace_id or employee_id required" },
    { status: 400 }
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { workspace_id, employee_id, template_id } = body as Record<string, string>;
  if (!workspace_id || !employee_id || !template_id) {
    return NextResponse.json(
      { error: "workspace_id, employee_id, template_id required" },
      { status: 400 }
    );
  }
  const res = await startOnboardingRun({ workspace_id, employee_id, template_id });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const { run_id, index, done } = body as {
    run_id?: string;
    index?: number;
    done?: boolean;
  };
  if (!run_id || typeof index !== "number" || typeof done !== "boolean") {
    return NextResponse.json(
      { error: "run_id, index (number), done (boolean) required" },
      { status: 400 }
    );
  }
  const res = await toggleOnboardingTask({ run_id, index, done });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
