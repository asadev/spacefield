import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import {
  authenticateV1,
  buildListResponse,
  parseListParams,
  v1AdminClient,
} from "../_lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/contacts — list CRM contacts in the token's workspace.
 *
 * Query: limit, cursor, company_id, q (email substring).
 * Returns `{ data, next_cursor }`.
 */

const COLUMNS =
  "id, workspace_id, first_name, last_name, email, phone, job_title, " +
  "company_id, notes, visibility, owner_id, created_at, updated_at";

export const GET = withApiHandler(
  async (req: NextRequest) => {
    const auth = await authenticateV1(req, "read:contacts");
    if (!auth.ok) return auth.response;
    const { ctx } = auth;

    const { limit, cursor } = parseListParams(req);
    const url = req.nextUrl;
    const companyId = url.searchParams.get("company_id");
    const q = url.searchParams.get("q");

    const admin = v1AdminClient();
    let query = admin
      .from("crm_contacts")
      .select(COLUMNS)
      .eq("workspace_id", ctx.workspaceId)
      .order("id", { ascending: true })
      .limit(limit + 1);

    if (companyId) query = query.eq("company_id", companyId);
    if (q) query = query.ilike("email", `%${q}%`);
    if (cursor) query = query.gt("id", cursor);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "query_failed", detail: error.message },
        { status: 500 }
      );
    }
    return buildListResponse(
      (data ?? []) as unknown as { id: string }[],
      limit
    );
  },
  { source: "v1.contacts", rateLimit: { count: 600, window_sec: 60 } }
);
