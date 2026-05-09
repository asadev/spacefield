"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { ProductTourRow } from "../_types";

/**
 * Server actions for /admin/tours.
 *
 *   createTour, updateTour, deleteTour, setStatus
 *
 * Audit verbs: tour.{create|update|delete|status_change}.
 *
 * Identifiers: product_tours.id is text (caller-supplied, slug-style).
 * Steps live as a JSON array on the row itself — no separate table.
 */

type TourStatus = ProductTourRow["status"];
type TourTriggerKind = ProductTourRow["trigger_kind"];
type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

const STATUSES: ReadonlySet<TourStatus> = new Set([
  "live",
  "draft",
  "archived",
]);

const TRIGGER_KINDS: ReadonlySet<TourTriggerKind> = new Set([
  "manual",
  "first_visit",
  "feature_flag",
  "dom_query",
]);

const PLACEMENTS: ReadonlySet<TourPlacement> = new Set([
  "top",
  "bottom",
  "left",
  "right",
  "center",
]);

// Slug-style id: lowercase alphanum + dot/underscore/hyphen.
const TOUR_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;

/* ──────────────────── helpers ──────────────────── */

interface NormalizedTourStep {
  target_selector: string;
  title: string;
  body: string;
  placement: TourPlacement;
}

function pickStatus(raw: unknown): TourStatus {
  const v = String(raw ?? "draft");
  return STATUSES.has(v as TourStatus) ? (v as TourStatus) : "draft";
}

function pickTriggerKind(raw: unknown): TourTriggerKind {
  const v = String(raw ?? "manual");
  return TRIGGER_KINDS.has(v as TourTriggerKind)
    ? (v as TourTriggerKind)
    : "manual";
}

function pickPlacement(raw: unknown): TourPlacement {
  const v = String(raw ?? "bottom");
  return PLACEMENTS.has(v as TourPlacement)
    ? (v as TourPlacement)
    : "bottom";
}

function normalizeStep(raw: unknown, idx: number): NormalizedTourStep {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`steps[${idx}]: not an object`);
  }
  const s = raw as Record<string, unknown>;
  const target_selector =
    typeof s.target_selector === "string" ? s.target_selector.trim() : "";
  const title = typeof s.title === "string" ? s.title.trim() : "";
  const body = typeof s.body === "string" ? s.body.trim() : "";
  const placement = pickPlacement(s.placement);

  if (!title) throw new Error(`steps[${idx}]: missing title`);
  if (!target_selector) {
    throw new Error(`steps[${idx}]: missing target_selector`);
  }

  return { target_selector, title, body, placement };
}

function parseStepsJson(raw: unknown): NormalizedTourStep[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`steps is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("steps must be a JSON array");
  }
  return parsed.map((s, i) => normalizeStep(s, i));
}

type TourEditPayload = {
  display_name: string;
  description: string;
  trigger_route: string | null;
  trigger_kind: TourTriggerKind;
  steps: NormalizedTourStep[];
  status: TourStatus;
};

function readTourPayload(formData: FormData): TourEditPayload {
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  if (display_name.length > 120) {
    throw new Error("display_name must be ≤ 120 characters");
  }
  const description = String(formData.get("description") ?? "").trim();
  const trigger_route_raw = String(formData.get("trigger_route") ?? "").trim();
  const trigger_route = trigger_route_raw ? trigger_route_raw : null;
  const trigger_kind = pickTriggerKind(formData.get("trigger_kind"));
  const steps = parseStepsJson(formData.get("steps"));
  const status = pickStatus(formData.get("status"));
  return {
    display_name,
    description,
    trigger_route,
    trigger_kind,
    steps,
    status,
  };
}

function diffTour(row: ProductTourRow | null) {
  if (!row) return null;
  const { created_at: _c, updated_at: _u, ...rest } = row;
  void _c;
  void _u;
  return rest;
}

async function readTour(id: string): Promise<ProductTourRow> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_tours")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`product tour "${id}" not found`);
  return data as ProductTourRow;
}

/* ──────────────────── createTour ──────────────────── */

export async function createTour(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) throw new Error("missing id");
  if (id.length > 64) throw new Error("id must be ≤ 64 characters");
  if (!TOUR_ID_RE.test(id)) {
    throw new Error(
      "id must be lowercase letters/digits/dot/underscore/hyphen (start alphanum)"
    );
  }

  const payload = readTourPayload(formData);

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("product_tours")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) throw new Error(`tour id "${id}" already exists`);

  const insertRow = {
    id,
    display_name: payload.display_name,
    description: payload.description,
    trigger_route: payload.trigger_route,
    trigger_kind: payload.trigger_kind,
    steps: payload.steps,
    status: payload.status,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await admin
    .from("product_tours")
    .insert(insertRow)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "tour.create",
    targetType: "product_tour",
    targetId: id,
    after: diffTour(inserted as ProductTourRow | null) ?? insertRow,
  });

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
  redirect(`/admin/tours/${id}`);
}

/* ──────────────────── updateTour ──────────────────── */

export async function updateTour(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readTour(id);
  const payload = readTourPayload(formData);

  const admin = createAdminClient();
  const updates = {
    display_name: payload.display_name,
    description: payload.description,
    trigger_route: payload.trigger_route,
    trigger_kind: payload.trigger_kind,
    steps: payload.steps,
    status: payload.status,
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  const { data: after, error: updErr } = await admin
    .from("product_tours")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "tour.update",
    targetType: "product_tour",
    targetId: id,
    before: diffTour(before),
    after: diffTour(after as ProductTourRow | null) ?? updates,
  });

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
}

/* ──────────────────── deleteTour ──────────────────── */

export async function deleteTour(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");

  const before = await readTour(id);
  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("product_tours")
    .delete()
    .eq("id", id);
  if (delErr) throw new Error(delErr.message);

  await recordAdminAction({
    action: "tour.delete",
    targetType: "product_tour",
    targetId: id,
    before: diffTour(before),
  });

  revalidatePath("/admin/tours");
  redirect("/admin/tours");
}

/* ──────────────────── setStatus ──────────────────── */

export async function setStatus(formData: FormData): Promise<void> {
  const auth = await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const status = pickStatus(formData.get("status"));
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("product_tours")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error(`tour "${id}" not found`);

  const before = (existing as { status: TourStatus }).status;
  if (before === status) return;

  const { error: updErr } = await admin
    .from("product_tours")
    .update({
      status,
      updated_by: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  await recordAdminAction({
    action: "tour.status_change",
    targetType: "product_tour",
    targetId: id,
    before: { status: before },
    after: { status },
  });

  revalidatePath("/admin/tours");
  revalidatePath(`/admin/tours/${id}`);
}
