import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Per-user favorites — pins on any polymorphic entity. RLS already
 * scopes by user_id so we can lean on the request-scoped client for
 * every operation.
 */

export interface FavoriteRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  entity_type: string;
  entity_id: string;
  label: string | null;
  position: number;
  created_at: string;
}

export async function listForUser(): Promise<FavoriteRow[]> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("favorites")
    .select(
      "id, user_id, workspace_id, entity_type, entity_id, label, position, created_at"
    )
    .eq("user_id", userData.user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as FavoriteRow[];
}

export async function isFavorited(input: {
  entityType: string;
  entityId: string;
}): Promise<boolean> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId)
    .maybeSingle();
  return Boolean(data);
}

export async function addFavorite(input: {
  entityType: string;
  entityId: string;
  workspaceId?: string | null;
  label?: string | null;
}): Promise<{ ok: true; favorite: FavoriteRow } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "unauthorized" };

  // Compute next position so newly-added favorites land at the bottom.
  const { data: top } = await supabase
    .from("favorites")
    .select("position")
    .eq("user_id", userData.user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (top?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("favorites")
    .upsert(
      {
        user_id: userData.user.id,
        workspace_id: input.workspaceId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId,
        label: input.label ?? null,
        position: nextPosition,
      },
      { onConflict: "user_id,entity_type,entity_id", ignoreDuplicates: false }
    )
    .select(
      "id, user_id, workspace_id, entity_type, entity_id, label, position, created_at"
    )
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  return { ok: true, favorite: data as FavoriteRow };
}

export async function removeFavorite(input: {
  entityType: string;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "unauthorized" };
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userData.user.id)
    .eq("entity_type", input.entityType)
    .eq("entity_id", input.entityId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Reorder favorites by setting `position` from an ordered list of ids.
 * No-ops any id that doesn't belong to the caller (RLS will quietly
 * filter them out).
 */
export async function reorderFavorites(
  orderedIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: true };
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "unauthorized" };

  // Issue one update per id. The list is bounded (favorites cap out at
  // a few dozen per user), so the chatter is fine and we avoid an RPC.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    const { error } = await supabase
      .from("favorites")
      .update({ position: i })
      .eq("id", id)
      .eq("user_id", userData.user.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
