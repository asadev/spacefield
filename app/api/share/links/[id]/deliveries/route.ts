/* List recent webhook delivery attempts for a link.
 *
 * Returns last 25 attempts ordered newest-first. RLS already restricts
 * the rows to workspace members / link owners.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_webhook_deliveries")
    .select(
      "id, event, webhook_url, status, http_status, response_excerpt, signed, attempted_at, duration_ms"
    )
    .eq("link_id", id)
    .order("attempted_at", { ascending: false })
    .limit(25);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ deliveries: data ?? [] });
}
