"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { assertAdmin } from "./_lib";

/* ──────────────────── users ──────────────────── */

export async function setUserTier(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const tierId = String(formData.get("tier_id") ?? "");
  if (!userId || !tierId) throw new Error("missing user_id or tier_id");

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        tier_id: tierId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/subscriptions");
}

export async function toggleUserAdmin(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const next = formData.get("next") === "true";
  if (!userId) throw new Error("missing user_id");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: next })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function sendPasswordResetLink(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertAdmin();
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return { ok: false, error: "missing email" };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Form-friendly wrapper for the password reset action — returns void so it
 * can be used directly as a <form action={…}>.
 */
export async function sendPasswordResetLinkForm(
  formData: FormData
): Promise<void> {
  await sendPasswordResetLink(formData);
}

/* ──────────────────── messages ──────────────────── */

export async function markMessageResolved(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const resolved = formData.get("resolved") !== "false"; // default true
  if (!id) throw new Error("missing id");

  const admin = createAdminClient();
  const { error } = await admin
    .from("contact_messages")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/messages");
}

/* ──────────────────── workspaces ──────────────────── */

export async function removeWorkspaceMember(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!workspaceId || !userId) throw new Error("missing ids");

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) return;
  if (existing.role === "owner") {
    throw new Error("cannot remove the workspace owner");
  }
  const { error } = await admin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/workspaces/${workspaceId}`);
  revalidatePath("/admin/workspaces");
}

/* ──────────────────── tiers ──────────────────── */

export async function saveTier(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    await assertAdmin();
    const tierId = String(formData.get("tier_id") ?? "");
    if (!tierId) return { ok: false, error: "missing tier_id" };

    const featuresRaw = String(formData.get("features") ?? "{}");
    let features: unknown;
    try {
      features = JSON.parse(featuresRaw);
    } catch {
      return { ok: false, error: "features must be valid JSON" };
    }
    if (
      typeof features !== "object" ||
      features === null ||
      Array.isArray(features)
    ) {
      return { ok: false, error: "features must be a JSON object" };
    }

    const update = {
      name: String(formData.get("name") ?? ""),
      price_cents_monthly: Number(formData.get("price_cents_monthly") ?? 0),
      price_cents_yearly: Number(formData.get("price_cents_yearly") ?? 0),
      max_owned_workspaces: Number(formData.get("max_owned_workspaces") ?? 1),
      max_storage_per_workspace_mb: Number(
        formData.get("max_storage_per_workspace_mb") ?? 100
      ),
      max_members_per_workspace: Number(
        formData.get("max_members_per_workspace") ?? 5
      ),
      is_public: formData.get("is_public") === "on",
      features: features as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    };

    const admin = createAdminClient();
    const { error } = await admin
      .from("subscription_tiers")
      .update(update)
      .eq("tier_id", tierId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/tiers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
