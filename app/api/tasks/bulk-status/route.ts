import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/tasks/server";
import { TaskBulkStatusSchema } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/bulk-status  — set status on N tasks at once.
 *
 * Body: { ids: uuid[], status: string }
 * Behaviour: a single UPDATE bounded by the supplied ids; RLS keeps
 * the caller from touching tasks in workspaces they don't belong to.
 */

export const POST = withApiHandler(
  async (req: NextRequest) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = TaskBulkStatusSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { ids, status } = parsed.data;
    const supabase = await createClient();
    const updates: Record<string, unknown> = { status };
    if (status === "Done") updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .in("id", ids)
      .select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({
      updated: data?.length ?? 0,
      ids: (data ?? []).map((r) => (r as { id: string }).id),
    });
  },
  { source: "tasks.bulk_status", rateLimit: { count: 30, window_sec: 60 } }
);
