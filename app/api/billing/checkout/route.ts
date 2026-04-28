import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckout, type CheckoutInput } from "@/lib/billing";
import { isValidAddonGb } from "@/app/_data/storage-addons";
import {
  PADDLE_ADDON_PRODUCTS,
  PADDLE_TIER_PRODUCTS,
} from "@/app/_data/paddle-products";

/* /api/billing/checkout
 *
 * POST { kind: 'tier' | 'addon', tier?: 'pro'|'team',
 *        addon_gb?: 500|2048|10240, workspaceId: string }
 *
 *   Spins up a Paddle checkout payload for either a tier upgrade or a
 *   per-workspace storage add-on. Response shape:
 *
 *     { provider: "paddle", paddle: { price_id, customer_email,
 *       custom_data } }
 *       → client opens Paddle.Checkout.open(...)
 *
 *   custom_data is the contract with the webhook handler:
 *     - user_id      → which Supabase user this maps to
 *     - workspace_id → which workspace the add-on (if any) attaches to
 *     - kind         → 'tier' | 'addon'
 *     - tier         → 'pro' | 'team' (only for kind=tier)
 *     - addon_gb     → 500/2048/10240 (only for kind=addon)
 *
 *   For add-on checkouts we pre-create a `workspace_storage_addons`
 *   row with payment_status='pending'. The cap RPC ignores pending
 *   rows so the user doesn't get the bigger cap until the webhook
 *   flips it to 'active'.
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
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: NextRequest) {
  // Fail fast + explicit if billing isn't configured. Without this the
  // request continues into createCheckout(), gets a malformed payload,
  // and the user sees Paddle's stock "Something went wrong" overlay.
  if (!process.env.PADDLE_API_KEY) {
    return NextResponse.json(
      { error: "Billing is not configured (PADDLE_API_KEY missing)." },
      { status: 500 }
    );
  }
  if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN missing).",
      },
      { status: 500 }
    );
  }

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

  // Verify the user owns this workspace.
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

  // Build the typed input for the abstraction.
  const checkoutInput: CheckoutInput = {
    kind,
    workspaceId,
    userId: user.id,
    userEmail: user.email ?? "",
    origin: originFromRequest(req),
  };

  if (kind === "tier") {
    if (!tier || (tier !== "pro" && tier !== "team")) {
      return NextResponse.json(
        { error: "tier must be 'pro' or 'team'" },
        { status: 400 }
      );
    }
    // Defensive: if paddle-products.ts is missing or malformed, fail
    // explicitly instead of letting an undefined price_id flow into
    // Paddle.Checkout.open().
    if (!PADDLE_TIER_PRODUCTS[tier]?.price_id) {
      return NextResponse.json(
        { error: `Paddle price_id missing for tier '${tier}'.` },
        { status: 500 }
      );
    }
    checkoutInput.tier = tier;
  } else {
    const gb = Number(addon_gb);
    if (!isValidAddonGb(gb) || gb === 0) {
      return NextResponse.json(
        { error: "addon_gb must be 500, 2048, or 10240" },
        { status: 400 }
      );
    }
    const addonKey = gb as 500 | 2048 | 10240;
    if (!PADDLE_ADDON_PRODUCTS[addonKey]?.price_id) {
      return NextResponse.json(
        { error: `Paddle price_id missing for addon '+${gb} GB'.` },
        { status: 500 }
      );
    }
    checkoutInput.addon_gb = addonKey;

    // Pre-stage a pending row. Webhook flips to 'active' on success.
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

  try {
    const result = await createCheckout(checkoutInput);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout creation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
