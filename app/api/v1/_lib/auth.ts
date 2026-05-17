import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { validateToken } from "@/lib/api-tokens";
import { tokenHasScope, type V1Scope } from "@/lib/api-tokens/verify";
import { getClientIp } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bearer-token verification + scope gating for the /api/v1/* surface.
 *
 *   1. Pull `Authorization: Bearer …` (case-insensitive).
 *   2. Validate via the existing api_tokens hash lookup.
 *   3. Confirm the token carries the required scope.
 *   4. Resolve the workspace scope — tokens MUST have a workspace_id
 *      so list endpoints can scope by it without ambiguity.
 *
 * Returns either an authenticated context (`{ ok: true, ... }`) or a
 * pre-built error Response (`{ ok: false, response }`) for the caller
 * to short-circuit on.
 */

export type V1AuthContext = {
  tokenId: string;
  userId: string;
  workspaceId: string;
  scopes: string[];
};

export type V1AuthResult =
  | { ok: true; ctx: V1AuthContext }
  | { ok: false; response: NextResponse };

function unauth(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers:
        status === 401
          ? { "WWW-Authenticate": 'Bearer realm="api"' }
          : undefined,
    }
  );
}

function extractBearer(req: NextRequest): string | null {
  const raw =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/**
 * Verify the bearer token on `req` and require the supplied `scope`.
 *
 * The function returns early with an appropriate JSON error response on
 * any failure mode (missing token → 401, invalid → 401, missing scope
 * → 403, token without workspace → 403). Successful results carry the
 * resolved auth context.
 */
export async function authenticateV1(
  req: NextRequest,
  scope: V1Scope
): Promise<V1AuthResult> {
  const raw = extractBearer(req);
  if (!raw) {
    return {
      ok: false,
      response: unauth("missing_bearer_token", 401),
    };
  }

  const result = await validateToken(raw, { lastUsedIp: getClientIp(req) });
  if (!result) {
    return { ok: false, response: unauth("invalid_token", 401) };
  }

  if (!tokenHasScope(result.scopes, scope)) {
    return { ok: false, response: unauth("insufficient_scope", 403) };
  }

  if (!result.workspaceId) {
    return {
      ok: false,
      response: unauth("token_missing_workspace", 403),
    };
  }

  return {
    ok: true,
    ctx: {
      tokenId: result.tokenId,
      userId: result.userId,
      workspaceId: result.workspaceId,
      scopes: result.scopes,
    },
  };
}

/**
 * Build a service-role Supabase client. The v1 endpoints intentionally
 * bypass RLS — we already authorised against the token's `workspace_id`
 * and the explicit `eq("workspace_id", ctx.workspaceId)` filter on every
 * query keeps cross-tenant leaks out.
 *
 * Centralised here so a future change (e.g. adding header injection or
 * audit hooks) only edits one place.
 */
export function v1AdminClient() {
  return createAdminClient();
}

/**
 * Cursor pagination helpers.
 *
 *   - `parseListParams` reads `?limit=` and `?cursor=` from the URL,
 *     clamping limit to [1, 100] with a default of 50.
 *   - `buildListResponse` packages a rows-plus-next-cursor body in the
 *     shape every /api/v1 list endpoint emits.
 */
export function parseListParams(req: NextRequest): {
  limit: number;
  cursor: string | null;
} {
  const url = req.nextUrl;
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(100, Math.floor(rawLimit))
    : 50;
  const cursor = url.searchParams.get("cursor");
  return { limit, cursor: cursor && cursor.length > 0 ? cursor : null };
}

export function buildListResponse<T extends { id: string }>(
  rows: T[],
  limit: number
): NextResponse {
  // We over-fetch by one to detect a next page cheaply.
  let nextCursor: string | null = null;
  let items = rows;
  if (rows.length > limit) {
    nextCursor = rows[limit - 1]?.id ?? null;
    items = rows.slice(0, limit);
  }
  return NextResponse.json({
    data: items,
    next_cursor: nextCursor,
  });
}
