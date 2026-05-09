import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { checkIsAdmin } from "@/app/admin/_lib";
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "@/app/admin/_types";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESOURCE_SET = new Set<string>(PERMISSION_RESOURCES);
const ACTION_SET = new Set<string>(PERMISSION_ACTIONS);

/**
 * GET /api/admin/roles/check
 *   Returns has_permission(uid, resource, action) for the visibility tester.
 *
 *   Query params:
 *     uid       — uuid of the user under test (required)
 *     resource  — one of PERMISSION_RESOURCES (required)
 *     action    — one of PERMISSION_ACTIONS (required)
 *
 *   Returns:
 *     { has_permission: boolean, via_is_admin: boolean }
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await checkIsAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      {
        error:
          auth.reason === "no-user" ? "not signed in" : "not authorized",
      },
      { status: auth.reason === "no-user" ? 401 : 403 }
    );
  }

  const url = new URL(request.url);
  const uid = (url.searchParams.get("uid") ?? "").trim();
  const resource = (url.searchParams.get("resource") ?? "").trim();
  const action = (url.searchParams.get("action") ?? "").trim();

  if (!uid || !UUID_REGEX.test(uid)) {
    return NextResponse.json({ error: "invalid uid" }, { status: 400 });
  }
  if (!resource || !RESOURCE_SET.has(resource)) {
    return NextResponse.json(
      { error: "invalid resource" },
      { status: 400 }
    );
  }
  if (!action || !ACTION_SET.has(action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [rpcRes, profRes] = await Promise.all([
    admin.rpc("has_permission", {
      uid,
      p_resource: resource,
      p_action: action,
    }),
    admin
      .from("profiles")
      .select("is_admin")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  if (rpcRes.error) {
    return NextResponse.json(
      { error: rpcRes.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    uid,
    resource,
    action,
    has_permission: Boolean(rpcRes.data),
    via_is_admin: Boolean(
      (profRes.data as { is_admin?: boolean | null } | null)?.is_admin
    ),
  });
}
