import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side helpers around the workspace-scoped `tags` and polymorphic
 * `entity_tags` tables. Every call uses the request-scoped Supabase
 * client so RLS membership policies still apply — we never bypass them
 * with the service-role client here.
 */

export interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TagWithCount extends TagRow {
  tagged_count: number;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function listTags(workspaceId: string): Promise<TagRow[]> {
  if (!workspaceId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, workspace_id, name, slug, color, created_by, created_at")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data as TagRow[];
}

/**
 * Same as listTags but joins entity_tags to return a `tagged_count` per
 * tag. Used by the /tags admin page so we can show "# tagged entities".
 */
export async function listTagsWithCounts(
  workspaceId: string
): Promise<TagWithCount[]> {
  if (!workspaceId) return [];
  const tags = await listTags(workspaceId);
  if (tags.length === 0) return [];
  const supabase = await createClient();
  const { data: links } = await supabase
    .from("entity_tags")
    .select("tag_id")
    .in(
      "tag_id",
      tags.map((t) => t.id)
    );
  const counts = new Map<string, number>();
  for (const row of (links ?? []) as { tag_id: string }[]) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
  }
  return tags.map((t) => ({ ...t, tagged_count: counts.get(t.id) ?? 0 }));
}

export async function createTag(input: {
  workspaceId: string;
  name: string;
  color?: string | null;
}): Promise<{ ok: true; tag: TagRow } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "name_required" };
  const slug = slugify(name);
  if (!slug) return { ok: false, error: "invalid_name" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "unauthorized" };

  // Idempotent: if a tag with the same (workspace_id, slug) already
  // exists, return it instead of erroring. Cheaper than upsert because
  // we can preserve the original name/color.
  const { data: existing } = await supabase
    .from("tags")
    .select("id, workspace_id, name, slug, color, created_by, created_at")
    .eq("workspace_id", input.workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return { ok: true, tag: existing as TagRow };

  const { data, error } = await supabase
    .from("tags")
    .insert({
      workspace_id: input.workspaceId,
      name,
      slug,
      color: input.color ?? null,
      created_by: userData.user.id,
    })
    .select("id, workspace_id, name, slug, color, created_by, created_at")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  return { ok: true, tag: data as TagRow };
}

export async function updateTag(input: {
  tagId: string;
  name?: string;
  color?: string | null;
}): Promise<{ ok: true; tag: TagRow } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { ok: false, error: "name_required" };
    patch.name = n;
    patch.slug = slugify(n);
  }
  if (input.color !== undefined) patch.color = input.color;
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "nothing_to_update" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .update(patch)
    .eq("id", input.tagId)
    .select("id, workspace_id, name, slug, color, created_by, created_at")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "update_failed" };
  }
  return { ok: true, tag: data as TagRow };
}

export async function deleteTag(
  tagId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function attachTag(input: {
  tagId: string;
  entityType: string;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("entity_tags").upsert(
    {
      tag_id: input.tagId,
      entity_type: input.entityType,
      entity_id: input.entityId,
    },
    { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function detachTag(input: {
  tagId: string;
  entityType: string;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("entity_tags")
    .delete()
    .eq("tag_id", input.tagId)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * List the tag rows attached to a given polymorphic entity. Returned in
 * deterministic order (by tag name) so chip lists stay stable across
 * renders.
 */
export async function listForEntity(input: {
  entityType: string;
  entityId: string;
}): Promise<TagRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entity_tags")
    .select(
      "tag:tags(id, workspace_id, name, slug, color, created_by, created_at)"
    )
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId);
  if (error || !data) return [];
  type Row = { tag: TagRow | TagRow[] | null };
  const out: TagRow[] = [];
  for (const row of data as Row[]) {
    const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
    if (tag) out.push(tag);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
