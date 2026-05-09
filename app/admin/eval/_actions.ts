"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

import type { EvalScoringMethod, EvalTargetKind } from "../_types";

/**
 * Server actions for `/admin/eval`. Every action calls `assertAdmin()`
 * AND `recordAdminAction(...)`.
 *
 * NOTE on `runSuite`: the actual eval runner is environmental — wiring
 * agents/skills/workflows up to a real test harness lives outside this
 * slice. Until that lands, `runSuite` synthesizes results in-memory using
 * the stubbed scorer in `_helpers.ts`. The DB row is real; the
 * "completed" result is stubbed.
 */

const ID_REGEX = /^[a-z][a-z0-9_-]*$/;

const TARGET_KINDS: EvalTargetKind[] = ["agent", "skill", "workflow"];
const SCORING_METHODS: EvalScoringMethod[] = [
  "exact",
  "contains",
  "regex",
  "llm_judge",
  "custom",
];

function parseTargetKind(raw: unknown): EvalTargetKind {
  const s = String(raw ?? "").trim();
  return (TARGET_KINDS as string[]).includes(s)
    ? (s as EvalTargetKind)
    : "agent";
}

function parseScoring(raw: unknown): EvalScoringMethod {
  const s = String(raw ?? "").trim();
  return (SCORING_METHODS as string[]).includes(s)
    ? (s as EvalScoringMethod)
    : "exact";
}

function parseCases(raw: unknown): unknown[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("cases JSON is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("cases JSON must be an array of {name, input, expected}");
  }
  for (const c of parsed) {
    if (!c || typeof c !== "object" || !("name" in c)) {
      throw new Error("each case must be {name, input, expected}");
    }
  }
  return parsed;
}

/* ────────────────────── createSuite ────────────────────── */

export async function createSuite(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error("id must be lowercase letters, digits, hyphens, underscores");
  }
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name required");

  const description = String(formData.get("description") ?? "").trim();
  const target_kind = parseTargetKind(formData.get("target_kind"));
  const target_id = String(formData.get("target_id") ?? "").trim() || null;
  const scoring_method = parseScoring(formData.get("scoring_method"));
  const enabled = formData.get("enabled") === "on";
  const cases = parseCases(formData.get("cases"));

  const admin = createAdminClient();
  const insertRow = {
    id,
    display_name,
    description,
    target_kind,
    target_id,
    scoring_method,
    enabled,
    cases,
    updated_by: auth.userId,
  };

  const { error } = await admin.from("eval_suites").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "eval.create",
    targetType: "eval_suite",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/eval");
  redirect(`/admin/eval/${encodeURIComponent(id)}`);
}

/* ────────────────────── updateSuite ────────────────────── */

export async function updateSuite(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("display_name required");
  const description = String(formData.get("description") ?? "").trim();
  const target_kind = parseTargetKind(formData.get("target_kind"));
  const target_id = String(formData.get("target_id") ?? "").trim() || null;
  const scoring_method = parseScoring(formData.get("scoring_method"));
  const enabled = formData.get("enabled") === "on";
  const cases = parseCases(formData.get("cases"));

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("eval_suites")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const update = {
    display_name,
    description,
    target_kind,
    target_id,
    scoring_method,
    enabled,
    cases,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("eval_suites")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "eval.update",
    targetType: "eval_suite",
    targetId: id,
    before,
    after: { id, ...update },
  });

  revalidatePath("/admin/eval");
  revalidatePath(`/admin/eval/${encodeURIComponent(id)}`);
}

/* ────────────────────── toggleSuite ────────────────────── */

export async function toggleSuite(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const next = String(formData.get("enabled") ?? "false") === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("eval_suites")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("eval_suites")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "eval.toggle",
    targetType: "eval_suite",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/eval");
  revalidatePath(`/admin/eval/${encodeURIComponent(id)}`);
}

/* ────────────────────── deleteSuite ────────────────────── */

export async function deleteSuite(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("eval_suites")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("eval_suites").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "eval.delete",
    targetType: "eval_suite",
    targetId: id,
    before,
  });

  revalidatePath("/admin/eval");
  redirect("/admin/eval");
}

/* ────────────────────── runSuite (stub) ────────────────────── */

/**
 * Triggers a "run" of a suite. STUB: the actual eval runner is wired
 * elsewhere; we synthesize per-case results here so the UI flows end-to-
 * end. The DB row is real and audited.
 */
export async function runSuite(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: suite, error: suiteErr } = await admin
    .from("eval_suites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (suiteErr || !suite) throw new Error(suiteErr?.message ?? "suite not found");

  // Stub the runner inline. Imports `stubCaseRun` from helpers (sync).
  const { stubCaseRun, readCases } = await import("./_helpers");

  const cases = readCases(suite.cases);
  const startedAt = Date.now();
  const results = cases.map((c) =>
    stubCaseRun(c, suite.scoring_method as EvalScoringMethod)
  );
  const durationMs = Date.now() - startedAt;

  const passed = results.filter((r) => r.pass && !r.error).length;
  const errored = results.filter((r) => r.error).length;
  const failed = results.length - passed - errored;

  const insertRow = {
    suite_id: id,
    triggered_by: auth.userId,
    total_cases: results.length,
    passed_cases: passed,
    failed_cases: failed,
    errored_cases: errored,
    duration_ms: durationMs,
    status: "completed" as const,
    results,
    metadata: { stub: true },
    finished_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("eval_runs")
    .insert(insertRow)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "run insert failed");

  await recordAdminAction({
    action: "eval.run",
    targetType: "eval_suite",
    targetId: id,
    after: {
      run_id: (data as { id: string }).id,
      total: results.length,
      passed,
      failed,
      errored,
      duration_ms: durationMs,
      stub: true,
    },
  });

  revalidatePath("/admin/eval");
  revalidatePath(`/admin/eval/${encodeURIComponent(id)}`);
  redirect(`/admin/eval/runs/${(data as { id: string }).id}`);
}

/* ────────────────────── cancelRun ────────────────────── */

export async function cancelRun(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("eval_runs")
    .select("id, suite_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!before || (before as { status?: string }).status !== "running") {
    // If it's not running, treat as a no-op (idempotent).
    return;
  }

  const { error } = await admin
    .from("eval_runs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "eval.cancel",
    targetType: "eval_run",
    targetId: id,
    before,
    after: { id, status: "cancelled" },
  });

  const suiteId = (before as { suite_id?: string | null }).suite_id;
  if (suiteId) {
    revalidatePath(`/admin/eval/${encodeURIComponent(suiteId)}`);
  }
  revalidatePath(`/admin/eval/runs/${id}`);
}
