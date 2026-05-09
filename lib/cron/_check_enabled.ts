import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helper for cron route handlers.
 *
 * Call from the top of a `/api/cron/*` GET handler. It looks up the
 * matching `cron_jobs` row by id (preferred) or path and short-circuits
 * the request if `enabled = false`. Returns `null` when the route should
 * proceed normally.
 *
 * Usage:
 *
 *   import { checkCronEnabled } from "@/lib/cron/_check_enabled";
 *
 *   export async function GET(req: NextRequest) {
 *     const block = await checkCronEnabled({ jobId: "social-publish" });
 *     if (block) return block;
 *     // ...normal handler
 *   }
 *
 * Existing routes that haven't opted in keep working — they ignore this
 * helper entirely. The toggle in `/admin/jobs` is therefore inert until
 * each route is wired in a follow-up.
 *
 * The helper also detects a manual override:
 *   ?triggered_by=manual&secret=<CRON_SECRET>
 * and lets it through even when the row is disabled, so a panel admin
 * hitting "Run now" on a disabled job can still poke it for debugging.
 *
 * Failure modes:
 *   - If the DB read errors, we LET THE REQUEST THROUGH. We don't want
 *     a Supabase blip to kill every cron — Vercel will treat the
 *     short-circuit as a genuine failure on retry, but the actual
 *     scheduled work would have run.
 *   - If no row matches the id/path, we LET IT THROUGH (treat absent =
 *     enabled by default). The admin can register the row from the
 *     panel.
 */
export async function checkCronEnabled(opts: {
  jobId?: string;
  path?: string;
  request?: { url: string };
}): Promise<Response | null> {
  // Manual override: panel "Run now" buttons send this. We accept it
  // even on a disabled job so admins can debug.
  if (opts.request?.url) {
    try {
      const u = new URL(opts.request.url);
      const triggeredBy = u.searchParams.get("triggered_by");
      const secret = u.searchParams.get("secret");
      const expected = process.env.CRON_SECRET;
      if (
        triggeredBy === "manual" &&
        expected &&
        secret &&
        secret === expected
      ) {
        return null;
      }
    } catch {
      // bad URL — fall through to the DB check
    }
  }

  if (!opts.jobId && !opts.path) return null;

  try {
    const admin = createAdminClient();
    let q = admin.from("cron_jobs").select("id, enabled").limit(1);
    if (opts.jobId) q = q.eq("id", opts.jobId);
    else if (opts.path) q = q.eq("path", opts.path);
    const { data, error } = await q.maybeSingle();
    if (error) return null; // fail-open
    if (!data) return null; // unregistered — let it run
    if (data.enabled) return null;
    return new Response(
      JSON.stringify({
        ok: false,
        skipped: true,
        reason: "cron_jobs row marked enabled=false",
        job: data.id,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch {
    return null; // fail-open
  }
}

/**
 * True when the request looks like a manual "Run now" admin trigger
 * (matching the secret env). Cron routes that already authenticate via
 * `Authorization: Bearer <CRON_SECRET>` can call this in addition to
 * accept the query-string form coming from the admin panel.
 */
export function isManualAdminTrigger(req: { url: string }): boolean {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("triggered_by") !== "manual") return false;
    const expected = process.env.CRON_SECRET;
    const provided = u.searchParams.get("secret");
    return Boolean(expected && provided && expected === provided);
  } catch {
    return false;
  }
}
