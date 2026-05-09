"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";
import type {
  HelpArticleRow,
  HelpArticleStatus,
  HelpArticleVisibility,
  HelpCategoryRow,
} from "../_types";

/**
 * Server actions for /admin/help.
 *
 *   createCategory / updateCategory / deleteCategory
 *   createArticle / updateArticle / publishArticle / archiveArticle / deleteArticle
 *
 * Every entry point: assertAdmin + recordAdminAction.
 *
 * Audit verbs:
 *   help_category.create | help_category.update | help_category.delete
 *   help_article.create  | help_article.update  | help_article.publish |
 *   help_article.archive | help_article.delete
 */

const STATUSES: ReadonlyArray<HelpArticleStatus> = [
  "draft",
  "published",
  "archived",
];

const VISIBILITIES: ReadonlyArray<HelpArticleVisibility> = [
  "public",
  "authenticated",
  "admin_only",
];

function pickStatus(v: unknown): HelpArticleStatus {
  const s = String(v ?? "").trim();
  return (STATUSES as ReadonlyArray<string>).includes(s)
    ? (s as HelpArticleStatus)
    : "draft";
}

function pickVisibility(v: unknown): HelpArticleVisibility {
  const s = String(v ?? "").trim();
  return (VISIBILITIES as ReadonlyArray<string>).includes(s)
    ? (s as HelpArticleVisibility)
    : "public";
}

function parseTags(v: unknown): string[] {
  return String(v ?? "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJson(v: unknown): Record<string, unknown> {
  const raw = String(v ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pickInt(v: unknown, fallback = 0): number {
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function fetchCategory(id: string): Promise<HelpCategoryRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("help_categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as HelpCategoryRow | null) ?? null;
}

async function fetchArticle(id: string): Promise<HelpArticleRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("help_articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as HelpArticleRow | null) ?? null;
}

/* ─────────────────────── categories ─────────────────────── */

export async function createCategory(formData: FormData): Promise<void> {
  await assertAdmin();
  const idRaw = String(formData.get("id") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("missing display_name");
  const id = idRaw ? slugify(idRaw) : slugify(display_name);
  if (!id) throw new Error("invalid id");

  const patch = {
    id,
    display_name,
    description: String(formData.get("description") ?? ""),
    icon: String(formData.get("icon") ?? "").trim() || null,
    sort_order: pickInt(formData.get("sort_order")),
    enabled: formData.get("enabled") === "on",
  };

  const admin = createAdminClient();
  const { error } = await admin.from("help_categories").insert(patch);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_category.create",
    targetType: "help_categories",
    targetId: id,
    after: patch,
  });

  revalidatePath("/admin/help/categories");
  revalidatePath("/admin/help");
}

export async function updateCategory(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchCategory(id);
  if (!before) throw new Error("category not found");

  const patch = {
    display_name: String(formData.get("display_name") ?? before.display_name).trim(),
    description: String(formData.get("description") ?? before.description),
    icon: String(formData.get("icon") ?? "").trim() || null,
    sort_order: pickInt(formData.get("sort_order"), before.sort_order),
    enabled: formData.get("enabled") === "on",
  };
  if (!patch.display_name) throw new Error("missing display_name");

  const admin = createAdminClient();
  const { error } = await admin
    .from("help_categories")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_category.update",
    targetType: "help_categories",
    targetId: id,
    before: {
      display_name: before.display_name,
      description: before.description,
      icon: before.icon,
      sort_order: before.sort_order,
      enabled: before.enabled,
    },
    after: patch,
  });

  revalidatePath("/admin/help/categories");
  revalidatePath("/admin/help");
}

export async function deleteCategory(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchCategory(id);

  const admin = createAdminClient();
  const { error } = await admin.from("help_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_category.delete",
    targetType: "help_categories",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/help/categories");
  revalidatePath("/admin/help");
}

/* ─────────────────────── articles ─────────────────────── */

type ArticlePatch = {
  category_id: string | null;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  status: HelpArticleStatus;
  visibility: HelpArticleVisibility;
  tags: string[];
  sort_order: number;
  metadata: Record<string, unknown>;
  published_at: string | null;
};

function buildArticlePatch(
  formData: FormData,
  prev?: HelpArticleRow | null
): ArticlePatch {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("missing title");

  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugRaw || title);
  if (!slug) throw new Error("invalid slug");

  const status = pickStatus(formData.get("status"));
  const wasPublished = prev?.status === "published";
  // published_at: respect explicit form value if provided, else compute
  // from status transition.
  let published_at: string | null = prev?.published_at ?? null;
  if (status === "published" && !wasPublished) {
    published_at = new Date().toISOString();
  } else if (status !== "published" && status !== "archived") {
    published_at = null;
  }

  const cat = String(formData.get("category_id") ?? "").trim();

  return {
    category_id: cat || null,
    title,
    slug,
    body: String(formData.get("body") ?? ""),
    excerpt: String(formData.get("excerpt") ?? "").trim() || null,
    status,
    visibility: pickVisibility(formData.get("visibility")),
    tags: parseTags(formData.get("tags")),
    sort_order: pickInt(formData.get("sort_order"), prev?.sort_order ?? 0),
    metadata: parseJson(formData.get("metadata")),
    published_at,
  };
}

export async function createArticle(formData: FormData): Promise<void> {
  await assertAdmin();
  const patch = buildArticlePatch(formData);
  const id = patch.slug; // text PK = slug works for KB lookups.

  const admin = createAdminClient();
  const { error } = await admin
    .from("help_articles")
    .insert({ ...patch, id });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_article.create",
    targetType: "help_articles",
    targetId: id,
    after: patch,
  });

  revalidatePath("/admin/help");
  revalidatePath("/help");
  redirect(`/admin/help/${encodeURIComponent(id)}`);
}

