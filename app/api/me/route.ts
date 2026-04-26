import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* GET /api/me
 *
 * Lightweight "what can this user do" endpoint. Used by:
 *   - CreateWorkspaceDialog → to gate workspace creation on tier cap.
 *   - Files Manager → to know the workspace cap when surfacing ensure
 *     errors ("you're at 1/1, upgrade or delete a workspace").
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

  const { count: ownedCount } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const cap = tierRow?.max_owned_workspaces ?? 1;
  const owned = ownedCount ?? 0;

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    tier,
    tier_config: tierRow,
    owned_workspaces: owned,
    max_owned_workspaces: cap,
    can_create_workspace: owned < cap,
  });
}
