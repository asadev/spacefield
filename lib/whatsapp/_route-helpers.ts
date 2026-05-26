import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isPro } from "@/lib/pro/features";

/**
 * Auth + tier + workspace-membership helpers for /api/whatsapp/* routes.
 *
 * Mirrors the shape of app/api/crm/_helpers.ts so the routes read
 * uniformly. Adds a Pro-tier gate because the WhatsApp app is paid-only.
 */

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T = unknown>(
  req: Request,
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  try {
    const body = (await req.json()) as T;
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonError("invalid json", 400) };
  }
}

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
      response: jsonError("unauthorized", 401),
    };
  }
  return { ok: true, supabase, user };
}

export async function requireWorkspaceMember(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!workspaceId) {
    return { ok: false, response: jsonError("workspace_id required", 400) };
  }
  const { data, error } = await supabase.rpc("is_workspace_member", {
    ws_id: workspaceId,
  });
  if (error) {
    return { ok: false, response: jsonError(error.message, 500) };
  }
  if (data !== true) {
    return { ok: false, response: jsonError("forbidden", 403) };
  }
  return { ok: true };
}

export async function requireWorkspaceOwnerOrAdmin(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!workspaceId) {
    return { ok: false, response: jsonError("workspace_id required", 400) };
  }
  const { data, error } = await supabase.rpc("workspace_role_of", {
    ws_id: workspaceId,
  });
  if (error) {
    return { ok: false, response: jsonError(error.message, 500) };
  }
  if (data !== "owner" && data !== "admin") {
    return { ok: false, response: jsonError("forbidden", 403) };
  }
  return { ok: true };
}

/**
 * Pro-tier gate. Returns 402 (payment required) with an upgrade hint
 * when the caller isn't on Pro.
 */
export async function requirePro(
  userId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const pro = await isPro(userId);
  if (!pro) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "pro_required", message: "WhatsApp app requires Pro tier" },
        { status: 402 },
      ),
    };
  }
  return { ok: true };
}
