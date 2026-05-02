import { NextRequest, NextResponse } from "next/server";
import { pauseLink } from "@/lib/share/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await pauseLink(id);
  return NextResponse.json({ ok: result.ok });
}
