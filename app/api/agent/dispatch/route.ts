/* Internal POST /api/agent/dispatch — the in-app chat endpoint.
 *
 * Authenticated via the user's Supabase cookie session (NOT a phone link),
 * so we can pass the cookie-scoped client straight into the runtime and
 * RLS still applies to every tool call. No service-role JWT roundtrip
 * like the WhatsApp webhook needs.
 *
 * Body:
 *   { workspace_id, message, scope?: 'crm'|'files'|'boards'|null,
 *     conversation_id?: string, client_context?: { installed_apps?: string[] } }
 *
 * Returns the dispatch result, including any pending-approval flag the
 * UI can render as a "[Confirm] [Cancel]" callout.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatch } from "@/lib/agent/runtime/dispatcher";
import type {
  AgentClientContext,
  DispatchScope,
  Tier,
  UserContext,
} from "@/lib/agent/runtime/types";

export const runtime = "nodejs";
// Hybrid runtime can chain classifier → orchestrator → executor →
// formatter calls, plus tool execution. The Vercel Hobby default is
// 10s, well below realistic worst case. Pin to the 60s ceiling so we
// don't 504 mid-tool-call and leave a half-applied state.
export const maxDuration = 60;

interface DispatchBody {
  workspace_id?: string;
  message?: string;
  scope?: DispatchScope;
  conversation_id?: string;
  client_context?: unknown;
}

function stringList(value: unknown, max = 120): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeClientContext(value: unknown): AgentClientContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const active =
    obj.active_app && typeof obj.active_app === "object"
      ? (obj.active_app as Record<string, unknown>)
      : null;
  return {
    installedApps: stringList(obj.installed_apps),
    openApps: stringList(obj.open_apps, 40),
    activeApp: active
      ? {
          slug:
            typeof active.slug === "string"
              ? active.slug.slice(0, 120)
              : undefined,
          title:
            typeof active.title === "string"
              ? active.title.slice(0, 160)
              : undefined,
        }
      : null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as DispatchBody;
  const workspaceId = body.workspace_id;
  const messageText = body.message?.trim();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }
  if (!messageText) {
    return NextResponse.json(
      { error: "message required" },
      { status: 400 }
    );
  }

  // Confirm membership + pull role via service-role lookup. The
  // auth.getUser() call above already verified the caller's identity;
  // RLS on workspace_members can hide a user's own row in some SSR
  // sessions, which falsely returns "not_a_member" for legitimate
  // workspace owners.
  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mem) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }
  const roleRaw = (mem.role as string | undefined) ?? "member";
  const role: "owner" | "admin" | "member" | "viewer" =
    roleRaw === "owner" ||
    roleRaw === "admin" ||
    roleRaw === "viewer" ||
    roleRaw === "member"
      ? roleRaw
      : "member";

  // Tier resolution mirrors the WhatsApp webhook.
  const { data: subData } = await supabase
    .from("subscriptions")
    .select("tier_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tierRaw = (subData?.tier_id as string | undefined) ?? "free";
  const tier: Tier =
    tierRaw === "pro" || tierRaw === "team" || tierRaw === "enterprise"
      ? tierRaw
      : "free";

  // Scope validation.
  const rawScope = body.scope;
  const scope: DispatchScope =
    rawScope === "crm" || rawScope === "files" || rawScope === "boards"
      ? rawScope
      : null;

  const ctx: UserContext = {
    userId: user.id,
    workspaceId,
    tier,
    role,
    supabase,
    user,
    channel: "in_app",
    clientContext: sanitizeClientContext(body.client_context),
  };

  try {
    const result = await dispatch(
      {
        kind: "text",
        channel: "in_app",
        text: messageText,
        from: user.id,
        receivedAt: new Date().toISOString(),
      },
      ctx,
      { scope }
    );

    return NextResponse.json({
      reply: result.reply,
      credit_used: result.creditUsed ?? { quick: 0, deep: 0 },
      requires_approval: result.requiresApproval ?? null,
      budget_exhausted: result.budgetExhausted ?? false,
      conversation_id: body.conversation_id ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "dispatch_failed",
        message: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
