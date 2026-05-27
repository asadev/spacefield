import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * App-availability gate. Looks up `public.app_registry` and returns 423
 * "locked" when an admin has not yet published the row. Use this on
 * routes that should disappear entirely when the WhatsApp app is
 * temporarily disabled by ops (e.g. during a billing pause). Cheap
 * single-row read so it's safe to call from every request.
 *
 * Plumbed sparingly — the existing requirePro is enough for the
 * subscriber gate; this is the second layer for "app is dark for
 * everyone right now". (K-15)
 */
export async function requireAppEnabled(
  appId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_registry")
      .select("published")
      .eq("id", appId)
      .maybeSingle();
    if (error) {
      // Fail open — a registry read error should not take the app down.
      return { ok: true };
    }
    if (!data) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "app_not_registered", message: "App not registered" },
          { status: 423 },
        ),
      };
    }
    if (!(data as { published: boolean }).published) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "app_disabled", message: "App temporarily disabled" },
          { status: 423 },
        ),
      };
    }
    return { ok: true };
  } catch {
    // Fail open on any unexpected error path.
    return { ok: true };
  }
}
