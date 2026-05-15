import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/help/vote
 *
 * Public-facing endpoint for the thumbs up/down at the bottom of a
 * /help/[slug] article. NOT admin-gated — any visitor can vote, but each
 * (article, browser-cookie) pair only counts once thanks to the
 * `help_vote_<id>` cookie set after a successful POST.
 *
 * The route lives under `/api/admin/help/...` because that's the
 * namespace allocated to the help-center agent. Despite the path, this
 * specific endpoint is anonymous-allowed.
 *
 * Body: { article_id: string, value: "up" | "down" }
 */

const VOTE_COOKIE_PREFIX = "help_vote_";

export async function POST(req: NextRequest) {
  let body: { article_id?: unknown; value?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const articleId = String(body.article_id ?? "").trim();
  const valueRaw = String(body.value ?? "").trim();
  if (!articleId) {
    return NextResponse.json({ error: "missing article_id" }, { status: 400 });
  }
  if (valueRaw !== "up" && valueRaw !== "down") {
    return NextResponse.json({ error: "invalid value" }, { status: 400 });
  }

  // Per-browser dedupe via cookie. localStorage on the client is the
  // primary defence; this is the server-side version.
  const cookieStore = await cookies();
  const cookieKey = `${VOTE_COOKIE_PREFIX}${articleId.slice(0, 60)}`;
  const prior = cookieStore.get(cookieKey)?.value;
  if (prior === "up" || prior === "down") {
    return NextResponse.json(
      { error: "already voted" },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  // Try the dedicated RPC first (atomic). Fall back to read-modify-write
  // if the function isn't deployed.
  const rpc = await admin.rpc("help_article_record_vote", {
    p_id: articleId,
    p_value: valueRaw,
  });

  if (rpc.error) {
    const cur = await admin
      .from("help_articles")
      .select("helpful_count, not_helpful_count, status, visibility")
      .eq("id", articleId)
      .maybeSingle();
    if (cur.error || !cur.data) {
      return NextResponse.json({ error: "article not found" }, { status: 404 });
    }
    const row = cur.data as {
      helpful_count: number;
      not_helpful_count: number;
      status: string;
      visibility: string;
    };
    // Don't accept votes on non-public, non-published articles.
    if (
      row.status !== "published" ||
      (row.visibility !== "public" && row.visibility !== "authenticated")
    ) {
      return NextResponse.json(
        { error: "article not voteable" },
        { status: 403 }
      );
    }
    const patch =
      valueRaw === "up"
        ? { helpful_count: row.helpful_count + 1 }
        : { not_helpful_count: row.not_helpful_count + 1 };
    const upd = await admin
      .from("help_articles")
      .update(patch)
      .eq("id", articleId);
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
  }

  try {
    // SC-010 — `Secure` so the dedupe cookie isn't sent over plain
    // HTTP; in dev the cookie just won't transmit, which is fine
    // (localStorage still de-dupes client-side).
    cookieStore.set(cookieKey, valueRaw, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: false,
      sameSite: "lax",
      secure: true,
    });
  } catch {
    // Ignore — the client-side localStorage guard still de-dupes.
  }

  return NextResponse.json({ ok: true });
}
