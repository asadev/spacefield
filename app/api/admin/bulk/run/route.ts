import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { runBulk } from "@/lib/bulk";
import { createAdminClient } from "@/lib/supabase/admin";

import { recordAdminAction } from "@/app/admin/_audit";
import { assertAdmin, fetchAuthUsersByIds } from "@/app/admin/_lib";
import type { BulkOperationRow } from "@/app/admin/_types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/bulk/run
 *
 * Body: { scope: string, action_id: string, target_ids: string[] }
 *
 * Dispatches bulk actions identified by `(scope, action_id)`. Currently
 * supported:
 *
 *   users / set_tier_pro
 *   users / set_tier_team
 *   users / set_tier_free
 *   users / send_password_reset
 *   users / export_csv
 *
 * New actions are added by extending DISPATCH below. Every dispatch
 * uses `runBulk()` so one row is recorded in `bulk_operations` per
 * invocation, except for `export_csv` which is a synchronous read and
 * streams the file back to the browser.
 */

const MAX_TARGETS = 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BulkRunBody {
  scope?: string;
  action_id?: string;
  target_ids?: unknown;
}

interface JsonRunResult {
  ok: true;
  scope: string;
  action_id: string;
  total: number;
  succeeded: number;
  failed: number;
  bulk_operation_id: string | null;
  summary: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  let auth: { userId: string; email: string | null };
  try {
    auth = await assertAdmin();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "forbidden" },
      { status: 401 }
    );
  }

  let body: BulkRunBody;
  try {
    body = (await req.json()) as BulkRunBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 }
    );
  }

  const scope = String(body.scope ?? "").trim();
  const actionId = String(body.action_id ?? "").trim();
  const idsRaw = Array.isArray(body.target_ids) ? body.target_ids : [];
  const targetIds = uniqueStrings(idsRaw).slice(0, MAX_TARGETS);

  if (!scope) {
    return NextResponse.json(
      { ok: false, error: "missing scope" },
      { status: 400 }
    );
  }
  if (!actionId) {
    return NextResponse.json(
      { ok: false, error: "missing action_id" },
      { status: 400 }
    );
  }
  if (targetIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no target_ids" },
      { status: 400 }
    );
  }

  const handler = DISPATCH[scope]?.[actionId];
  if (!handler) {
    return NextResponse.json(
      {
        ok: false,
        error: `unknown action: ${scope}/${actionId}`,
      },
      { status: 400 }
    );
  }

  // Top-level audit row — the per-id writes are tracked in
  // bulk_operations.results, this is the gateway record.
  await recordAdminAction({
    action: "bulk.run",
    targetType: handler.target_kind,
    metadata: {
      scope,
      action_id: actionId,
      total: targetIds.length,
    },
  });

  try {
    const result = await handler.run({
      actorId: auth.userId,
      actorEmail: auth.email,
      scope,
      actionId,
      targetIds,
    });

    if (result.kind === "file") {
      return new Response(result.body, {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${result.filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // JSON success.
    return NextResponse.json(result.payload satisfies JsonRunResult);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

/* ──────────────────── dispatch table ──────────────────── */

interface HandlerArgs {
  actorId: string;
  actorEmail: string | null;
  scope: string;
  actionId: string;
  targetIds: string[];
}

type HandlerResult =
  | { kind: "json"; payload: JsonRunResult }
  | {
      kind: "file";
      contentType: string;
      filename: string;
      body: string;
    };

interface ActionHandler {
  /** Used for `bulk_operations.target_kind`. */
  target_kind: string;
  run: (args: HandlerArgs) => Promise<HandlerResult>;
}

const DISPATCH: Record<string, Record<string, ActionHandler>> = {
  users: {
    set_tier_pro: setUserTierHandler("pro"),
    set_tier_team: setUserTierHandler("team"),
    set_tier_free: setUserTierHandler("free"),
    send_password_reset: {
      target_kind: "user",
      async run(args) {
        const admin = createAdminClient();
        const userMap = await fetchAuthUsersByIds(args.targetIds);
        const op = await runBulk({
          operation: "user.send_password_reset",
          target_kind: "user",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
          },
          run: async (id) => {
            if (!UUID_RE.test(id)) {
              return { ok: false, error: "invalid user id" };
            }
            const lite = userMap.get(id);
            const email = lite?.email ?? null;
            if (!email) return { ok: false, error: "no email on file" };
            const { error } = await admin.auth.admin.generateLink({
              type: "recovery",
              email,
            });
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          },
        });
        return jsonResultFromBulk(args, op);
      },
    },
    export_csv: {
      target_kind: "user",
      async run(args) {
        const admin = createAdminClient();

        // Pull profile + subscription metadata for the selection in two
        // round-trips, then resolve auth emails (no batch endpoint).
        const [profilesRes, subsRes, authMap] = await Promise.all([
          admin
            .from("profiles")
            .select(
              "user_id, username, full_name, designation, is_admin, created_at"
            )
            .in("user_id", args.targetIds),
          admin
            .from("subscriptions")
            .select("user_id, tier_id, status, updated_at")
            .in("user_id", args.targetIds),
          fetchAuthUsersByIds(args.targetIds),
        ]);

        type ProfileLite = {
          user_id: string;
          username: string | null;
          full_name: string | null;
          designation: string | null;
          is_admin: boolean | null;
          created_at: string | null;
        };
        type SubLite = {
          user_id: string;
          tier_id: string | null;
          status: string | null;
          updated_at: string | null;
        };

        const profiles = new Map<string, ProfileLite>(
          ((profilesRes.data ?? []) as ProfileLite[]).map((p) => [
            p.user_id,
            p,
          ])
        );
        const subs = new Map<string, SubLite>(
          ((subsRes.data ?? []) as SubLite[]).map((s) => [s.user_id, s])
        );

        const header = [
          "user_id",
          "email",
          "full_name",
          "username",
          "designation",
          "tier_id",
          "subscription_status",
          "is_admin",
          "created_at",
        ];

        const lines: string[] = [header.join(",")];
        for (const id of args.targetIds) {
          const p = profiles.get(id);
          const s = subs.get(id);
          const a = authMap.get(id);
          lines.push(
            [
              id,
              a?.email ?? "",
              p?.full_name ?? "",
              p?.username ?? "",
              p?.designation ?? "",
              s?.tier_id ?? "",
              s?.status ?? "",
              p?.is_admin ? "true" : "false",
              a?.created_at ?? p?.created_at ?? "",
            ]
              .map(csvCell)
              .join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";

        // Record a synthetic bulk row so the export shows up in /admin/bulk.
        await runBulk({
          operation: "user.export_csv",
          target_kind: "user",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
            rows: args.targetIds.length,
          },
          run: async () => ({ ok: true }),
          concurrency: 25,
        });

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return {
          kind: "file",
          contentType: "text/csv;charset=utf-8",
          filename: `users-${stamp}.csv`,
          body: csv,
        };
      },
    },
  },
};

function setUserTierHandler(tier: string): ActionHandler {
  return {
    target_kind: "user",
    async run(args) {
      const admin = createAdminClient();
      const op = await runBulk({
        operation: `user.set_tier.${tier}`,
        target_kind: "user",
        target_ids: args.targetIds,
        actor_id: args.actorId,
        metadata: {
          scope: args.scope,
          action_id: args.actionId,
          tier_id: tier,
        },
        run: async (id) => {
          if (!UUID_RE.test(id)) {
            return { ok: false, error: "invalid user id" };
          }
          const { error } = await admin
            .from("subscriptions")
            .upsert(
              {
                user_id: id,
                tier_id: tier,
                status: "active",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
          if (error) return { ok: false, error: error.message };
          return { ok: true };
        },
      });

      // Surface the tier change in list pages.
      revalidatePath("/admin/users");
      revalidatePath("/admin/subscriptions");

      return jsonResultFromBulk(args, op);
    },
  };
}

/* ──────────────────── helpers ──────────────────── */

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function jsonResultFromBulk(
  args: HandlerArgs,
  op: BulkOperationRow
): HandlerResult {
  const summary =
    op.failed === 0
      ? `${args.actionId}: ${op.succeeded}/${op.total} succeeded.`
      : `${args.actionId}: ${op.succeeded} ok, ${op.failed} failed (of ${op.total}).`;
  return {
    kind: "json",
    payload: {
      ok: true,
      scope: args.scope,
      action_id: args.actionId,
      total: op.total,
      succeeded: op.succeeded,
      failed: op.failed,
      bulk_operation_id: op.id || null,
      summary,
    },
  };
}
