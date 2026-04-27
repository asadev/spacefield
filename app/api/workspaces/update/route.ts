import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* POST /api/workspaces/update
 *   body: {
 *     workspaceId,
 *     name?, description?, avatar_url?,
 *     default_member_role?, who_can_invite?, who_can_install?, who_can_uninstall?
 *   }
 *
 * Owner-only: we re-check role server-side via workspace_role_of even
 * though the underlying RLS policy on workspaces also gates updates.
 *
 * We log a 'settings_changed' activity event with the diff after a
 * successful update.
 */

const PERM_VALUES = new Set(["admins", "members"]);
const ROLE_VALUES = new Set(["member", "admin"]);

type SettingsBody = {
  workspaceId?: string;
  name?: string;
  description?: string | null;
  avatar_url?: string | null;
  default_member_role?: "member" | "admin";
  who_can_invite?: "admins" | "members";
  who_can_install?: "admins" | "members";
  who_can_uninstall?: "admins" | "members";
};

type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  default_member_role: "member" | "admin";
  who_can_invite: string;
  who_can_install: string;
  who_can_uninstall: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const workspaceId = body.workspaceId;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing workspaceId" },
      { status: 400 }
    );
  }

  // Verify caller is owner.
  const { data: roleData, error: roleErr } = await supabase.rpc(
    "workspace_role_of",
    { ws_id: workspaceId }
  );
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }
  if (roleData !== "owner") {
    return NextResponse.json(
      { error: "only the workspace owner can change settings" },
      { status: 403 }
    );
  }

  // Build the patch and validate.
  const patch: Record<string, string | null> = {};
  if (typeof body.name === "string") {
    const next = body.name.trim().slice(0, 80);
    if (!next) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    patch.name = next;
  }
  if (body.description !== undefined) {
    patch.description =
      body.description === null
        ? null
        : String(body.description).slice(0, 500);
  }
  if (body.avatar_url !== undefined) {
    patch.avatar_url =
      body.avatar_url === null ? null : String(body.avatar_url).slice(0, 1000);
  }
  if (body.default_member_role !== undefined) {
    if (!ROLE_VALUES.has(body.default_member_role)) {
      return NextResponse.json(
        { error: "default_member_role must be 'member' or 'admin'" },
        { status: 400 }
      );
    }
    patch.default_member_role = body.default_member_role;
  }
  for (const key of [
    "who_can_invite",
    "who_can_install",
    "who_can_uninstall",
  ] as const) {
    const v = body[key];
    if (v !== undefined) {
      if (!PERM_VALUES.has(v)) {
        return NextResponse.json(
          { error: `${key} must be 'admins' or 'members'` },
          { status: 400 }
        );
      }
      patch[key] = v;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }

  // Read previous row so we can describe the diff in the activity log.
  const { data: prevRow } = await supabase
    .from("workspaces")
    .select(
      "id, name, description, avatar_url, default_member_role, who_can_invite, who_can_install, who_can_uninstall"
    )
    .eq("id", workspaceId)
    .maybeSingle();
  const prev = (prevRow as WorkspaceRow | null) ?? null;

  const { error: upErr } = await supabase
    .from("workspaces")
    .update(patch)
    .eq("id", workspaceId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  // Compute the diff payload for the activity entry.
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (prev) {
    for (const k of Object.keys(patch)) {
      const before = (prev as unknown as Record<string, unknown>)[k];
      const after = patch[k];
      if (before !== after) diff[k] = { from: before, to: after };
    }
  }
  await supabase.rpc("log_workspace_activity", {
    ws_id: workspaceId,
    k: "settings_changed",
    body: diff,
  });

  return NextResponse.json({ ok: true, patch, diff });
}
