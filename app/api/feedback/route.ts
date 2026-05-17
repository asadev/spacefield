/* /api/feedback — accept a user's feedback submission.
 *
 * POST { message, url?, user_agent? }
 *   - `message` is required, capped at 4000 chars after trim.
 *   - `url` is optional, capped at 500 chars (page the user was on).
 *   - `user_agent` is optional — the client typically sends
 *      navigator.userAgent so admins can correlate browser-specific
 *      reports.
 *
 * Auth: open to anyone (signed-in or anonymous). When a session is
 * present we stamp user_id + email so the admin triage UI can route
 * follow-ups. Anonymous submissions are accepted but rate-limited
 * harder (5 / hour / IP).
 *
 * Storage: row goes into `public.user_feedback` via the service-role
 * client. We bypass RLS deliberately so anonymous inserts work — the
 * insert is otherwise restricted to authenticated users only.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { safeErrorMessage } from "@/lib/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MESSAGE_MAX = 4000;
const URL_MAX = 500;
const UA_MAX = 500;

interface FeedbackPayload {
  message?: unknown;
  url?: unknown;
  user_agent?: unknown;
}

export async function POST(req: NextRequest) {
  let body: FeedbackPayload;
  try {
    body = (await req.json()) as FeedbackPayload;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 }
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: "message too long" }, { status: 400 });
  }

  const url =
    typeof body.url === "string" && body.url.trim()
      ? body.url.trim().slice(0, URL_MAX)
      : null;
  const userAgent =
    typeof body.user_agent === "string" && body.user_agent.trim()
      ? body.user_agent.trim().slice(0, UA_MAX)
      : (req.headers.get("user-agent") ?? "").slice(0, UA_MAX) || null;

  // Resolve session (best-effort). Failures here just leave the row
  // anonymous — never block the submission.
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      userId = data.user.id;
      email = data.user.email ?? null;
    }
  } catch {
    // ignore — anonymous path
  }

  // Rate-limit. Authenticated users get a friendlier cap.
  const ip = getClientIp(req);
  const bucketKey = userId
    ? `feedback:user:${userId}`
    : `feedback:ip:${ip}`;
  const maxPerHour = userId ? 20 : 5;
  const allowed = await checkRateLimit(bucketKey, maxPerHour, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": "3600" },
      }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_feedback")
      .insert({
        user_id: userId,
        email,
        url,
        message,
        user_agent: userAgent,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      log.warn("feedback.insert_failed", { error: error.message });
      return NextResponse.json(
        {
          error: safeErrorMessage(error, {
            source: "feedback",
            fallback: "insert_failed",
          }),
        },
        { status: 500 }
      );
    }

    log.info("feedback.submitted", {
      id: (data as { id: string } | null)?.id ?? null,
      user_id: userId,
      anonymous: !userId,
    });

    return NextResponse.json({
      ok: true,
      id: (data as { id: string } | null)?.id ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: safeErrorMessage(e, {
          source: "feedback",
          fallback: "unexpected_error",
        }),
      },
      { status: 500 }
    );
  }
}
