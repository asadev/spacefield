import { NextRequest, NextResponse } from "next/server";
import { resumeLink } from "@/lib/toshare/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await resumeLink(id);
  return NextResponse.json({ ok: result.ok });
}
