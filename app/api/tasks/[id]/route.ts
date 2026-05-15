import { NextResponse, type NextRequest } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { safeErrorMessage } from "@/lib/safe-error";
import {
  getAuthUserId,
  getTaskById,
  softDeleteTask,
  updateTask,
} from "@/lib/tasks/server";
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
    const updates = parsed.data as Record<string, unknown>;
    // Mirror the prior completion-side-effect: Done sets completed_at, anything
    // else clears it. updateTask() handles search re-indexing.
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
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const task = await updateTask(id, updates as any);
      return NextResponse.json({ task });
    } catch (e) {
      return NextResponse.json(
        {
          error: safeErrorMessage(e, {
            source: "tasks.update",
            userId,
            fallback: "update_failed",
          }),
        },
        { status: 400 }
      );
    }
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
    try {
      await softDeleteTask(id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json(
        {
          error: safeErrorMessage(e, {
            source: "tasks.delete",
            userId,
            fallback: "delete_failed",
          }),
        },
        { status: 400 }
      );
    }
  },
  { source: "tasks.delete", rateLimit: { count: 60, window_sec: 60 } }
);
