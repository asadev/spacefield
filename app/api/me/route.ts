import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/me
 *
 * Lightweight "what can this user do" endpoint. Used by:
 *   - CreateWorkspaceDialog → to gate workspace creation on tier cap.
 *   - Files Manager → to know the workspace cap when surfacing ensure
 *     errors ("you're at 1/1, upgrade or delete a workspace").
 *   - Pricing page / settings → to know the active tier base + any
 *     per-workspace storage add-ons currently selected, so the UI can
 *     compute the effective cap inline.
 *
 * Uncached, server-side. Returns 401 if no session.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: tierId } = await supabase.rpc("my_tier");
  const tier = (typeof tierId === "string" && tierId) || "free";

  const { data: tierRow } = await supabase
    .from("subscription_tiers")
    .select(
      "tier_id, name, max_owned_workspaces, max_storage_per_workspace_mb, max_members_per_workspace"
    )
    .eq("tier_id", tier)
    .maybeSingle();

  // Workspaces the caller owns — needed to surface the storage add-on
  // selection per workspace (RLS gives the owner read access via the
  // "owners admins read addon" policy).
  const { data: ownedWorkspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const owned = (ownedWorkspaces ?? []) as Array<{ id: string; name: string }>;
  const ownedIds = owned.map((w) => w.id);

  // Add-ons currently selected for any owned workspace. Absent row =
  // no add-on; the client should treat as 0 GB.
  let addons: Array<{ workspace_id: string; addon_gb: number }> = [];
  if (ownedIds.length > 0) {
    const { data: addonRows } = await supabase
      .from("workspace_storage_addons")
      .select("workspace_id, addon_gb")
      .in("workspace_id", ownedIds);
    addons = (addonRows ?? []) as Array<{
      workspace_id: string;
      addon_gb: number;
    }>;
  }

  const cap = tierRow?.max_owned_workspaces ?? 1;
  const ownedCount = owned.length;

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    tier,
    tier_config: tierRow,
    owned_workspaces: ownedCount,
    max_owned_workspaces: cap,
    can_create_workspace: ownedCount < cap,
    workspaces: owned,
    storage_addons: addons,
  });
}
