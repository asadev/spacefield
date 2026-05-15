import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import { getAuthUserId, getTaskById } from "@/lib/tasks/server";
import { TaskUpdateSchema } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

/**
 * GET    /api/tasks/:id  — read one task
 * PATCH  /api/tasks/:id  — partial update
 * DELETE /api/tasks/:id  — soft delete (sets deleted_at)
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Params>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const row = await getTaskById(id);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ task: row });
  },
  { source: "tasks.get", rateLimit: { count: 120, window_sec: 60 } }
);

export const PATCH = withApiHandler<Params>(
  async (req, ctx) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = TaskUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const updates = parsed.data as Record<string, unknown>;
    if (
      typeof updates.status === "string" &&
      updates.status === "Done" &&
      !("completed_at" in updates)
    ) {
      updates.completed_at = new Date().toISOString();
    }
    if (
      typeof updates.status === "string" &&
      updates.status !== "Done" &&
      !("completed_at" in updates)
    ) {
      updates.completed_at = null;
    }
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ task: data });
  },
  { source: "tasks.update", rateLimit: { count: 120, window_sec: 60 } }
);

export const DELETE = withApiHandler<Params>(
  async (_req, ctx) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  },
  { source: "tasks.delete", rateLimit: { count: 60, window_sec: 60 } }
);
