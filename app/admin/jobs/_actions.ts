"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Server actions for `/admin/jobs`. Every mutation calls `assertAdmin()`
 * (also enforced by RLS on `cron_jobs` / `cron_runs`) and writes to
 * `admin_audit_log` so the panel doubles as an audit-of-record for cron
 * activity.
 */

const ID_REGEX = /^[a-z][a-z0-9_-]*$/;
const PATH_REGEX = /^\/api\/cron\/[a-z0-9/_-]+$/i;
// A Vercel cron schedule is a 5-field cron expression. We don't need a
// strict parser — the panel ships exactly what the admin types — but we
// do want to reject obviously bogus values.
const SCHEDULE_REGEX = /^[\d*,\-/\s]{3,}$/;

/* ────────────────── setCronEnabled ────────────────── */

export async function setCronEnabled(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("enabled") ?? "false") === "true";
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("cron_jobs")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("cron_jobs")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: next ? "cron.enable" : "cron.disable",
    targetType: "cron_job",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${encodeURIComponent(id)}`);
}

/* ────────────────── updateCron (description-only edit on detail page) ────────────────── */

export async function updateCron(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const description = String(formData.get("description") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "false") === "true";

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("cron_jobs")
    .select("id, description, enabled")
    .eq("id", id)
    .maybeSingle();

  const update = {
    description,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("cron_jobs").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cron.update",
    targetType: "cron_job",
    targetId: id,
    before,
    after: { id, description, enabled },
  });

  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${encodeURIComponent(id)}`);
}

/* ────────────────── runCronNow ────────────────── */

/**
 * Manual trigger. We:
 *   1. Insert a `cron_runs` row with status='running', triggered_by='manual'.
 *   2. Issue a server-side fetch to the cron path with:
 *        a) `?triggered_by=manual` query string — flag that the call
 *           is an admin trigger (not auth — just metadata).
 *        b) `Authorization: Bearer <CRON_SECRET>` header — the only
 *           place the secret travels. SC-002 removed the prior
 *           `?secret=<CRON_SECRET>` query-string copy, which leaked
 *           into Vercel access logs.
 *   3. Update the `cron_runs` row with success/error + duration.
 *   4. Audit `cron.run_now`.
 *
 * The fetch is bounded with a 60s timeout so a stuck handler doesn't
 * hang the admin click forever.
 */
export async function runCronNow(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("cron_jobs")
    .select("id, path, enabled")
    .eq("id", id)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!job) throw new Error(`cron_jobs row '${id}' not found`);

  const startedAt = new Date().toISOString();
  const { data: runRow, error: insErr } = await admin
    .from("cron_runs")
    .insert({
      job_id: job.id,
      started_at: startedAt,
      status: "running",
      triggered_by: "manual",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  const runId = (runRow as { id: string }).id;

  const start = Date.now();
  let status: "success" | "error" | "timeout" = "success";
  let summary: string | null = null;
  let errorMsg: string | null = null;

  try {
    const url = buildCronUrl(job.path);
    const secret = process.env.CRON_SECRET ?? "";
    const headers: Record<string, string> = {
      "user-agent": "spacefield-admin/run-now",
    };
    if (secret) headers["authorization"] = `Bearer ${secret}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers,
        signal: ctrl.signal,
        // Don't cache the manual trigger.
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      status = "error";
      errorMsg = `HTTP ${res.status}`;
      summary = truncate(text, 500);
    } else {
      summary = truncate(text, 500);
    }
  } catch (e) {
    status = isAbortError(e) ? "timeout" : "error";
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;
  const finishedAt = new Date().toISOString();

  // Update the run row.
  await admin
    .from("cron_runs")
    .update({
      finished_at: finishedAt,
      status,
      summary,
      error: errorMsg,
      metadata: { duration_ms: durationMs },
    })
    .eq("id", runId);

  // Update the job's last-run summary.
  await admin
    .from("cron_jobs")
    .update({
      last_run_at: finishedAt,
      last_run_status: status,
      last_run_duration_ms: durationMs,
      updated_at: finishedAt,
    })
    .eq("id", job.id);

  await recordAdminAction({
    action: "cron.run_now",
    targetType: "cron_job",
    targetId: job.id,
    metadata: {
      run_id: runId,
      status,
      duration_ms: durationMs,
      path: job.path,
      error: errorMsg,
    },
  });

  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${encodeURIComponent(job.id)}`);
}

/* ────────────────── registerCronJob ────────────────── */

export async function registerCronJob(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const cronPath = String(formData.get("path") ?? "").trim();
  const schedule = String(formData.get("schedule") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error(
      "invalid id — use lowercase letters, digits, underscores, hyphens (must start with a letter)"
    );
  }
  if (!cronPath) throw new Error("missing path");
  if (!PATH_REGEX.test(cronPath)) {
    throw new Error("invalid path — must look like /api/cron/<name>");
  }
  if (!schedule) throw new Error("missing schedule");
  if (!SCHEDULE_REGEX.test(schedule)) {
    throw new Error(
      "invalid schedule — must be a cron expression (e.g. '0 9 * * *')"
    );
  }

  const admin = createAdminClient();
  const insertRow = {
    id,
    path: cronPath,
    schedule,
    description,
    enabled: true,
    updated_by: auth.userId,
  };
  const { error } = await admin.from("cron_jobs").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cron.register",
    targetType: "cron_job",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs/${encodeURIComponent(id)}`);
}

/* ────────────────── deleteCron ────────────────── */

export async function deleteCron(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("cron_jobs")
    .select("id, path, schedule, description, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("cron_jobs").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cron.delete",
    targetType: "cron_job",
    targetId: id,
    before,
  });

  revalidatePath("/admin/jobs");
  redirect("/admin/jobs");
}

/* ────────────────── helpers ────────────────── */

function buildCronUrl(cronPath: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) {
    return appendManualParams(`${fromEnv}${cronPath}`);
  }
  const vercelHost = process.env.VERCEL_URL;
  if (vercelHost) {
    return appendManualParams(`https://${vercelHost}${cronPath}`);
  }
  // Local fallback — useful for `npm run dev`.
  return appendManualParams(`http://localhost:3000${cronPath}`);
}

function appendManualParams(url: string): string {
  // SC-002 — Historically we appended `?secret=<CRON_SECRET>` here so
  // routes using `lib/cron/_check_enabled.ts` (which read the query)
  // could authorize. That put the secret into request URLs, which
  // Vercel logs verbatim, third-party analytics scoop up, and CDN
  // caches keep around. The secret now travels ONLY in the
  // `Authorization: Bearer` header that the caller already sets.
  // Cron handlers should read from the header — anything still
  // reading `?secret=` needs to be migrated.
  const u = new URL(url);
  u.searchParams.set("triggered_by", "manual");
  return u.toString();
}

function truncate(value: string, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e !== "object") return false;
  const name = (e as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}
