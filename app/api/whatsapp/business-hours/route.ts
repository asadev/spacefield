import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isInsideBusinessHours } from "@/lib/whatsapp/automation";
import {
  jsonError,
  readJson,
  requirePro,
  requireUser,
  requireWorkspaceMember,
} from "@/lib/whatsapp/_route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp business hours + away/welcome messages (EPIC-09). One row per
 * workspace. Consumed by the automation engine to gate away/welcome replies.
 *
 * GET  /api/whatsapp/business-hours?workspace_id=   → { config, open_now }
 * PUT  /api/whatsapp/business-hours   { workspace_id, timezone?, weekly?, holidays?, away_message?, welcome_message? }
 *
 * weekly jsonb is keyed by weekday 0..6 (0=Sun): { "1": [{open,close}], ... }.
 *
 * Auth: requireUser -> requirePro -> requireWorkspaceMember.
 */

interface BizBody {
  workspace_id?: string;
  timezone?: string;
  weekly?: Record<string, Array<{ open: string; close: string }>>;
  holidays?: string[];
  away_message?: string;
  welcome_message?: string;
}

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
  const { data, error } = await admin
    .from("whatsapp_business_hours")
    .select("timezone, weekly, holidays, away_message, welcome_message, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);

  const config = data ?? {
    timezone: "Asia/Karachi",
    weekly: {},
    holidays: [],
    away_message: null,
    welcome_message: null,
  };
  const openNow = isInsideBusinessHours(
    config as {
      timezone: string;
      weekly: Record<string, Array<{ open: string; close: string }>>;
      holidays: string[];
      away_message: string | null;
      welcome_message: string | null;
    },
  );
  return NextResponse.json({ config, open_now: openNow });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const pro = await requirePro(auth.user.id);
  if (!pro.ok) return pro.response;

  const parsed = await readJson<BizBody>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (!b.workspace_id) return jsonError("workspace_id required", 400);

  const member = await requireWorkspaceMember(auth.supabase, b.workspace_id);
  if (!member.ok) return member.response;

  const row: Record<string, unknown> = { workspace_id: b.workspace_id };
  if (b.timezone !== undefined) row.timezone = b.timezone || "Asia/Karachi";
  if (b.weekly !== undefined) row.weekly = b.weekly ?? {};
  if (b.holidays !== undefined) row.holidays = b.holidays ?? [];
  if (b.away_message !== undefined) row.away_message = b.away_message?.trim() || null;
  if (b.welcome_message !== undefined)
    row.welcome_message = b.welcome_message?.trim() || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whatsapp_business_hours")
    .upsert(row, { onConflict: "workspace_id" })
    .select("timezone, weekly, holidays, away_message, welcome_message, updated_at")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ config: data });
}
