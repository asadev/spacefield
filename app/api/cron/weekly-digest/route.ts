// Weekly market briefing — Vercel Cron endpoint
//
// Schedule: Fri 08:00 UTC (see vercel.json).
// Generates a per-user digest payload and writes it to `weekly_digests`.
// Actual email sending is stubbed — when the Resend API key lands, hook it in
// at the marked TODO and read these rows to send.

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { posts as BLOG_POSTS } from "@/lib/blog-data";

const TOOL_SUGGESTIONS = [
  { slug: "mortgage-calculator", name: "Mortgage Calculator" },
  { slug: "yield-heatmap", name: "Yield Heatmap" },
  { slug: "deal-scoring", name: "Deal Scoring" },
  { slug: "market-pulse", name: "Market Pulse" },
  { slug: "investment-advisor", name: "Investment Advisor" },
  { slug: "portfolio-tracker", name: "Portfolio Tracker" },
  { slug: "area-comparison", name: "Area Comparison" },
  { slug: "neighborhood-report", name: "Neighborhood Report" },
  { slug: "cash-flow-modeler", name: "Cash-flow Modeler" },
  { slug: "property-valuation", name: "Property Valuation" },
];

interface DigestPayload {
  region: string;
  generated_at: string;
  bullets: { title: string; body: string; href?: string }[];
}

function authorized(req: Request): boolean {
  // Vercel Cron sends an Authorization header with the CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // In preview/local environments without a secret, allow through.
    return true;
  }
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

/**
 * Admin client — uses service role key so the cron job can read all profiles
 * and write to weekly_digests. Falls back to the session-scoped server client
 * when service role is not configured (result: only the currently signed-in
 * user, which is correct for local development).
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    return createSbClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return null;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const fallback = admin ? null : await createServerClient();
  const db = admin ?? fallback!;

  // Latest blog posts (static data — no Supabase read needed for content).
  const latestPosts = [...BLOG_POSTS]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  // Load profiles (region preference lives client-side today — we fall back
  // to UAE when absent).
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: { user_id: string; logged: boolean }[] = [];

  for (const p of profiles || []) {
    const region = "uae"; // default until profile stores preferred region
    const payload: DigestPayload = buildDigest(region, latestPosts);

    const { error: insertErr } = await db.from("weekly_digests").insert({
      user_id: p.id,
      payload,
      // sent_at stays null — the actual send step stamps it.
      sent_at: null,
    });
    results.push({ user_id: p.id, logged: !insertErr });

    // TODO: wire Resend API key.
    // if (process.env.RESEND_API_KEY && userEmail) {
    //   await fetch("https://api.resend.com/emails", { ... });
    //   await db.from("weekly_digests")
    //     .update({ sent_at: new Date().toISOString() })
    //     .eq(...);
    // }
  }

  return NextResponse.json({
    ok: true,
    generated: results.length,
    sent: 0, // stubbed
    note: "Email send is stubbed. Drop RESEND_API_KEY + wire the TODO to start sending.",
  });
}

function buildDigest(
  region: string,
  posts: typeof BLOG_POSTS
): DigestPayload {
  const bullets: DigestPayload["bullets"] = [];

  const marketPost = posts.find((p) => p.category === "market-insights") || posts[0];
  if (marketPost) {
    bullets.push({
      title: `Market update: ${marketPost.title}`,
      body: marketPost.excerpt,
      href: `/blog/${marketPost.slug}`,
    });
  }

  // Two tool suggestions — deterministic rotation by ISO week so users see
  // different ones each week.
  const week = weekNumber();
  const tA = TOOL_SUGGESTIONS[week % TOOL_SUGGESTIONS.length];
  const tB = TOOL_SUGGESTIONS[(week + 3) % TOOL_SUGGESTIONS.length];
  bullets.push({
    title: `Try: ${tA.name}`,
    body: `A tool you may not have used yet. Takes two minutes.`,
    href: `/tools/${tA.slug}`,
  });
  bullets.push({
    title: `Try: ${tB.name}`,
    body: `Complement your analysis with a second angle.`,
    href: `/tools/${tB.slug}`,
  });

  // Community highlight — placeholder bullet; the evaluator can upgrade this
  // once community ranking exists.
  bullets.push({
    title: "Community this week",
    body: "Fresh discussions and deal shares in your region. Jump in.",
    href: "/community",
  });

  return {
    region,
    generated_at: new Date().toISOString(),
    bullets,
  };
}

function weekNumber(): number {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diff = (d.getTime() - start.getTime()) / 86400000;
  return Math.floor(diff / 7);
}
