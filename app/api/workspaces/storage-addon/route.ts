import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidAddonGb } from "@/app/_data/storage-addons";
import { checkIsAdmin } from "@/app/admin/_lib";

/* /api/workspaces/storage-addon
 *
 * POST   { workspaceId, addonGb }   admin-only override: stamp an
 *                                   addon row with payment_status='active'
 *                                   for free testing or manual support.
 *                                   addonGb 0 removes the row.
 * DELETE { workspaceId }            admin-only: clear the row entirely.
 *
 * History:
 *   v1 — open to workspace owners. Mock cap, no payment.
 *   v2 — open to workspace owners but row was 'pending' until Paddle
 *        webhook flipped it. The owner could still pick a new add-on
 *        without ever paying because the prior row stayed visible.
 *   v3 (this) — locked to admins only. Members + owners must use the
 *        Paddle Checkout flow at /api/billing/checkout, which stages a
 *        'pending' row and only flips to 'active' when the
 *        subscription.created webhook fires. This route exists purely
 *        for ops overrides (refunds, comp, debugging).
 *
 * Returns the new effective cap by re-running the workspace_storage RPC
 * after the mutation so the caller doesn't need a second round-trip.
 */

interface PostBody {
  workspaceId?: string;
  addonGb?: number;
}

interface DeleteBody {
  workspaceId?: string;
}

interface StorageRow {
  cap_bytes: number;
  used_bytes: number;
}

async function fetchEffectiveCap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string
): Promise<{ capBytes: number; usedBytes: number } | null> {
  const { data } = await supabase.rpc("workspace_storage", {
    ws_id: workspaceId,
  });
  const rows = (data ?? []) as StorageRow[];
  const row = rows[0];
  if (!row) return null;
  return { capBytes: Number(row.cap_bytes), usedBytes: Number(row.used_bytes) };
}

export async function POST(req: NextRequest) {
  const adminCheck = await checkIsAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      {
        error:
          adminCheck.reason === "no-user"
            ? "unauthorized"
            : "admin only — use /api/billing/checkout to purchase an add-on",
      },
      { status: adminCheck.reason === "no-user" ? 401 : 403 }
    );
  }

  const supabase = await createClient();

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const workspaceId = body.workspaceId;
  const addonGb = Number(body.addonGb);
  if (!workspaceId || !Number.isFinite(addonGb)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  if (!isValidAddonGb(addonGb)) {
    return NextResponse.json(
      { error: "addonGb must be 0, 500, 2048, or 10240" },
      { status: 400 }
    );
  }

  if (addonGb === 0) {
    // Clearing the add-on = deleting the row.
    const { error } = await supabase
      .from("workspace_storage_addons")
      .delete()
      .eq("workspace_id", workspaceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    // Admin override stamps payment_status='active' so workspace_storage
    // immediately credits the cap. This is the manual-support escape
    // hatch — the normal user path is the Paddle webhook flipping the
    // row to 'active' after subscription.created.
    const { error } = await supabase
      .from("workspace_storage_addons")
      .upsert(
        {
          workspace_id: workspaceId,
          addon_gb: addonGb,
          selected_by: adminCheck.userId,
          selected_at: new Date().toISOString(),
          payment_status: "active",
        },
        { onConflict: "workspace_id" }
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const cap = await fetchEffectiveCap(supabase, workspaceId);
  return NextResponse.json({
    ok: true,
    workspaceId,
    addonGb,
    capBytes: cap?.capBytes ?? null,
    usedBytes: cap?.usedBytes ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  const adminCheck = await checkIsAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json(
      {
        error:
          adminCheck.reason === "no-user"
            ? "unauthorized"
            : "admin only — use /api/billing/checkout to manage subscriptions",
      },
      { status: adminCheck.reason === "no-user" ? 401 : 403 }
    );
  }

  const supabase = await createClient();

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const workspaceId = body.workspaceId;
  if (!workspaceId) {
    return NextResponse.json({ error: "missing workspaceId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_storage_addons")
    .delete()
    .eq("workspace_id", workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const cap = await fetchEffectiveCap(supabase, workspaceId);
  return NextResponse.json({
    ok: true,
    workspaceId,
    addonGb: 0,
    capBytes: cap?.capBytes ?? null,
    usedBytes: cap?.usedBytes ?? null,
  });
}
