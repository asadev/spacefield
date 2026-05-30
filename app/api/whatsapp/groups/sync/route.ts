import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceOwnerOrAdmin,
} from "@/lib/whatsapp/_route-helpers";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Heavy lifting (Evolution fetchAllGroups for ~all groups) lives here, OFF the
// hot path. AUD-01: the GET route must stay fast, so the expensive fetch + upsert
// happens only on this explicit POST.
export const maxDuration = 60;

interface SyncBody {
  workspace_id?: string;
}

// Per-HTTP-attempt budget for the Evolution call. request() honours this via
// opts.timeoutMs; keeping it under maxDuration (even across its internal retries)
// means this route never runs the function to a 504.
const EVOLUTION_TIMEOUT_MS = 18_000;

/**
 * POST /api/whatsapp/groups/sync — owner/admin + Pro, workspace-scoped.
 *
 * Pulls every group from Evolution for the workspace's connected instance and
 * upserts each into whatsapp_groups (name, JID, member_count). The Evolution
 * call is bounded by an AbortController so this never 504s; partial success is
 * fine — we upsert whatever came back. This is what populates the cache that the
 * Groups tab (GET /api/whatsapp/groups) and conversation-name resolution read.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<SyncBody>(req);
  if (!body.ok) return body.response;

  const workspaceId =
    body.body.workspace_id ?? req.nextUrl.searchParams.get("workspace_id") ?? "";
  if (!workspaceId) return jsonError("workspace_id required", 400);

  // Syncing mutates shared workspace state + hits the shop phone — restrict to
  // owners/admins, the same bar the rest of the privileged WhatsApp surface uses.
  const member = await requireWorkspaceOwnerOrAdmin(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: instRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instRow) return jsonError("no_connected_instance", 409);
  const inst = instRow as WhatsAppInstanceRow;

  // Bounded Evolution call (per-attempt timeout via fetchGroups -> request()).
  let remote;
  try {
    const client = getEvolutionClient();
    remote = await client.fetchGroups(
      inst.evolution_instance_name,
      EVOLUTION_TIMEOUT_MS,
    );
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return jsonError(
      aborted
        ? "group_sync_timeout"
        : e instanceof Error
          ? e.message
          : "sync_failed",
      aborted ? 504 : 502,
    );
  }

  const now = new Date().toISOString();
  // fetchGroups already maps to { id: <full JID>, subject, size } and drops
  // entries with an empty id. Store the FULL JID in evolution_group_id, matching
  // createGroup + the send route.
  const rows = remote
    .filter((g) => g.id.length > 0)
    .map((g) => ({
      workspace_id: workspaceId,
      instance_id: inst.id,
      evolution_group_id: g.id,
      name: g.subject || null,
      member_count: g.size ?? 0,
      members_synced_at: now,
    }));

  if (rows.length > 0) {
    const { error: upsertError } = await admin
      .from("whatsapp_groups")
      .upsert(rows, { onConflict: "instance_id,evolution_group_id" });
    if (upsertError) return jsonError(upsertError.message, 500);
  }

  return NextResponse.json({ ok: true, synced: rows.length });
}
