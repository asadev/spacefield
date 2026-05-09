"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type { AnnouncementRow } from "../_types";

/**
 * Server actions for /admin/announcements.
 *
 *   createAnnouncement   → insert row
 *   updateAnnouncement   → patch row
 *   publishAnnouncement  → flip published_at to now() / null
 *   deleteAnnouncement   → remove row
 *
 * All call assertAdmin() AND recordAdminAction(...).
 * Audit verbs: announcement.create, announcement.update,
 * announcement.publish, announcement.unpublish, announcement.delete.
 */

type Category = AnnouncementRow["category"];
type Audience = AnnouncementRow["audience"];

const CATEGORIES: ReadonlyArray<Category> = [
  "product",
  "platform",
  "security",
  "outage",
  "marketing",
];

const AUDIENCES: ReadonlyArray<Audience> = ["all", "admin", "tier", "allowlist"];

function pickCategory(value: unknown): Category {
  const s = String(value ?? "").trim();
  return (CATEGORIES as ReadonlyArray<string>).includes(s)
    ? (s as Category)
    : "product";
}

function pickAudience(value: unknown): Audience {
  const s = String(value ?? "").trim();
  return (AUDIENCES as ReadonlyArray<string>).includes(s)
    ? (s as Audience)
    : "all";
}

function parseLines(value: unknown): string[] {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTimestamp(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchAnnouncement(
  id: string
): Promise<AnnouncementRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AnnouncementRow | null) ?? null;
}

function patchFromForm(formData: FormData): {
  title: string;
  body: string;
  category: Category;
  audience: Audience;
  audience_tiers: string[];
  audience_user_ids: string[];
  pinned: boolean;
  published_at: string | null;
} {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing title");
  const body = String(formData.get("body") ?? "");
  const category = pickCategory(formData.get("category"));
  const audience = pickAudience(formData.get("audience"));
  const audience_tiers = formData
    .getAll("audience_tier")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const audience_user_ids = parseLines(formData.get("audience_user_ids"));
  const pinned =
    formData.get("pinned") === "on" || formData.get("pinned") === "true";
  const published_at = parseTimestamp(formData.get("published_at"));
  return {
    title,
    body,
    category,
    audience,
    audience_tiers,
    audience_user_ids,
    pinned,
    published_at,
  };
}

/* ─────────────────────── create ─────────────────────── */

export async function createAnnouncement(formData: FormData): Promise<void> {
  await assertAdmin();
  const patch = patchFromForm(formData);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .insert(patch)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "announcement.create",
    targetType: "announcements",
    targetId: (data as { id: string }).id,
    after: patch,
  });

  revalidatePath("/admin/announcements");
}

/* ─────────────────────── update ─────────────────────── */

export async function updateAnnouncement(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchAnnouncement(id);
  if (!before) throw new Error("announcement not found");

  const patch = patchFromForm(formData);

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "announcement.update",
    targetType: "announcements",
    targetId: id,
    before: {
      title: before.title,
      body: before.body,
      category: before.category,
      audience: before.audience,
      audience_tiers: before.audience_tiers,
      audience_user_ids: before.audience_user_ids,
      pinned: before.pinned,
      published_at: before.published_at,
    },
    after: patch,
  });

  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
}

/* ─────────────────────── publish toggle ─────────────────────── */

export async function publishAnnouncement(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  // next === "true" means publish; otherwise unpublish (drafts).
  const next = formData.get("next") === "true";
  if (!id) throw new Error("missing id");
  const before = await fetchAnnouncement(id);
  if (!before) throw new Error("announcement not found");

  const published_at = next ? new Date().toISOString() : null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ published_at })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: next ? "announcement.publish" : "announcement.unpublish",
    targetType: "announcements",
    targetId: id,
    before: { published_at: before.published_at },
    after: { published_at },
  });

  revalidatePath("/admin/announcements");
  revalidatePath(`/admin/announcements/${id}`);
}

/* ─────────────────────── delete ─────────────────────── */

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchAnnouncement(id);

  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "announcement.delete",
    targetType: "announcements",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/announcements");
}