export async function updateArticle(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchArticle(id);
  if (!before) throw new Error("article not found");

  const patch = buildArticlePatch(formData, before);

  const admin = createAdminClient();
  const { error } = await admin
    .from("help_articles")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_article.update",
    targetType: "help_articles",
    targetId: id,
    before: {
      title: before.title,
      slug: before.slug,
      body: before.body,
      excerpt: before.excerpt,
      status: before.status,
      visibility: before.visibility,
      tags: before.tags,
      category_id: before.category_id,
      sort_order: before.sort_order,
      metadata: before.metadata,
      published_at: before.published_at,
    },
    after: patch,
  });

  revalidatePath("/admin/help");
  revalidatePath(`/admin/help/${id}`);
  revalidatePath("/help");
  revalidatePath(`/help/${patch.slug}`);
}

export async function publishArticle(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchArticle(id);
  if (!before) throw new Error("article not found");

  const next = {
    status: "published" as HelpArticleStatus,
    published_at: before.published_at ?? new Date().toISOString(),
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("help_articles")
    .update(next)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_article.publish",
    targetType: "help_articles",
    targetId: id,
    before: { status: before.status, published_at: before.published_at },
    after: next,
  });

  revalidatePath("/admin/help");
  revalidatePath(`/admin/help/${id}`);
  revalidatePath("/help");
  revalidatePath(`/help/${before.slug}`);
}

export async function archiveArticle(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchArticle(id);
  if (!before) throw new Error("article not found");

  const next = { status: "archived" as HelpArticleStatus };

  const admin = createAdminClient();
  const { error } = await admin
    .from("help_articles")
    .update(next)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_article.archive",
    targetType: "help_articles",
    targetId: id,
    before: { status: before.status },
    after: next,
  });

  revalidatePath("/admin/help");
  revalidatePath(`/admin/help/${id}`);
  revalidatePath("/help");
  revalidatePath(`/help/${before.slug}`);
}

export async function deleteArticle(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("missing id");
  const before = await fetchArticle(id);

  const admin = createAdminClient();
  const { error } = await admin.from("help_articles").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "help_article.delete",
    targetType: "help_articles",
    targetId: id,
    before: before ?? null,
    after: null,
  });

  revalidatePath("/admin/help");
  revalidatePath("/help");
  redirect("/admin/help");
}
