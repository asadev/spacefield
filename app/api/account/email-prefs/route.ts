import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/account/email-prefs
 *
 * Backs the `/account/email` form. Accepts either an
 * `application/x-www-form-urlencoded` payload (from a plain HTML form
 * submission) or JSON (from a future client-side React form). Field
 * shape is identical either way — a present-and-truthy field means
 * "channel on", absence means "channel off".
 *
 * Auth: read auth.uid() from the user-scoped Supabase client and
 * upsert into `notification_prefs` keyed on user_id. RLS on the
 * `notification_prefs` table guarantees the user can only ever write
 * their own row even if we bug-out and forget to filter.
 *
 * Response: redirect back to `/account/email?toast=...` for the form
 * case so the page picks up the success/error toast on remount. For
 * the JSON case we return `{ ok, ... }`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FIELDS = [
  "email_welcome",
  "email_suspicious_login",
  "email_task_assigned",
  "email_weekly_digest",
  "email_marketing_channel",
] as const;

type Field = (typeof FIELDS)[number];

export async function POST(req: NextRequest) {
  const accept = req.headers.get("accept") ?? "";
  const wantsJson = accept.includes("application/json");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (wantsJson) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login?next=/account/email", req.url));
  }

  // Parse — be tolerant of either content type.
  const values = await readFields(req);

  const row: Record<Field | "user_id" | "updated_at", unknown> = {
    user_id: user.id,
    email_welcome: values.email_welcome,
    email_suspicious_login: values.email_suspicious_login,
    email_task_assigned: values.email_task_assigned,
    email_weekly_digest: values.email_weekly_digest,
    email_marketing_channel: values.email_marketing_channel,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("notification_prefs")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error(
      JSON.stringify({
        evt: "email_prefs.update.failed",
        user_id: user.id,
        msg: error.message,
      }),
    );
    if (wantsJson) {
      return NextResponse.json(
        { ok: false, error: "save_failed" },
        { status: 500 },
      );
    }
    return NextResponse.redirect(
      new URL(
        "/account/email?toast=error:Couldn%27t%20save.%20Try%20again.",
        req.url,
      ),
    );
  }

  if (wantsJson) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(
    new URL(
      "/account/email?toast=success:Email%20preferences%20saved.",
      req.url,
    ),
  );
}

async function readFields(req: NextRequest): Promise<Record<Field, boolean>> {
  const ct = req.headers.get("content-type") ?? "";
  const out = Object.fromEntries(FIELDS.map((f) => [f, false])) as Record<
    Field,
    boolean
  >;

  if (ct.includes("application/json")) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      for (const f of FIELDS) out[f] = truthy(body?.[f]);
    } catch {
      // ignore — all fields stay false
    }
    return out;
  }

  // Form-encoded — also catches multipart.
  try {
    const form = await req.formData();
    for (const f of FIELDS) out[f] = truthy(form.get(f));
  } catch {
    // ignore — all fields stay false
  }
  return out;
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "on" || s === "true" || s === "1" || s === "yes";
  }
  // FormDataEntryValue can be File — never a checkbox.
  return false;
}
