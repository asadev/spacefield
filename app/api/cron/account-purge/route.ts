import { NextResponse, type NextRequest } from "next/server";

import { requireCron } from "@/lib/cron/_check_enabled";
import { createAdminClient } from "@/lib/supabase/admin";
import { emit, OutboxEventTypes } from "@/lib/outbox";
import { log } from "@/lib/log";

/* GET /api/cron/account-purge
 *
 * Daily Vercel cron — calls public.hard_delete_expired_accounts(),
 * which removes auth.users rows whose account_deletion_requests row
 * has cancelled_at IS NULL and grace_until < now() (i.e. user
 * requested deletion at least 30 days ago and never cancelled).
 *
 * auth.users cascades delete to public.profiles + public.workspaces
 * (when the user is the workspaces.user_id owner) + anything else
 * with `references auth.users(id) on delete cascade`. The matching
 * account_deletion_requests row goes with it via its own cascade.
 *
 * Auth: see lib/cron/_check_enabled.ts → requireCron. Hard-fails when
 * CRON_SECRET is unset; otherwise timing-safe compares the Bearer
 * token (or ?token= query). No UA fallback.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const admin = createAdminClient();

  // Snapshot the about-to-be-purged users (id + grace_until) BEFORE the
  // RPC runs so we can fire the "final" deletion email. The cascade on
  // auth.users delete takes the account_deletion_requests row with it,
  // and we want to read the email from auth.users which also goes
  // away — so we resolve the email here too and pass it through the
  // outbox payload as a snapshot. If anything below fails we still let
  // the purge run; missing the courtesy email shouldn't strand the row.
  try {
    const { data: rows, error: selErr } = await admin
      .from("account_deletion_requests")
      .select("user_id, grace_until")
      .is("cancelled_at", null)
      .lt("grace_until", new Date().toISOString());
    if (!selErr && Array.isArray(rows) && rows.length > 0) {
      for (const r of rows as Array<{ user_id: string; grace_until: string }>) {
        try {
          const { data: u } = await admin.auth.admin.getUserById(r.user_id);
          const email = u?.user?.email ?? null;
          const meta = u?.user?.user_metadata as
            | { full_name?: string; name?: string }
            | undefined;
          const name = meta?.full_name ?? meta?.name ?? null;
          if (email) {
            void emit(
              OutboxEventTypes.AccountDeletionQueued,
              {
                user_id: r.user_id,
                grace_until: r.grace_until,
                kind: "final",
                email,
                name,
              },
              {
                // Stable per user — if we re-fire after a partial cron
                // failure the unique index drops the duplicate.
                dedupeKey: `account-deletion-final:${r.user_id}`,
              }
            );
          }
        } catch (e) {
          log.warn("account_purge.final_email_lookup_failed", {
            user_id: r.user_id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  } catch (e) {
    log.warn("account_purge.final_email_snapshot_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const { data, error } = await admin.rpc("hard_delete_expired_accounts");
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  return NextResponse.json({ ok: true, deleted });
}
