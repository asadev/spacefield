"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceWithRole,
} from "./types";

// ---------- helpers ----------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------- reads ----------

export async function getUserWorkspaces(): Promise<WorkspaceWithRole[]> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return [];

    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, slug, created_by, created_at)")
      .eq("user_id", userData.user.id);

    if (error || !data) return [];

    type Row = {
      role: WorkspaceRole;
      workspace: Workspace | Workspace[] | null;
    };

    const out: WorkspaceWithRole[] = [];
    for (const r of data as Row[]) {
      const w = Array.isArray(r.workspace) ? r.workspace[0] : r.workspace;
      if (!w) continue;
      out.push({ ...w, role: r.role });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  } catch {
    return [];
  }
}

export async function getWorkspaceBySlug(
  slug: string
): Promise<WorkspaceWithRole | null> {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, name, slug, created_by, created_at")
      .eq("slug", slug)
      .maybeSingle();
    if (!ws) return null;

    const { data: mem } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", ws.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!mem) return null;

    return { ...ws, role: mem.role as WorkspaceRole };
  } catch {
    return null;
  }
}

export async function getWorkspaceMembers(
  workspaceId: string
): Promise<WorkspaceMember[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id, user_id, role, joined_at")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true });
    if (error || !data) return [];
    return data as WorkspaceMember[];
  } catch {
    return [];
  }
}

export async function getWorkspaceInvites(
  workspaceId: string
): Promise<WorkspaceInvite[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspace_invites")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data as WorkspaceInvite[];
  } catch {
    return [];
  }
}

export async function loadWorkspaceData<T = unknown>(
  workspaceId: string,
  namespace: string,
  key: string
): Promise<T | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspace_data")
      .select("value")
      .eq("workspace_id", workspaceId)
      .eq("namespace", namespace)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return (data.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function listWorkspaceDataNamespaces(
  workspaceId: string
): Promise<{ namespace: string; key: string; updated_at: string }[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("workspace_data")
      .select("namespace, key, updated_at")
      .eq("workspace_id", workspaceId);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// ---------- writes (server actions) ----------

export async function saveWorkspaceData(
  workspaceId: string,
  namespace: string,
  key: string,
  value: unknown
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "not_authenticated" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("workspace_data").upsert(
      {
        workspace_id: workspaceId,
        namespace,
        key,
        value: value as object,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "workspace_id,namespace,key" }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createWorkspace(
  name: string
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name required" };
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const supabase = await createClient();
  const base = slugify(trimmed) || "workspace";
  let slug = base;
  let attempts = 0;

  while (attempts < 5) {
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempts += 1;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ name: trimmed, slug, created_by: userId })
    .select("id, slug")
    .single();
  if (error || !ws) return { ok: false, error: error?.message ?? "insert_failed" };

  const { error: memErr } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (memErr) return { ok: false, error: memErr.message };

  revalidatePath("/solutions/workspaces");
  return { ok: true, slug: ws.slug };
}

export async function createInvite(
  workspaceId: string,
  email: string,
  role: "admin" | "member" | "viewer"
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@"))
    return { ok: false, error: "Invalid email" };

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email: cleaned,
      role,
      invited_by: userId,
    })
    .select("token")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
  return { ok: true, token: data.token };
}

export async function acceptInvite(
  token: string
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("workspace_invites")
    .select("id, workspace_id, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return { ok: false, error: "not_found" };
  if (invite.accepted_at) return { ok: false, error: "already_accepted" };
  if (new Date(invite.expires_at).getTime() < Date.now())
    return { ok: false, error: "expired" };

  const { error: memErr } = await supabase
    .from("workspace_members")
    .upsert(
      {
        workspace_id: invite.workspace_id,
        user_id: userId,
        role: invite.role,
      },
      { onConflict: "workspace_id,user_id" }
    );
  if (memErr) return { ok: false, error: memErr.message };

  await supabase
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  const { data: ws } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", invite.workspace_id)
    .maybeSingle();

  return { ok: true, slug: ws?.slug };
}

export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const currentUserId = await getCurrentUserId();
  if (!currentUserId) return { ok: false, error: "not_authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
