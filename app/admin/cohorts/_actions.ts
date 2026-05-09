"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { CohortRow } from "../_types";

/**
 * Server actions for `/admin/cohorts`. Every action calls
 * `assertAdmin()` AND `recordAdminAction(...)`.
 *
 * `"use server"` modules can only export async functions — keep types
 * and constants in `_types.ts` or in a sibling `_helpers.ts`.
 *
 * Audit-action naming follows <area>.<verb>:
 *   cohort.create, cohort.update, cohort.toggle,
 *   cohort.recompute, cohort.delete.
 */

const ID_REGEX = /^[a-z][a-z0-9_-]{1,62}$/;
const RECOMPUTE_BATCH = 500;
const RECOMPUTE_MAX_USERS = 50000;

function parseDefinition(raw: unknown): Record<string, unknown> {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("definition must be valid JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("definition must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function fetchCohort(id: string): Promise<CohortRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cohorts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as CohortRow | null) ?? null;
}

/* ─────────────────────── createCohort ─────────────────────── */

export async function createCohort(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error(
      "invalid id — lowercase letters, digits, hyphen, underscore, 2–63 chars"
    );
  }
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  const description = String(formData.get("description") ?? "").trim();
  const definition = parseDefinition(formData.get("definition"));
  const enabled = formData.get("enabled") === "on";

  const insertRow = {
    id,
    display_name,
    description,
    definition,
    user_count: 0,
    last_computed_at: null,
    enabled,
    updated_by: auth.userId,
  };

  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cohort.create",
    targetType: "cohorts",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/cohorts");
  redirect(`/admin/cohorts/${encodeURIComponent(id)}`);
}

/* ─────────────────────── updateCohort ─────────────────────── */

export async function updateCohort(formData: FormData): Promise<void> {
  const auth = await assertAdmin();

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const before = await fetchCohort(id);
  if (!before) throw new Error("cohort not found");

  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  const description = String(formData.get("description") ?? "").trim();
  const definition = parseDefinition(formData.get("definition"));
  const enabled = formData.get("enabled") === "on";

  const update = {
    display_name,
    description,
    definition,
    enabled,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("cohorts")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cohort.update",
    targetType: "cohorts",
    targetId: id,
    before: {
      display_name: before.display_name,
      description: before.description,
      definition: before.definition,
      enabled: before.enabled,
    },
    after: update,
  });

  revalidatePath("/admin/cohorts");
  revalidatePath(`/admin/cohorts/${encodeURIComponent(id)}`);
}

/* ─────────────────────── toggleCohort ─────────────────────── */

export async function toggleCohort(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const next = formData.get("next") === "true";
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("cohorts")
    .select("id, enabled")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("cohorts")
    .update({
      enabled: next,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cohort.toggle",
    targetType: "cohorts",
    targetId: id,
    before,
    after: { id, enabled: next },
  });

  revalidatePath("/admin/cohorts");
  revalidatePath(`/admin/cohorts/${encodeURIComponent(id)}`);
}

/* ─────────────────────── deleteCohort ─────────────────────── */

export async function deleteCohort(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  const before = await fetchCohort(id);

  const admin = createAdminClient();
  const { error } = await admin.from("cohorts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "cohort.delete",
    targetType: "cohorts",
    targetId: id,
    before,
  });

  revalidatePath("/admin/cohorts");
  redirect("/admin/cohorts");
}

/* ─────────────────────── recomputeCohort ─────────────────────── */

/**
 * Re-evaluate a cohort's `definition` against the current users and
 * rewrite `cohort_users`. Supported keys (TODO list documents the rest):
 *
 *  - `tier`            string  — match `subscriptions.tier_id`
 *  - `signed_up_after` ISO     — `auth.users.created_at >= ts`
 *  - `signed_up_before` ISO    — `auth.users.created_at <  ts`
 *
 * TODO (intentional, documented): `has_used_app`, `min_workspaces`,
 * `country`, `last_seen_within`, `tag` etc. The stub interprets only the
 * supported keys; unknown keys are ignored (so the JSON is forward-
 * compatible). The recompute writes membership and updates
 * `user_count` + `last_computed_at`.
 */
export async function recomputeCohort(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");

  const cohort = await fetchCohort(id);
  if (!cohort) throw new Error("cohort not found");

  const definition = cohort.definition as Record<string, unknown>;
  const tierFilter = pickStr(definition.tier);
  const signedUpAfter = pickDate(definition.signed_up_after);
  const signedUpBefore = pickDate(definition.signed_up_before);

  const admin = createAdminClient();

  // Step 1 — find candidate user IDs from auth.users.
  // The auth admin API doesn't filter by created_at; we paginate up to
  // RECOMPUTE_MAX_USERS and filter locally. This is the same trade-off
  // listAuthUsers makes elsewhere in the admin codebase.
  const PAGE_SIZE = 200;
  const PAGES = Math.ceil(RECOMPUTE_MAX_USERS / PAGE_SIZE);
  const allCandidates: string[] = [];
  let scanned = 0;

  for (let i = 0; i < PAGES; i += 1) {
    const res = await admin.auth.admin
      .listUsers({ page: i + 1, perPage: PAGE_SIZE })
      .catch(() => null);
    if (!res || res.error || !res.data?.users) break;
    if (res.data.users.length === 0) break;
    for (const u of res.data.users) {
      scanned += 1;
      const created = u.created_at ? new Date(u.created_at).getTime() : null;
      if (signedUpAfter !== null) {
        if (created === null || created < signedUpAfter) continue;
      }
      if (signedUpBefore !== null) {
        if (created === null || created >= signedUpBefore) continue;
      }
      allCandidates.push(u.id);
    }
    if (res.data.users.length < PAGE_SIZE) break;
  }

  // Step 2 — apply tier filter against subscriptions.
  let memberIds: string[] = allCandidates;
  if (tierFilter) {
    memberIds = [];
    for (let i = 0; i < allCandidates.length; i += RECOMPUTE_BATCH) {
      const chunk = allCandidates.slice(i, i + RECOMPUTE_BATCH);
      const { data, error } = await admin
        .from("subscriptions")
        .select("user_id, tier_id")
        .in("user_id", chunk)
        .eq("tier_id", tierFilter);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ user_id: string }>) {
        memberIds.push(r.user_id);
      }
    }
  }

  // Step 3 — replace membership.
  await admin.from("cohort_users").delete().eq("cohort_id", id);
  if (memberIds.length > 0) {
    const rows = memberIds.map((uid) => ({ cohort_id: id, user_id: uid }));
    for (let i = 0; i < rows.length; i += RECOMPUTE_BATCH) {
      const chunk = rows.slice(i, i + RECOMPUTE_BATCH);
      const { error } = await admin.from("cohort_users").insert(chunk);
      if (error) throw new Error(error.message);
    }
  }

  // Step 4 — update aggregate fields.
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("cohorts")
    .update({
      user_count: memberIds.length,
      last_computed_at: now,
      updated_by: auth.userId,
      updated_at: now,
    })
    .eq("id", id);
  if (upErr) throw new Error(upErr.message);

  await recordAdminAction({
    action: "cohort.recompute",
    targetType: "cohorts",
    targetId: id,
    before: { user_count: cohort.user_count },
    after: { user_count: memberIds.length, last_computed_at: now },
    metadata: { scanned, tier: tierFilter ?? null },
  });

  revalidatePath("/admin/cohorts");
  revalidatePath(`/admin/cohorts/${encodeURIComponent(id)}`);
}

function pickStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length ? s : null;
}

function pickDate(value: unknown): number | null {
  const s = pickStr(value);
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}
