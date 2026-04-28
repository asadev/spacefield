/* ─────────────────────────────────────────────────────────────────────────
 * CRM API — shared helpers for route handlers.
 * Centralizes auth + workspace-membership checks so each entity route
 * stays small. RLS still gates everything inside Postgres; these helpers
 * exist to give clean 401/403 error shapes before the query runs.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(): Promise<
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}

/**
 * Verify the calling user is a member of `workspaceId`. Uses the
 * user-scoped client + `is_workspace_member()` RPC so RLS can't be
 * bypassed. Returns 403 on miss.
 */
export async function requireWorkspaceMember(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      ),
    };
  }
  const { data, error } = await supabase.rpc("is_workspace_member", {
    ws_id: workspaceId,
  });
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }
  if (data !== true) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse a request body as JSON or return a 400. Keeps error-shape uniform.
 */
export async function readJson<T = unknown>(
  req: Request
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  try {
    const body = (await req.json()) as T;
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonError("invalid json", 400) };
  }
}
