import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api-wrap";
import { createClient } from "@/lib/supabase/server";
import { getAuthUserId, getProjectById } from "@/lib/tasks/server";
import { ProjectUpdateSchema } from "@/lib/tasks/validation";

export const dynamic = "force-dynamic";

/**
 * GET    /api/projects/:id
 * PATCH  /api/projects/:id
 * DELETE /api/projects/:id   (soft delete)
 */

type Params = { params: Promise<{ id: string }> };

export const GET = withApiHandler<Params>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const row = await getProjectById(id);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ project: row });
  },
  { source: "projects.get", rateLimit: { count: 120, window_sec: 60 } }
);

export const PATCH = withApiHandler<Params>(
  async (req, ctx) => {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = ProjectUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update(parsed.data)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ project: data });
  },
  { source: "projects.update", rateLimit: { count: 60, window_sec: 60 } }
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
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  },
  { source: "projects.delete", rateLimit: { count: 30, window_sec: 60 } }
);
