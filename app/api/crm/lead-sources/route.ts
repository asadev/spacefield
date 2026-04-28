/* ─────────────────────────────────────────────────────────────────────────
 * GET  /api/crm/lead-sources?workspace_id=…   — list configured sources
 * POST /api/crm/lead-sources                  — create a new source
 *
 * RLS gates SELECT to workspace members and INSERT to owner/admin. We
 * still call requireWorkspaceMember() before the SELECT so the error
 * shape is uniform with the rest of /api/crm.
 *
 * On create: we generate slug + secret server-side. The client should
 * send `{ workspace_id, kind, name, config }` only.
 * ───────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  jsonError,
  readJson,
  requireUser,
  requireWorkspaceMember,
} from "../_helpers";
import {
  generateSecret,
  generateSlug,
} from "@/lib/crm/lead-sources/ingest";
import {
  LEAD_SOURCE_KIND_VALUES,
  type CrmLeadSource,
} from "@/lib/crm/lead-sources/types";

const createBody = z.object({
  workspace_id: z.string().uuid(),
  kind: z.enum(LEAD_SOURCE_KIND_VALUES),
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required");

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const { data, error } = await auth.supabase
    .from("crm_lead_sources")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ items: (data as CrmLeadSource[]) ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJson(req);
  if (!body.ok) return body.response;
  const parsed = createBody.safeParse(body.body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const member = await requireWorkspaceMember(
    auth.supabase,
    parsed.data.workspace_id
  );
  if (!member.ok) return member.response;

  // Try a few times in the (extremely unlikely) event of a slug
  // collision — `slug` is `unique(workspace_id, slug)`.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const { data, error } = await auth.supabase
      .from("crm_lead_sources")
      .insert({
        workspace_id: parsed.data.workspace_id,
        kind: parsed.data.kind,
        name: parsed.data.name,
        slug,
        secret: generateSecret(),
        config: parsed.data.config ?? {},
      })
      .select("*")
      .single();
    if (!error && data) {
      return NextResponse.json({ item: data as CrmLeadSource });
    }
    // 23505 = unique violation. Retry with a new slug.
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      return jsonError(error?.message ?? "insert failed", 500);
    }
  }
  return jsonError("could not allocate slug after retries", 500);
}
