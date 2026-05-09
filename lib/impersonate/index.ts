import "server-only";

import { headers } from "next/headers";

import { recordAdminAction } from "@/app/admin/_audit";
import type { ImpersonationSessionRow } from "@/app/admin/_types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Impersonation primitives — agent V (admin/support-impersonate).
 *
 * All three helpers do the audit + DB write under the service-role
 * client. Callers (server actions, API routes) are still expected to
 * have run `assertAdmin()` first; these helpers only audit/write.
 *
 * Schema reminder (impersonation_sessions):
 *   id, admin_id, target_user_id, reason,
 *   started_at, ended_at,
 *   ip, user_agent, metadata
 */

async function readRequestContext(): Promise<{
  ip: string | null;
  user_agent: string | null;
}> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const user_agent = h.get("user-agent") ?? null;
    return { ip: ip || null, user_agent };
  } catch {
    // headers() outside a request context returns nothing useful — fine.
    return { ip: null, user_agent: null };
  }
}

/** Open a new impersonation session row + audit. */
export async function startImpersonation(
  adminId: string,
  targetUserId: string,
  reason: string
): Promise<ImpersonationSessionRow> {
  const reasonClean = reason.trim();
  if (!reasonClean) throw new Error("impersonation reason required");
  if (!targetUserId) throw new Error("missing target user id");
  if (!adminId) throw new Error("missing admin id");

  const ctx = await readRequestContext();
  const admin = createAdminClient();
  const insertRow = {
    admin_id: adminId,
    target_user_id: targetUserId,
    reason: reasonClean,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    metadata: {},
  };

  const { data, error } = await admin
    .from("impersonation_sessions")
    .insert(insertRow)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "failed to start impersonation");
  }

  const row = data as ImpersonationSessionRow;
  await recordAdminAction({
    action: "impersonate.start",
    targetType: "impersonation_sessions",
    targetId: row.id,
    after: {
      admin_id: row.admin_id,
      target_user_id: row.target_user_id,
      reason: row.reason,
      started_at: row.started_at,
    },
    metadata: { ip: row.ip, user_agent: row.user_agent },
  });

  return row;
}

/** Close an impersonation session (idempotent — no-op if already closed). */
export async function endImpersonation(sessionId: string): Promise<void> {
  if (!sessionId) throw new Error("missing session id");
  const admin = createAdminClient();
  const { data: before } = await admin
    .from("impersonation_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  const beforeRow = (before as ImpersonationSessionRow | null) ?? null;
  if (!beforeRow) throw new Error("impersonation session not found");
  if (beforeRow.ended_at) {
    // Already closed — record nothing, but don't error: the UI will
    // re-render with the closed state.
    return;
  }

  const ended_at = new Date().toISOString();
  const { error } = await admin
    .from("impersonation_sessions")
    .update({ ended_at })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);

  await recordAdminAction({
    action: "impersonate.end",
    targetType: "impersonation_sessions",
    targetId: sessionId,
    before: { ended_at: beforeRow.ended_at },
    after: { ended_at },
  });
}

/** All currently-open impersonation sessions, newest first. */
export async function listActiveImpersonations(): Promise<
  ImpersonationSessionRow[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("impersonation_sessions")
    .select("*")
    .is("ended_at", null)
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ImpersonationSessionRow[];
}
