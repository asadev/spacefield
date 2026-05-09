"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Server actions for the per-user admin deep editor.
 *
 * Every mutation here:
 *   1. Calls assertAdmin() — throws if the caller is not admin.
 *   2. Performs a service-role write.
 *   3. Records an audit row via recordAdminAction(...).
 *
 * Audit verb conventions (per the v2 contract):
 *   user.suspend / user.unsuspend
 *   user.force_signout
 *   user.profile_update
 *   user.app_grant_set / user.app_grant_remove
 *   user.feature_override_set / user.feature_override_remove
 *   user.agent_allowlist_add / user.agent_allowlist_remove
 */

/* ──────────────────── helpers ──────────────────── */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickStringArrayUnique(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/* ──────────────────── profile + auth ──────────────────── */

export async function updateUserProfile(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) throw new Error("missing user_id");

  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  const username = String(formData.get("username") ?? "").trim() || null;
  const designation = String(formData.get("designation") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("profiles")
    .select("full_name, username, designation, bio, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  const after = {
    full_name: fullName,
    username,
    designation,
    bio,
    avatar_url: avatarUrl,
  };

  const { error } = await admin
    .from("profiles")
    .update(after)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user.profile_update",
    targetType: "user",
    targetId: userId,
    before,
    after,
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setUserSuspended(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const suspend = String(formData.get("suspend") ?? "false") === "true";
  if (!userId) throw new Error("missing user_id");

  const admin = createAdminClient();
  // 876600h ≈ 100y. 'none' lifts the ban.
  const banDuration = suspend ? "876600h" : "none";
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banDuration,
  });
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: suspend ? "user.suspend" : "user.unsuspend",
    targetType: "user",
    targetId: userId,
    after: { ban_duration: banDuration },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/**
 * Force every active session to die. Supabase's GoTrue admin API has
 * no `signOut(userId)` call — the SDK signOut takes a JWT. So we use
 * the documented workaround: ban for 1s then unban. The first PUT
 * invalidates all in-flight refresh tokens (server checks
 * banned_until on each refresh), and the second clears the ban.
 */
export async function forceSignOut(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) throw new Error("missing user_id");

  const admin = createAdminClient();
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "1s",
  });
  if (banErr) throw new Error(banErr.message);
  // Best-effort restore. If this fails the user is briefly locked out
  // (≤1s). We still record the audit row.
  await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });

  await recordAdminAction({
    action: "user.force_signout",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath(`/admin/users/${userId}`);
}

/* ──────────────────── app grants ──────────────────── */

export async function addUserAppGrant(formData: FormData): Promise<void> {
  await assertAdmin().then(async (auth) => {
    const userId = String(formData.get("user_id") ?? "");
    const slug = String(formData.get("slug") ?? "").trim();
    const granted = String(formData.get("granted") ?? "true") === "true";
    const reason = String(formData.get("reason") ?? "").trim() || null;
    if (!userId || !slug) throw new Error("missing user_id or slug");

    const admin = createAdminClient();
    const { error } = await admin.from("user_app_grants").upsert(
      {
        user_id: userId,
        slug,
        granted,
        granted_by: auth.userId,
        reason,
      },
      { onConflict: "user_id,slug" }
    );
    if (error) throw new Error(error.message);

    await recordAdminAction({
      action: "user.app_grant_set",
      targetType: "user",
      targetId: userId,
      after: { slug, granted, reason },
    });
    revalidatePath(`/admin/users/${userId}`);
  });
}

export async function removeUserAppGrant(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const slug = String(formData.get("slug") ?? "").trim();
  if (!userId || !slug) throw new Error("missing user_id or slug");

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_app_grants")
    .delete()
    .eq("user_id", userId)
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user.app_grant_remove",
    targetType: "user",
    targetId: userId,
    after: { slug },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/* ──────────────────── feature overrides ──────────────────── */

export async function addUserFeatureOverride(
  formData: FormData
): Promise<void> {
  const auth = await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const flagKey = String(formData.get("flag_key") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "true") === "true";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!userId || !flagKey) throw new Error("missing user_id or flag_key");

  const admin = createAdminClient();
  const { error } = await admin.from("user_feature_overrides").upsert(
    {
      user_id: userId,
      flag_key: flagKey,
      enabled,
      reason,
      set_by: auth.userId,
    },
    { onConflict: "user_id,flag_key" }
  );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user.feature_override_set",
    targetType: "user",
    targetId: userId,
    after: { flag_key: flagKey, enabled, reason },
  });
  revalidatePath(`/admin/users/${userId}`);
}

export async function removeUserFeatureOverride(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const flagKey = String(formData.get("flag_key") ?? "").trim();
  if (!userId || !flagKey) throw new Error("missing user_id or flag_key");

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_feature_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("flag_key", flagKey);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "user.feature_override_remove",
    targetType: "user",
    targetId: userId,
    after: { flag_key: flagKey },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/* ──────────────────── agent allowlist ──────────────────── */

export async function setUserAgentAllowlist(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const present = String(formData.get("present") ?? "false") === "true";
  if (!userId || !agentId) throw new Error("missing user_id or agent_id");
  if (!UUID_RE.test(userId)) throw new Error("invalid user_id");

  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("ai_agents")
    .select("id, allowlist_user_ids, access_mode")
    .eq("id", agentId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error("agent not found");

  const before = Array.isArray(row.allowlist_user_ids)
    ? (row.allowlist_user_ids as unknown[]).map((v) => String(v))
    : [];
  let next = before.filter((v) => v !== userId);
  if (present) next = pickStringArrayUnique([...next, userId]);

  const { error } = await admin
    .from("ai_agents")
    .update({
      allowlist_user_ids: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: present ? "user.agent_allowlist_add" : "user.agent_allowlist_remove",
    targetType: "user",
    targetId: userId,
    before: { agent_id: agentId, allowlist_user_ids: before },
    after: { agent_id: agentId, allowlist_user_ids: next },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath(`/admin/agents/${agentId}`);
}
