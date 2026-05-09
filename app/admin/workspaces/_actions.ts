"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "../_audit";
import { assertAdmin } from "../_lib";

/**
 * Server actions backing the /admin/workspaces deep editor.
 *
 * Verb-naming follows <area>.<verb>:
 *   workspace.branding, workspace.pause, workspace.unpause,
 *   workspace.transfer_ownership, workspace.tier_override,
 *   workspace.feature_override_set, workspace.feature_override_clear,
 *   workspace.tool_grant_set, workspace.tool_grant_clear,
 *   workspace.member_role, workspace.member_remove,
 *   workspace.persona, workspace.agent_permission.
 *
 * Every mutation calls assertAdmin() AND recordAdminAction(...). The
 * matching SQL policies enforce the same admin-only check, so even if a
 * route slipped through, RLS would block it.
 */

const PERMISSION_MODES = ["allow", "confirm", "deny"] as const;
type PermissionMode = (typeof PERMISSION_MODES)[number];

const VOICE_TONES = ["friendly", "formal", "casual", "direct", "playful"] as const;
type VoiceTone = (typeof VOICE_TONES)[number];

const ROLES = ["owner", "admin", "member"] as const;
type Role = (typeof ROLES)[number];

function pickPermissionMode(value: unknown): PermissionMode | null {
  const s = String(value ?? "").trim();
  return (PERMISSION_MODES as readonly string[]).includes(s)
    ? (s as PermissionMode)
    : null;
}

function pickVoiceTone(value: unknown): VoiceTone {
  const s = String(value ?? "").trim();
  return (VOICE_TONES as readonly string[]).includes(s)
    ? (s as VoiceTone)
    : "friendly";
}

function pickRole(value: unknown): Role | null {
  const s = String(value ?? "").trim();
  return (ROLES as readonly string[]).includes(s) ? (s as Role) : null;
}

/* ─────────────────────── branding / profile ─────────────────────── */

export async function updateWorkspaceBranding(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  if (!workspaceId) throw new Error("missing workspace_id");

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const avatarRaw = String(formData.get("avatar_url") ?? "").trim();
  const colorRaw = String(formData.get("share_brand_color") ?? "").trim();

  const slug = slugRaw.length ? slugRaw : null;
  const avatar_url = avatarRaw.length ? avatarRaw : null;
  let share_brand_color: string | null = null;
  if (colorRaw.length) {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorRaw)) {
      throw new Error("share_brand_color must be #RRGGBB");
    }
    share_brand_color = colorRaw;
  }

  const admin = createAdminClient();
  const { data: before } = await admin
    .from("workspaces")
    .select("id, name, slug, description, avatar_url, share_brand_color")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!before) throw new Error("workspace not found");

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (name.length) patch.name = name;
  if (slug !== null) patch.slug = slug;
  patch.description = description.length ? description : null;
  patch.avatar_url = avatar_url;
  patch.share_brand_color = share_brand_color;

  const { error } = await admin
    .from("workspaces")
    .update(patch)
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.branding",
    targetType: "workspaces",
    targetId: workspaceId,
    before: {
      name: before.name,
      slug: before.slug,
      description: before.description,
      avatar_url: before.avatar_url,
      share_brand_color: before.share_brand_color,
    },
    after: {
      name: name.length ? name : before.name,
      slug: slug ?? before.slug,
      description: description.length ? description : null,
      avatar_url,
      share_brand_color,
    },
  });

  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── pause / unpause ─────────────────────── */

