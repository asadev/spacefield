import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { withApiHandler } from "@/lib/api-wrap";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/storage
 *
 * Admin-only summary of the metadata table:
 *   - total_bytes / total_files
 *   - live_bytes / live_files
 *   - trashed_bytes / trashed_files
 *   - top_workspaces (top 50 by used bytes; live only)
 *
 * Mirrors the page's stat cards in JSON form for ops scripts.
 *
 * Wrapped with `withApiHandler` for uniform admin/ratelimit/error
 * handling. Storage scan is heavy; rate-limit is tighter than the
 * other endpoints.
 */
export const GET = withApiHandler(
  async (_req: NextRequest) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workspace_files")
      .select("workspace_id, size_bytes, deleted_at")
      .order("size_bytes", { ascending: false })
      .limit(100_000);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as {
      workspace_id: string;
      size_bytes: number;
      deleted_at: string | null;
    }[];

    let totalBytes = 0;
    let liveBytes = 0;
    let trashedBytes = 0;
    let liveFiles = 0;
    let trashedFiles = 0;
    const wsAgg = new Map<string, { used_bytes: number; file_count: number }>();
    for (const r of rows) {
      const sz = Number(r.size_bytes ?? 0);
      totalBytes += sz;
      if (r.deleted_at) {
        trashedBytes += sz;
        trashedFiles += 1;
      } else {
        liveBytes += sz;
        liveFiles += 1;
        const e = wsAgg.get(r.workspace_id) ?? {
          used_bytes: 0,
          file_count: 0,
        };
        e.used_bytes += sz;
        e.file_count += 1;
        wsAgg.set(r.workspace_id, e);
      }
    }
    const top = Array.from(wsAgg.entries())
      .map(([id, agg]) => ({ workspace_id: id, ...agg }))
      .sort((a, b) => b.used_bytes - a.used_bytes)
      .slice(0, 50);

    return NextResponse.json({
      total_bytes: totalBytes,
      total_files: rows.length,
      live_bytes: liveBytes,
      live_files: liveFiles,
      trashed_bytes: trashedBytes,
      trashed_files: trashedFiles,
      workspace_count: wsAgg.size,
      top_workspaces: top,
    });
  },
  {
    requireAdmin: true,
    source: "admin.api.storage.summary",
    rateLimit: { count: 30, window_sec: 60 },
  }
);
