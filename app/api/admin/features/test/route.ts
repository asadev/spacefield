import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import {
  featureEnabled,
  getFlagByKey,
  resolveFlagLocally,
} from "@/lib/features";

/* GET /api/admin/features/test?key=X&uid=Y&ws_id=Z
 *
 *   Returns: {
 *     enabled: boolean,           // from Postgres feature_enabled() RPC
 *     reason: string,             // local resolver verdict reason
 *     detail: string,             // human description of the reason
 *     local_enabled: boolean,     // local resolver bool (should match enabled)
 *     drift: boolean              // true if RPC and local disagree
 *   }
 *
 * Admin-only. The RPC is the source of truth at runtime; the local
 * resolver mirrors it so the UI can explain *why* a flag came back the
 * way it did. Intended for the resolver-tester widget on the per-flag
 * page and for any external probe / integration test.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "forbidden" },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const key = (sp.get("key") ?? "").trim().toLowerCase();
  const uidRaw = (sp.get("uid") ?? "").trim();
  const wsRaw = (sp.get("ws_id") ?? "").trim();

  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  if (uidRaw && !UUID_REGEX.test(uidRaw)) {
    return NextResponse.json({ error: "invalid uid" }, { status: 400 });
  }
  if (wsRaw && !UUID_REGEX.test(wsRaw)) {
    return NextResponse.json({ error: "invalid ws_id" }, { status: 400 });
  }

  const uid = uidRaw || null;
  const wsId = wsRaw || null;

  const flag = await getFlagByKey(key);

  // Compute reason locally (independent of the RPC) by reading the
  // flag row and inspecting allowlists/rollout.
  const local = resolveFlagLocally(flag, uid, wsId);

  // Call the RPC for the actual gating decision.
  const enabled = await featureEnabled(key, uid, wsId);

  return NextResponse.json({
    key,
    uid,
    ws_id: wsId,
    enabled,
    local_enabled: local.enabled,
    reason: local.reason,
    detail: local.detail,
    drift: enabled !== local.enabled,
    flag: flag
      ? {
          key: flag.key,
          enabled: flag.enabled,
          rollout: flag.rollout,
          rollout_percent: flag.rollout_percent,
          allowlist_user_count: flag.allowlist_user_ids.length,
          allowlist_workspace_count: flag.allowlist_workspace_ids.length,
        }
      : null,
  });
}
