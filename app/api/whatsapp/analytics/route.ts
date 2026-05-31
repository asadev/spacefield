import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/whatsapp/analytics?workspace_id=&from=&to=&tz=&format=  (EPIC-15)
 *
 * Aggregates the append-only whatsapp_reporting_events into:
 *   - overview : open/unassigned/today counts (live), plus from the events
 *                table: new/resolved/reopened, first-response (avg+median),
 *                resolution time, reply time, busiest hours.
 *   - volume   : per-day series (new convos / resolved / first responses).
 *
 * `from`/`to` are ISO dates (default last 30 days). `format=csv` returns the
 * daily volume series as a CSV download. Both heavy aggregations run in the
 * DB via SECURITY DEFINER RPCs (whatsapp_analytics_overview / _volume) so we
 * make one round trip each.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);
  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const tz = sp.get("tz") || "Asia/Karachi";
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDate(sp.get("from")) ?? defaultFrom;
  const to = parseDate(sp.get("to")) ?? now;
  const fromIso = from.toISOString();
  // make `to` inclusive of its whole day by adding a day when only a date given
  const toIso = to.toISOString();

  const admin = createAdminClient();

  // ── live "right now" counts from the conversations table ──
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);

  const [openRes, unassignedRes, todayRes] = await Promise.all([
    admin
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", 0),
    admin
      .from("whatsapp_conversations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", 0)
      .is("assignee_id", null),
    admin
      .from("whatsapp_reporting_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("event_name", "conversation_created")
      .gte("created_at", startOfTodayUtc.toISOString()),
  ]);

  // ── overview + volume via RPC (one round trip each) ──
  const [overviewRpc, volumeRpc] = await Promise.all([
    admin.rpc("whatsapp_analytics_overview", {
      p_workspace_id: workspaceId,
      p_from: fromIso,
      p_to: toIso,
    }),
    admin.rpc("whatsapp_analytics_volume", {
      p_workspace_id: workspaceId,
      p_from: fromIso,
      p_to: toIso,
      p_tz: tz,
    }),
  ]);

  const overview =
    overviewRpc.error || !overviewRpc.data
      ? {}
      : (overviewRpc.data as Record<string, unknown>);
  const volume =
    volumeRpc.error || !Array.isArray(volumeRpc.data)
      ? []
      : (volumeRpc.data as Array<{
          day: string;
          new_convos: number;
          resolved: number;
          first_responses: number;
        }>);

  // ── CSV export (daily volume) ──
  if (sp.get("format") === "csv") {
    const header = "day,new_conversations,resolved,first_responses";
    const lines = volume.map(
      (r) =>
        `${csv(r.day)},${r.new_convos ?? 0},${r.resolved ?? 0},${r.first_responses ?? 0}`,
    );
    const body = [header, ...lines].join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="whatsapp-volume-${fromIso.slice(0, 10)}_${toIso.slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    range: { from: fromIso, to: toIso, tz },
    live: {
      open: openRes.count ?? 0,
      unassigned: unassignedRes.count ?? 0,
      created_today: todayRes.count ?? 0,
    },
    overview,
    volume,
  });
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Minimal CSV-cell escaper (defends against the day string; values are numeric). */
function csv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  // Guard against CSV formula injection on string cells.
  if (/^[=+\-@]/.test(v)) return `'${v}`;
  return v;
}
