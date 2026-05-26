import { NextResponse, type NextRequest } from "next/server";

import { ensureWorkspaceInstance } from "@/lib/whatsapp/instance-manager";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Evolution call + DB insert; allow headroom for the QR fetch.
export const maxDuration = 60;

interface CreateBody {
  workspace_id?: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const body = await readJson<CreateBody>(req);
  if (!body.ok) return body.response;

  const workspaceId = body.body.workspace_id;
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  try {
    const row = await ensureWorkspaceInstance(workspaceId, {
      createdBy: auth.user.id,
    });
    return NextResponse.json({
      instance_id: row.id,
      qr_code: row.qr_code,
      status: row.status,
      phone_number: row.phone_number,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "create_failed";
    return jsonError(message, 500);
  }
}
