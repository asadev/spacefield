import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPolarCheckout } from "@/lib/polar";
import {
  POLAR_TIER_PRODUCTS,
  POLAR_ADDON_PRODUCTS,
} from "@/app/_data/polar-products";
import { isValidAddonGb } from "@/app/_data/storage-addons";

/* /api/billing/checkout
 *
 * POST { kind: 'tier' | 'addon', tier?: 'pro'|'team',
 *        addon_gb?: 500|2048|10240, workspaceId: string }
 *
 *   Spins up a Polar checkout session for either a tier upgrade or a
 *   per-workspace storage add-on. Returns the hosted checkout URL —
 *   the client redirects the browser there.
 *
 *   Metadata we attach to the Polar checkout is the contract with
 *   the webhook handler:
 *     - user_id      → which Supabase user this maps to
 *     - workspace_id → which workspace the add-on (if any) attaches to
 *     - kind         → 'tier' | 'addon'
 *     - tier         → 'pro' | 'team' (only for kind=tier)
 *     - addon_gb     → 500/2048/10240 (only for kind=addon)
 *
 * For add-on checkouts we also pre-create a `workspace_storage_addons`
 * row with payment_status='pending'. The cap RPC ignores pending rows
 * so the user doesn't get the bigger cap until the webhook flips it
 * to 'active'. This avoids the "abandoned checkout still gives free
 * storage" hole.
 */

interface CheckoutBody {
  kind?: "tier" | "addon";
  tier?: "pro" | "team";
  addon_gb?: number;
  workspaceId?: string;
}

function originFromRequest(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Fallback to the request origin (works in preview deploys).
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { kind, tier, addon_gb, workspaceId } = body;
  if (!kind || (kind !== "tier" && kind !== "addon")) {
    return NextResponse.json({ error: "kind must be 'tier' or 'addon'" }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // Verify the user owns this workspace — we don't want a member
  // upgrading a workspace they don't own.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, user_id, name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws || ws.user_id !== user.id) {
    return NextResponse.json(
      { error: "workspace not found or not owned by caller" },
      { status: 403 }
    );
  }

  let productId: string;
  const metadata: Record<string, string | number> = {
    user_id: user.id,
    workspace_id: workspaceId,
    kind,
  };

  if (kind === "tier") {
    if (!tier || (tier !== "pro" && tier !== "team")) {
      return NextResponse.json(
        { error: "tier must be 'pro' or 'team'" },
        { status: 400 }
      );
    }
    productId = POLAR_TIER_PRODUCTS[tier].product_id;
    metadata.tier = tier;
  } else {
    const gb = Number(addon_gb);
    if (!isValidAddonGb(gb) || gb === 0) {
      return NextResponse.json(
        { error: "addon_gb must be 500, 2048, or 10240" },
        { status: 400 }
      );
    }
    const addon = POLAR_ADDON_PRODUCTS[gb as 500 | 2048 | 10240];
    productId = addon.product_id;
    metadata.addon_gb = gb;

    // Pre-stage a pending row. Webhook will flip to 'active' on
    // subscription.created. Done via user-scoped client so RLS
    // ("owners write addon") still gates this.
    const { error: stageErr } = await supabase
      .from("workspace_storage_addons")
      .upsert(
        {
          workspace_id: workspaceId,
          addon_gb: gb,
          selected_by: user.id,
          selected_at: new Date().toISOString(),
          payment_status: "pending",
        },
        { onConflict: "workspace_id" }
      );
    if (stageErr) {
      return NextResponse.json({ error: stageErr.message }, { status: 400 });
    }
  }

  const origin = originFromRequest(req);
  const successUrl = `${origin}/billing/success?checkout_id={CHECKOUT_ID}`;

  try {
    const checkout = await createPolarCheckout({
      productId,
      successUrl,
      customerEmail: user.email ?? undefined,
      metadata,
    });
    return NextResponse.json({ url: checkout.url, id: checkout.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout creation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
