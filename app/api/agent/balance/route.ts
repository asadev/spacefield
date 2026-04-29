/* Read the caller's current month credit balance + the last-30-days
 * usage trend. Powers the Settings → AI section.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TIER_DEFAULTS, currentMonthKey } from "@/lib/agent/runtime/budget";
import type { Tier } from "@/lib/agent/runtime/types";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id required" },
      { status: 400 }
    );
  }

  const { data: subData } = await supabase
    .from("subscriptions")
    .select("tier_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tierRaw = (subData?.tier_id as string | undefined) ?? "free";
  const tier: Tier =
    tierRaw === "pro" || tierRaw === "team" || tierRaw === "enterprise"
      ? tierRaw
      : "free";

  const month = currentMonthKey();
  const { data: balance } = await supabase
    .from("agent_credit_balances")
    .select("quick_used, quick_cap, deep_used, deep_cap")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("month", month)
    .maybeSingle();

  // 30-day usage trend, grouped by day + bucket.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: events } = await supabase
    .from("agent_credit_events")
    .select("bucket, tokens, created_at")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .gte("created_at", since);

  const trendMap = new Map<string, { quick: number; deep: number }>();
  for (const ev of events ?? []) {
    const day = (ev.created_at as string).slice(0, 10);
    const cur = trendMap.get(day) ?? { quick: 0, deep: 0 };
    if (ev.bucket === "quick") cur.quick += Number(ev.tokens);
    else cur.deep += Number(ev.tokens);
    trendMap.set(day, cur);
  }
  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, vals]) => ({ day, ...vals }));

  const caps = TIER_DEFAULTS[tier];
  const link = await supabase
    .from("agent_whatsapp_links")
    .select("whatsapp_number, linked_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  const tg = await supabase
    .from("agent_telegram_links")
    .select("telegram_user_id, telegram_username, linked_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    tier,
    month,
    quick: {
      used: Number(balance?.quick_used ?? 0),
      cap: Number(balance?.quick_cap ?? caps.quick),
    },
    deep: {
      used: Number(balance?.deep_used ?? 0),
      cap: Number(balance?.deep_cap ?? caps.deep),
    },
    trend,
    whatsapp: link.data
      ? {
          number: link.data.whatsapp_number as string,
          linked_at: link.data.linked_at as string,
        }
      : null,
    telegram: tg.data
      ? {
          user_id: Number(tg.data.telegram_user_id),
          username: (tg.data.telegram_username as string | null) ?? null,
          linked_at: tg.data.linked_at as string,
        }
      : null,
  });
}
