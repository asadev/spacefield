import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/workspaces/ensure
 *   body: { id, name }
 *
 * Lazy materializer for workspaces. The desktop creates workspaces in
 * localStorage and relies on a client-side sync hook to push them up
 * to public.workspaces. That push has been racing — by the time Files
 * Manager opens, the row may not exist yet, which makes
 * `workspace_storage` return 0 (so the quota bar shows "0 B of 0 B")
 * and the membership check on /api/files/upload reject with 403
 * "not a member of that workspace".
 *
 * Idempotency contract:
 *   - If the workspace already exists in DB and the caller is its
 *     owner: no-op, returns existing row.
 *   - If the workspace already exists and the caller is NOT a member:
 *     403 (someone else owns this UUID — the caller is fishing).
 *   - If the workspace does NOT exist: insert it with caller as
 *     owner. The on_workspace_created trigger then adds the
 *     workspace_members row automatically.
 *
 * UUIDs are 122-bit-random so there's no realistic collision risk
 * between different users' local workspaces — if a row for this id
 * already exists, treat it as authoritative.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { id, name } = body;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  // Reject obvious non-UUIDs so we don't pollute the table with
  // legacy short-string ids.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }

  const safeName = (name ?? "").toString().trim().slice(0, 80) || "Workspace";

  // Does this workspace already exist?
  const { data: existing, error: lookupErr } = await supabase
    .from("workspaces")
    .select("id, user_id, name")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  if (existing) {
    // Already in DB. If caller isn't a member, they don't own this id.
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json(
        { error: "workspace exists but caller is not a member" },
        { status: 403 }
      );
    }
    return NextResponse.json({
      workspace: existing,
      role: member.role,
      created: false,
    });
  }

  // Doesn't exist — create it with caller as owner. RLS allows this
  // because the policy is `with check (auth.uid() = user_id)`. The
  // on_workspace_created trigger inserts the workspace_members row.
  const { data: created, error: insertErr } = await supabase
    .from("workspaces")
    .insert({ id, user_id: user.id, name: safeName })
    .select("id, user_id, name")
    .single();
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({
    workspace: created,
    role: "owner",
    created: true,
  });
}