export async function setWorkspacePaused(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const paused = formData.get("paused") === "true";
  if (!workspaceId) throw new Error("missing workspace_id");

  const admin = createAdminClient();
  // We don't have a "paused" column on public.workspaces and the build
  // policy says no new migrations. Park the flag in workspace_state KV
  // under key 'admin_paused' instead — easy to read from middleware/RLS
  // helpers later if we ever wire enforcement.
  const { error } = await admin
    .from("workspace_state")
    .upsert(
      {
        workspace_id: workspaceId,
        key: "admin_paused",
        value: { paused, set_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,key" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: paused ? "workspace.pause" : "workspace.unpause",
    targetType: "workspaces",
    targetId: workspaceId,
    after: { paused },
  });

  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── members ─────────────────────── */

export async function setMemberRole(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = pickRole(formData.get("role"));
  if (!workspaceId || !userId || !role) {
    throw new Error("missing workspace_id, user_id, or invalid role");
  }
  // Promoting/demoting an owner is its own flow — go through transfer.
  if (role === "owner") {
    throw new Error("use transferWorkspaceOwnership to set role to owner");
  }

  const admin = createAdminClient();
  const { data: existing, error: readErr } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error("member not found");
  if (existing.role === "owner") {
    throw new Error("cannot demote the workspace owner directly");
  }

  const { error } = await admin
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.member_role",
    targetType: "workspace_members",
    targetId: `${workspaceId}:${userId}`,
    before: { role: existing.role },
    after: { role },
    metadata: { workspace_id: workspaceId, user_id: userId },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

export async function removeWorkspaceMember(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!workspaceId || !userId) throw new Error("missing workspace_id/user_id");

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

  await recordAdminAction({
    action: "workspace.member_remove",
    targetType: "workspace_members",
    targetId: `${workspaceId}:${userId}`,
    before: { role: existing.role },
    metadata: { workspace_id: workspaceId, user_id: userId },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

export async function transferWorkspaceOwnership(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const newOwnerId = String(formData.get("new_owner_id") ?? "").trim();
  if (!workspaceId || !newOwnerId) {
    throw new Error("missing workspace_id/new_owner_id");
  }

  const admin = createAdminClient();
  // Confirm current state for audit + sanity. `workspaces.user_id` is
  // the canonical owner — workspace_members carries the role flags.
  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .select("id, user_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (wsErr) throw new Error(wsErr.message);
  if (!ws) throw new Error("workspace not found");

  if (ws.user_id === newOwnerId) {
    throw new Error("user is already the owner");
  }

  // Make sure the target is already a member.
  const { data: targetMember, error: targetErr } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", newOwnerId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!targetMember) {
    throw new Error("target user is not a member of this workspace");
  }

  // Run the swap as a sequence of admin updates so we don't depend on
  // the user-scoped `transfer_workspace_ownership` RPC (which is gated
  // by the caller being the current owner). Done in service-role land
  // because admins can shuffle anyone.
  const previousOwnerId = ws.user_id;
  const ts = new Date().toISOString();

  const upd1 = await admin
    .from("workspaces")
    .update({ user_id: newOwnerId, updated_at: ts })
    .eq("id", workspaceId);
  if (upd1.error) throw new Error(upd1.error.message);

  // Demote the previous owner row to admin (if it exists).
  const prev = await admin
    .from("workspace_members")
    .update({ role: "admin" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", previousOwnerId)
    .eq("role", "owner");
  if (prev.error) throw new Error(prev.error.message);

  // Promote the new owner row to owner.
  const next = await admin
    .from("workspace_members")
    .update({ role: "owner" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", newOwnerId);
  if (next.error) throw new Error(next.error.message);

  await recordAdminAction({
    action: "workspace.transfer_ownership",
    targetType: "workspaces",
    targetId: workspaceId,
    before: { owner_id: previousOwnerId },
    after: { owner_id: newOwnerId },
    metadata: { workspace_id: workspaceId },
  });

  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── tier override ─────────────────────── */

export async function setWorkspaceTierOverride(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const ownerId = String(formData.get("owner_id") ?? "").trim();
  const tierId = String(formData.get("tier_id") ?? "").trim();
  if (!workspaceId || !ownerId || !tierId) {
    throw new Error("missing workspace_id/owner_id/tier_id");
  }

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("subscriptions")
    .select("user_id, tier_id, status")
    .eq("user_id", ownerId)
    .maybeSingle();

  const { error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: ownerId,
        tier_id: tierId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.tier_override",
    targetType: "subscriptions",
    targetId: ownerId,
    before: prior
      ? { tier_id: prior.tier_id, status: prior.status }
      : null,
    after: { tier_id: tierId, status: "active" },
    metadata: { workspace_id: workspaceId, owner_id: ownerId },
  });

  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${workspaceId}`);
  revalidatePath(`/admin/users/${ownerId}`);
}

/* ─────────────────────── feature overrides ─────────────────────── */

export async function addWorkspaceFeatureOverride(
  formData: FormData
): Promise<void> {
  const { userId } = await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const flagKey = String(formData.get("flag_key") ?? "").trim();
  const enabled = formData.get("enabled") === "true";
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw.length ? reasonRaw : null;
  if (!workspaceId || !flagKey) {
    throw new Error("missing workspace_id/flag_key");
  }

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("workspace_feature_overrides")
    .select("workspace_id, flag_key, enabled, reason")
    .eq("workspace_id", workspaceId)
    .eq("flag_key", flagKey)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_feature_overrides")
    .upsert(
      {
        workspace_id: workspaceId,
        flag_key: flagKey,
        enabled,
        reason,
        set_by: userId,
      },
      { onConflict: "workspace_id,flag_key" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.feature_override_set",
    targetType: "workspace_feature_overrides",
    targetId: `${workspaceId}:${flagKey}`,
    before: prior
      ? { enabled: prior.enabled, reason: prior.reason }
      : null,
    after: { enabled, reason },
    metadata: { workspace_id: workspaceId, flag_key: flagKey },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

export async function removeWorkspaceFeatureOverride(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const flagKey = String(formData.get("flag_key") ?? "").trim();
  if (!workspaceId || !flagKey) {
    throw new Error("missing workspace_id/flag_key");
  }

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("workspace_feature_overrides")
    .select("workspace_id, flag_key, enabled, reason")
    .eq("workspace_id", workspaceId)
    .eq("flag_key", flagKey)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_feature_overrides")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("flag_key", flagKey);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.feature_override_clear",
    targetType: "workspace_feature_overrides",
    targetId: `${workspaceId}:${flagKey}`,
    before: prior
      ? { enabled: prior.enabled, reason: prior.reason }
      : null,
    after: null,
    metadata: { workspace_id: workspaceId, flag_key: flagKey },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── workspace tool grants ─────────────────────── */

export async function setWorkspaceToolGrant(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const granted = formData.get("granted") === "true";
  if (!workspaceId || !slug) throw new Error("missing workspace_id/slug");

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("workspace_tool_grants")
    .select("workspace_id, slug, granted")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_tool_grants")
    .upsert(
      {
        workspace_id: workspaceId,
        slug,
        granted,
        granted_by: userId,
      },
      { onConflict: "workspace_id,slug" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.tool_grant_set",
    targetType: "workspace_tool_grants",
    targetId: `${workspaceId}:${slug}`,
    before: prior ? { granted: prior.granted } : null,
    after: { granted },
    metadata: { workspace_id: workspaceId, slug },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

export async function clearWorkspaceToolGrant(formData: FormData): Promise<void> {
  await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!workspaceId || !slug) throw new Error("missing workspace_id/slug");

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("workspace_tool_grants")
    .select("workspace_id, slug, granted")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  const { error } = await admin
    .from("workspace_tool_grants")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.tool_grant_clear",
    targetType: "workspace_tool_grants",
    targetId: `${workspaceId}:${slug}`,
    before: prior ? { granted: prior.granted } : null,
    after: null,
    metadata: { workspace_id: workspaceId, slug },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── persona ─────────────────────── */

export async function updateWorkspacePersona(
  formData: FormData
): Promise<void> {
  const { userId } = await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  if (!workspaceId) throw new Error("missing workspace_id");

  const bot_name =
    String(formData.get("bot_name") ?? "").trim() || "Spacefield Assistant";
  const persona_description = String(formData.get("persona_description") ?? "");
  const voice_tone = pickVoiceTone(formData.get("voice_tone"));
  const custom_greeting = String(formData.get("custom_greeting") ?? "");

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("agent_personas")
    .select("workspace_id, bot_name, persona_description, voice_tone, custom_greeting")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { error } = await admin
    .from("agent_personas")
    .upsert(
      {
        workspace_id: workspaceId,
        bot_name,
        persona_description,
        voice_tone,
        custom_greeting,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.persona",
    targetType: "agent_personas",
    targetId: workspaceId,
    before: prior
      ? {
          bot_name: prior.bot_name,
          persona_description: prior.persona_description,
          voice_tone: prior.voice_tone,
          custom_greeting: prior.custom_greeting,
        }
      : null,
    after: { bot_name, persona_description, voice_tone, custom_greeting },
    metadata: { workspace_id: workspaceId },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}

/* ─────────────────────── agent permissions ─────────────────────── */

export async function setWorkspaceAgentPermission(
  formData: FormData
): Promise<void> {
  const { userId } = await assertAdmin();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  const skillId = String(formData.get("skill_id") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "").trim();
  if (!workspaceId || !skillId) {
    throw new Error("missing workspace_id/skill_id");
  }

  const admin = createAdminClient();
  const { data: prior } = await admin
    .from("agent_permissions")
    .select("workspace_id, skill_id, mode")
    .eq("workspace_id", workspaceId)
    .eq("skill_id", skillId)
    .maybeSingle();

  // mode === '' (default) → clear the row → fall back to runtime defaults.
  if (modeRaw === "" || modeRaw === "default") {
    const { error } = await admin
      .from("agent_permissions")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("skill_id", skillId);
    if (error) throw new Error(error.message);

    await recordAdminAction({
      action: "workspace.agent_permission",
      targetType: "agent_permissions",
      targetId: `${workspaceId}:${skillId}`,
      before: prior ? { mode: prior.mode } : null,
      after: null,
      metadata: { workspace_id: workspaceId, skill_id: skillId },
    });

    revalidatePath(`/admin/workspaces/${workspaceId}`);
    return;
  }

  const mode = pickPermissionMode(modeRaw);
  if (!mode) throw new Error("invalid mode");

  const { error } = await admin
    .from("agent_permissions")
    .upsert(
      {
        workspace_id: workspaceId,
        skill_id: skillId,
        mode,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,skill_id" }
    );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "workspace.agent_permission",
    targetType: "agent_permissions",
    targetId: `${workspaceId}:${skillId}`,
    before: prior ? { mode: prior.mode } : null,
    after: { mode },
    metadata: { workspace_id: workspaceId, skill_id: skillId },
  });

  revalidatePath(`/admin/workspaces/${workspaceId}`);
}
