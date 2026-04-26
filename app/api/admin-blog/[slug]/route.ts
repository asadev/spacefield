import { NextResponse } from "next/server";
import { getPublishedBySlug } from "@/lib/admin/blog-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const row = await getPublishedBySlug(slug);
  if (!row) return NextResponse.json({ post: null });
  return NextResponse.json({ post: row });
}
