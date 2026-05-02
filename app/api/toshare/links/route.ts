/* List all toshare links for a workspace. */

import { NextRequest, NextResponse } from "next/server";
import { listWorkspaceLinks, listMyLinks } from "@/lib/toshare/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  const links = workspaceId
    ? await listWorkspaceLinks(workspaceId)
    : await listMyLinks();
  return NextResponse.json({ links });
}
