"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

import { assertAdmin } from "../_lib";

/**
 * Server actions backing the admin tool-gating UI. Three layers:
 *
 *  1. Global kill switch — public.tool_settings.disabled
 *  2. Tier baseline      — public.subscription_tiers.allowed_tool_slugs
 *  3. Per-workspace      — public.workspace_tool_grants
 *
 * Every mutation runs a fresh assertAdmin() — assertAdmin throws if
 * the caller isn't an admin, which Next.js renders as a 500 to the
 * client. The matching SQL policies still enforce the same check, so
 * even if a route slipped through, RLS would block it.
 */

export async function setToolDisabled(formData: FormData): Promise<void> {
  const { userId } = await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const disabled = formData.get("disabled") === "true";
  if (!slug) throw new Error("missing slug");

  const admin = createAdminClient();
  const { error } = await admin
    .from("tool_settings")
    .upsert(
      {
        slug,
        disabled,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    );
  if (error) throw new Error(error.message);

  revalidatePath("/admin/tools");
  revalidatePath(`/admin/tools/${slug}`);
}

export async function setTierAllowedTools(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const slug = String(formData.get("slug") ?? "").trim();
    const tierIdsRaw = String(formData.get("tier_ids") ?? "").trim();
    if (!slug) return { ok: false, error: "missing slug" };

    // tier_ids is a comma-separated list of tier_id values that should
    // include this slug. Tiers in this list get the slug added; tiers
    // not in the list have it removed. enterprise/team tiers can be
    // left empty in the DB and treated as "everything not disabled" via
    // the empty-list compat default — admin can opt them in explicitly
    // if they want to constrain.
    const checkedTierIds = formData
      .getAll("tier_id")
      .map((v) => String(v).trim())
      .filter(Boolean);
    const wantedSet = new Set(
      (checkedTierIds.length > 0 ? checkedTierIds : tierIdsRaw.split(","))
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const admin = createAdminClient();
    const { data: tiers, error: readErr } = await admin
      .from("subscription_tiers")
      .select("tier_id, allowed_tool_slugs");
    if (readErr) return { ok: false, error: readErr.message };

    type Row = { tier_id: string; allowed_tool_slugs: unknown };
    const updates: { tier_id: string; allowed_tool_slugs: string[] }[] = [];
    for (const r of (tiers ?? []) as Row[]) {
      const current = Array.isArray(r.allowed_tool_slugs)
        ? (r.allowed_tool_slugs as unknown[]).filter(
            (s): s is string => typeof s === "string"
          )
        : [];
      const has = current.includes(slug);
      const want = wantedSet.has(r.tier_id);
      if (has === want) continue;
      const next = want
        ? Array.from(new Set([...current, slug]))
        : current.filter((s) => s !== slug);
      updates.push({ tier_id: r.tier_id, allowed_tool_slugs: next });
    }

    for (const u of updates) {
      const { error } = await admin
        .from("subscription_tiers")
        .update({
          allowed_tool_slugs: u.allowed_tool_slugs,
          updated_at: new Date().toISOString(),
        })
        .eq("tier_id", u.tier_id);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/admin/tools");
    revalidatePath(`/admin/tools/${slug}`);
    revalidatePath("/admin/tiers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function upsertWorkspaceGrant(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { userId } = await assertAdmin();
    const slug = String(formData.get("slug") ?? "").trim();
    const workspaceId = String(formData.get("workspace_id") ?? "").trim();
    const granted = formData.get("granted") === "true";
    if (!slug || !workspaceId) {
      return { ok: false, error: "missing slug or workspace_id" };
    }

    const admin = createAdminClient();
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
    if (error) return { ok: false, error: error.message };

    revalidatePath(`/admin/tools/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeWorkspaceGrant(
  formData: FormData
): Promise<void> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const workspaceId = String(formData.get("workspace_id") ?? "").trim();
  if (!slug || !workspaceId) throw new Error("missing slug or workspace_id");

  const admin = createAdminClient();
  const { error } = await admin
    .from("workspace_tool_grants")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/tools/${slug}`);
}

/**
 * Search workspaces by name — feeds the per-workspace override picker
 * on `/admin/tools/[slug]`. Returns up to 10 matches with the owner's
 * profile label so the admin can disambiguate identical workspace
 * names across users.
 */
export async function searchWorkspacesByName(
  query: string
): Promise<{
  ok: boolean;
  results?: { id: string; name: string; ownerLabel: string }[];
  error?: string;
}> {
  try {
    await assertAdmin();
    const q = query.trim();
    if (q.length < 2) return { ok: true, results: [] };

    const admin = createAdminClient();
    const { data: ws, error } = await admin
      .from("workspaces")
      .select("id, name, user_id")
      .ilike("name", `%${q}%`)
      .limit(10);
    if (error) return { ok: false, error: error.message };

    type Row = { id: string; name: string; user_id: string };
    const rows = (ws ?? []) as Row[];
    const ownerIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const profileMap = new Map<
      string,
      { full_name: string | null; username: string | null }
    >();
    if (ownerIds.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, full_name, username")
        .in("user_id", ownerIds);
      type ProfRow = {
        user_id: string;
        full_name: string | null;
        username: string | null;
      };
      for (const p of (profs ?? []) as ProfRow[]) {
        profileMap.set(p.user_id, {
          full_name: p.full_name,
          username: p.username,
        });
      }
    }

    return {
      ok: true,
      results: rows.map((r) => {
        const p = profileMap.get(r.user_id);
        return {
          id: r.id,
          name: r.name,
          ownerLabel: p?.full_name ?? p?.username ?? r.user_id.slice(0, 8),
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
