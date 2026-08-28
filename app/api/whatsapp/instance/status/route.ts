import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  jsonError,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";
import { getEvolutionClient } from "@/lib/whatsapp/client";
import {
  getInstanceSendStats,
  MAX_PER_HOUR,
  WARMUP_DAYS,
} from "@/lib/whatsapp/throttle";
import type { WhatsAppInstanceRow } from "@/lib/whatsapp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/instance/status?workspace_id=...
 *
 * Returns the current row + a small stats bundle so the UI can render
 * "Daily cap: 12 / 200" without a second round-trip.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, workspaceId);
  if (!member.ok) return member.response;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({
      status: null,
      phone_number: null,
      paired_at: null,
      qr_code: null,
      stats: null,
    });
  }

  let inst = row as WhatsAppInstanceRow;

  // Self-heal: if our DB row isn't "connected" but Evolution actually
  // has the instance "open", a CONNECTION_UPDATE webhook was missed
  // (e.g. paired during a webhook outage, or Evolution restarted). Poll
  // Evolution's real state and reconcile so the UI never gets stranded
  // on the pair screen while the phone shows the device linked. Cheap —
  // one fetchInstances call, only when not already connected.
  // (2026-05-27: the maintainer hit exactly this — phone linked, UI stuck on QR.)
  if (
    inst.status !== "connected" &&
    inst.status !== "banned" &&
    inst.evolution_instance_name
  ) {
    try {
      const client = getEvolutionClient();
      const instances = await client.fetchInstances();
      const live = instances.find(
        (i) => i.instanceName === inst.evolution_instance_name,
      );
      const liveState = (live?.status ?? "").toLowerCase();
      if (liveState === "open" || liveState === "connected") {
        const phone = live?.ownerJid
          ? live.ownerJid.split("@")[0]?.replace(/\D/g, "") || null
          : inst.phone_number;
        const { data: updated } = await admin
          .from("whatsapp_instances")
          .update({
            status: "connected",
            phone_number: phone,
            qr_code: null,
            paired_at: inst.paired_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", inst.id)
          .select("*")
          .maybeSingle();
        if (updated) inst = updated as WhatsAppInstanceRow;
      }
    } catch {
      // Evolution unreachable — return the DB row as-is. No regression.
    }
  }

  let stats:
    | Awaited<ReturnType<typeof getInstanceSendStats>>
    | null = null;
  try {
    stats = await getInstanceSendStats(inst.id);
  } catch {
    stats = null;
  }

  // Flatten the throttle bundle to top-level fields the Connection dashboard
  // reads directly (instance.health / warmup_day / daily_cap / sent_today /
  // sent_this_hour / hourly_cap). We keep `stats` for back-compat with any
  // older client that still reads the nested shape. (AUD-02: the dashboard
  // never rendered caps / warm-up / health because the component read
  // top-level fields the payload only exposed under `stats`.)
  let health: "good" | "warming" | "throttled" | "banned" | null = null;
  if (inst.status === "banned") {
    health = "banned";
  } else if (stats) {
    if (stats.warmup_age_days < WARMUP_DAYS) health = "warming";
    else if (stats.sent_last_hour >= MAX_PER_HOUR) health = "throttled";
    else health = "good";
  }

  return NextResponse.json({
    instance_id: inst.id,
    status: inst.status,
    phone_number: inst.phone_number,
    paired_at: inst.paired_at,
    qr_code: inst.qr_code,
    last_seen_at: inst.last_seen_at,
    // Top-level mirrors of the throttle stats (see note above).
    warmup_day: stats ? stats.warmup_age_days : null,
    daily_cap: stats ? stats.daily_cap : null,
    sent_today: stats ? stats.sent_last_day : null,
    sent_this_hour: stats ? stats.sent_last_hour : null,
    hourly_cap: stats ? MAX_PER_HOUR : null,
    health,
    stats,
  });
}
