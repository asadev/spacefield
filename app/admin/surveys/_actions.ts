"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { SurveyRow, SurveyStatus } from "../_types";

/**
 * Server actions for /admin/surveys.
 *
 *   createSurvey  → insert new row
 *   updateSurvey  → patch existing row
 *   setStatus     → flip status to live | draft | archived
 *   deleteSurvey  → remove row
 *
 * Audit verbs: survey.create, survey.update, survey.status, survey.delete.
 */

const ID_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
const TRIGGER_KINDS = [
  "manual",
  "signup",
  "milestone",
  "recurring",
] as const;
type TriggerKind = (typeof TRIGGER_KINDS)[number];
const STATUSES: SurveyStatus[] = ["live", "draft", "archived"];

function pickTriggerKind(value: unknown): TriggerKind {
  const s = String(value ?? "").trim();
  return (TRIGGER_KINDS as ReadonlyArray<string>).includes(s)
    ? (s as TriggerKind)
    : "manual";
}

function pickStatus(value: unknown): SurveyStatus {
  const s = String(value ?? "").trim();
  return (STATUSES as ReadonlyArray<string>).includes(s)
    ? (s as SurveyStatus)
    : "draft";
}

function parseJsonObject(
  raw: unknown,
  fallback: Record<string, unknown> = {}
): Record<string, unknown> {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

function parseJsonArray(raw: unknown, fallback: unknown[] = []): unknown[] {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fall through */
  }
  return fallback;
}

async function fetchSurvey(id: string): Promise<SurveyRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("surveys")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as SurveyRow | null) ?? null;
}

type SurveyPatch = {
  display_name: string;
  description: string;
  questions: unknown[];
  trigger_kind: TriggerKind;
  trigger_config: Record<string, unknown>;
  audience: string;
  audience_config: Record<string, unknown>;
  status: SurveyStatus;
};

function patchFromForm(formData: FormData): SurveyPatch {
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  return {
    display_name,
    description: String(formData.get("description") ?? "").trim(),
    questions: parseJsonArray(formData.get("questions")),
    trigger_kind: pickTriggerKind(formData.get("trigger_kind")),
    trigger_config: parseJsonObject(formData.get("trigger_config")),
    audience: String(formData.get("audience") ?? "all").trim() || "all",
    audience_config: parseJsonObject(formData.get("audience_config")),
    status: pickStatus(formData.get("status")),
  };
}

/* ────────────────────── createSurvey ────────────────────── */

export async function createSurvey(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (!ID_REGEX.test(id)) {
    throw new Error(
      "invalid id — use lowercase letters, digits, dashes, underscores"
    );
  }
  const patch = patchFromForm(formData);

  const admin = createAdminClient();
  const insertRow = { id, ...patch };
  const { error } = await admin.from("surveys").insert(insertRow);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "survey.create",
    targetType: "surveys",
    targetId: id,
    after: insertRow,
  });

  revalidatePath("/admin/surveys");
  redirect(`/admin/surveys/${id}`);
}

/* ────────────────────── updateSurvey ────────────────────── */

export async function updateSurvey(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchSurvey(id);
  if (!before) throw new Error("survey not found");

  const patch = patchFromForm(formData);

  const admin = createAdminClient();
  const { error } = await admin
    .from("surveys")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "survey.update",
    targetType: "surveys",
    targetId: id,
    before: {
      display_name: before.display_name,
      description: before.description,
      questions: before.questions,
      trigger_kind: before.trigger_kind,
      trigger_config: before.trigger_config,
      audience: before.audience,
      audience_config: before.audience_config,
      status: before.status,
    },
    after: patch,
  });

  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${id}`);
}

/* ────────────────────── setStatus ────────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const next = pickStatus(formData.get("status"));
  const before = await fetchSurvey(id);
  if (!before) throw new Error("survey not found");

  const admin = createAdminClient();
  const { error } = await admin
    .from("surveys")
    .update({ status: next })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "survey.status",
    targetType: "surveys",
    targetId: id,
    before: { status: before.status },
    after: { status: next },
  });

  revalidatePath("/admin/surveys");
  revalidatePath(`/admin/surveys/${id}`);
}

/* ────────────────────── deleteSurvey ────────────────────── */

export async function deleteSurvey(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchSurvey(id);

  const admin = createAdminClient();
  const { error } = await admin.from("surveys").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "survey.delete",
    targetType: "surveys",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/surveys");
  redirect("/admin/surveys");
}
