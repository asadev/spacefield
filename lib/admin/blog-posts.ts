import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminBlogPost = {
  id: string;
  slug: string;
  title: string;
  region: string;
  excerpt: string;
  body: string;
  author: string;
  hero_image_url: string | null;
  tags: string[];
  status: "draft" | "published";
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, slug, title, region, excerpt, body, author, hero_image_url, tags, status, published_at, created_by, created_at, updated_at";

export async function listBlogPosts(
  filter: { status?: "draft" | "published" | "all" } = {}
): Promise<{ rows: AdminBlogPost[]; error: string | null }> {
  try {
    const sb = createAdminClient();
    let q = sb
      .from("admin_blog_posts")
      .select(COLS)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (filter.status && filter.status !== "all") {
      q = q.eq("status", filter.status);
    }
    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as AdminBlogPost[], error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getBlogPost(
  id: string
): Promise<{ row: AdminBlogPost | null; error: string | null }> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("admin_blog_posts")
      .select(COLS)
      .eq("id", id)
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    return { row: (data as AdminBlogPost | null) ?? null, error: null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getPublishedBySlug(
  slug: string
): Promise<AdminBlogPost | null> {
  try {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("admin_blog_posts")
      .select(COLS)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (error || !data) return null;
    return data as AdminBlogPost;
  } catch {
    return null;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
