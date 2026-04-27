import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_PROVIDER } from "@/lib/billing";

/* GET /api/me
 *
 * Lightweight "what can this user do" endpoint. Used by:
 *   - CreateWorkspaceDialog → to gate workspace creation on tier cap.
 *   - Files Manager → to know the workspace cap when surfacing ensure
 *     errors ("you're at 1/1, upgrade or delete a workspace").
 *   - Pricing page / settings → to know the active tier base + any
 *     per-workspace storage add-ons currently selected, so the UI can
 *     compute the effective cap inline.
 *   - Workspace settings → to surface payment status badges on the
 *     storage add-on dropdown ("Active", "Pending payment", "Past due")
 *     once Paddle billing is wired.
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

  // Pull the calling user's subscription row so the client can display
  // a "Manage subscription" link / billing status. We expose only the
  // fields the UI cares about — never the raw provider customer id
  // (not sensitive but noise).
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select(
      "tier_id, status, paddle_status, current_period_end"
    )
    .eq("user_id", user.id)
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
  // no add-on; the client should treat as 0 GB. payment_status now
  // reflects the Paddle lifecycle: 'mock' (legacy v1), 'pending'
  // (checkout opened), 'active' (webhook confirmed), 'past_due',
  // 'canceled'.
  let addons: Array<{
    workspace_id: string;
    addon_gb: number;
    payment_status: string;
    paddle_status: string | null;
    paddle_subscription_id: string | null;
    current_period_end: string | null;
  }> = [];
  if (ownedIds.length > 0) {
    const { data: addonRows } = await supabase
      .from("workspace_storage_addons")
      .select(
        "workspace_id, addon_gb, payment_status, paddle_status, paddle_subscription_id, current_period_end"
      )
      .in("workspace_id", ownedIds);
    addons = (addonRows ?? []) as typeof addons;
  }

  const cap = tierRow?.max_owned_workspaces ?? 1;
  const ownedCount = owned.length;

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    tier,
    tier_config: tierRow,
    subscription: subRow ?? null,
    owned_workspaces: ownedCount,
    max_owned_workspaces: cap,
    can_create_workspace: ownedCount < cap,
    workspaces: owned,
    storage_addons: addons,
    billing_provider: ACTIVE_PROVIDER,
    paddle_client_token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? null,
    paddle_environment:
      process.env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
  });
}
