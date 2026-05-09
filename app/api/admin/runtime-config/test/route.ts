import { NextResponse, type NextRequest } from "next/server";

import { assertAdmin } from "@/app/admin/_lib";
import {
  getRuntimeConfig,
  getRuntimeConfigRow,
} from "@/lib/runtime-config";

/* GET /api/admin/runtime-config/test?key=X
 *
 *   Returns: {
 *     key: string,
 *     value_type: string | null,        // declared type (from row, if any)
 *     is_secret: boolean | null,
 *     resolved: unknown,                 // result of getRuntimeConfig(key)
 *     resolved_kind: string,             // typeof / "null" / "array"
 *     row_exists: boolean
 *   }
 *
 * Admin-only. Useful for the per-key page's "test resolver" widget and
 * for any external check that wants to verify a config key resolves
 * the way the admin expects.
 */

const KEY_REGEX = /^[a-z][a-z0-9_.\-]*$/;

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

  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  if (!KEY_REGEX.test(key)) {
    return NextResponse.json(
      {
        error:
          "invalid key — use lowercase letters, digits, dots, underscores, hyphens",
      },
      { status: 400 }
    );
  }

  const row = await getRuntimeConfigRow(key);
  let resolved: unknown;
  let resolverError: string | null = null;
  try {
    resolved = await getRuntimeConfig<unknown>(key);
  } catch (e) {
    resolverError = e instanceof Error ? e.message : "resolver error";
    resolved = null;
  }

  return NextResponse.json({
    key,
    value_type: row?.value_type ?? null,
    is_secret: row?.is_secret ?? null,
    resolved: resolved ?? null,
    resolved_kind: kindOf(resolved),
    row_exists: row !== null,
    resolver_error: resolverError,
  });
}

function kindOf(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
