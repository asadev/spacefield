import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidAddonGb } from "@/app/_data/storage-addons";

/* /api/workspaces/storage-addon
 *
 * POST   { workspaceId, addonGb }   upsert a workspace's add-on row.
 *                                   addonGb 0 removes the add-on.
 * DELETE { workspaceId }            clear the add-on (back to base).
 *
 * Auth model: we use the user-scoped Supabase client so the existing
 * RLS policy ("owners write addon") gates the write. No service role.
 *
 * Returns the new effective cap by re-running the workspace_storage
 * RPC after the mutation so the client doesn't need a second round-
 * trip to refresh the storage bar.
 *
 * Payment is NOT yet wired. For v1 a row simply means "the user chose
 * this add-on, apply the cap." When Stripe / Lemon Squeezy lands,
 * this route will gate the upsert on a successful payment intent.
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    const { error } = await supabase
      .from("workspace_storage_addons")
      .upsert(
        {
          workspace_id: workspaceId,
          addon_gb: addonGb,
          selected_by: user.id,
          selected_at: new Date().toISOString(),
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
