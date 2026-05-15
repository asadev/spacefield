import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveOnboardingRun,
  listOnboardingTemplates,
} from "@/lib/people/server";
import {
  startOnboardingRun,
  toggleOnboardingTask,
} from "@/lib/people/actions";

const uuid = z.string().uuid();

const StartRunBody = z
  .object({
    workspace_id: uuid,
    employee_id: uuid,
    template_id: uuid,
  })
  .strict();

const ToggleTaskBody = z
  .object({
    run_id: uuid,
    index: z.number().int().min(0).max(500),
    done: z.boolean(),
  })
  .strict();

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = StartRunBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const res = await startOnboardingRun(parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ToggleTaskBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const res = await toggleOnboardingTask(parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
