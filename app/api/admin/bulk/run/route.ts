import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { runBulk } from "@/lib/bulk";
import { safeErrorMessage } from "@/lib/safe-error";
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
 *   users      / set_tier_pro
 *   users      / set_tier_team
 *   users      / set_tier_free
 *   users      / send_password_reset
 *   users      / export_csv
 *
 *   workspaces / change_tier_pro
 *   workspaces / change_tier_free
 *   workspaces / delete
 *   workspaces / export_csv
 *
 *   agents     / set_status_disabled
 *   agents     / set_status_live
 *   agents     / set_status_draft
 *   agents     / delete
 *   agents     / export_csv
 *
 *   skills     / set_status_disabled
 *   skills     / set_status_live
 *   skills     / delete
 *   skills     / export_csv
 *
 *   apps       / toggle_publish
 *   apps       / set_access_admin_only
 *   apps       / set_access_authenticated
 *   apps       / export_csv
 *
 * New actions are added by extending DISPATCH below. Every dispatch
 * uses `runBulk()` so one row is recorded in `bulk_operations` per
 * invocation, except for `export_csv` which is a synchronous read and
 * streams the file back to the browser.
 */

const MAX_TARGETS = 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Slug shape for agents/skills/apps. Matches their text PK (snake/dash). */
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-.]{0,127}$/;

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
      {
        ok: false,
        error: safeErrorMessage(e, {
          source: "admin.bulk.run.auth",
          fallback: "forbidden",
        }),
      },
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
        error: safeErrorMessage(e, {
          source: "admin.bulk.run",
          userId: auth.userId,
          fallback: "bulk_run_failed",
        }),
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

  /* ──────────────────── workspaces ──────────────────── */
  workspaces: {
    change_tier_pro: changeWorkspaceTierHandler("pro"),
    change_tier_free: changeWorkspaceTierHandler("free"),
    delete: {
      target_kind: "workspace",
      async run(args) {
        const admin = createAdminClient();
        const op = await runBulk({
          operation: "workspace.delete",
          target_kind: "workspace",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
          },
          run: async (id) => {
            if (!UUID_RE.test(id)) {
              return { ok: false, error: "invalid workspace id" };
            }
            // Existence check — gives a clearer error than a silent no-op.
            const { data: existing, error: readErr } = await admin
              .from("workspaces")
              .select("id")
              .eq("id", id)
              .maybeSingle();
            if (readErr) return { ok: false, error: readErr.message };
            if (!existing) {
              return { ok: false, error: "workspace not found" };
            }
            const { error } = await admin
              .from("workspaces")
              .delete()
              .eq("id", id);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          },
        });
        revalidatePath("/admin/workspaces");
        return jsonResultFromBulk(args, op);
      },
    },
    export_csv: {
      target_kind: "workspace",
      async run(args) {
        const admin = createAdminClient();

        const { data: wsData } = await admin
          .from("workspaces")
          .select("id, user_id, name, created_at, updated_at")
          .in("id", args.targetIds);

        type WsLite = {
          id: string;
          user_id: string;
          name: string;
          created_at: string | null;
          updated_at: string | null;
        };
        const workspaces = (wsData ?? []) as WsLite[];
        const wsMap = new Map<string, WsLite>(workspaces.map((w) => [w.id, w]));
        const ownerIds = Array.from(new Set(workspaces.map((w) => w.user_id)));

        const [memberCountsRes, storageStatsRes, profilesRes, subsRes, authMap] =
          await Promise.all([
            args.targetIds.length
              ? admin.rpc("admin_workspace_member_counts", {
                  p_workspace_ids: args.targetIds,
                })
              : Promise.resolve({
                  data: [] as Array<{
                    workspace_id: string;
                    members: number;
                  }>,
                  error: null,
                }),
            args.targetIds.length
              ? admin.rpc("admin_workspace_storage_stats", {
                  p_workspace_ids: args.targetIds,
                })
              : Promise.resolve({
                  data: [] as Array<{
                    workspace_id: string;
                    files_count: number;
                    total_bytes: number;
                  }>,
                  error: null,
                }),
            ownerIds.length
              ? admin
                  .from("profiles")
                  .select("user_id, full_name, username")
                  .in("user_id", ownerIds)
              : Promise.resolve({
                  data: [] as Array<{
                    user_id: string;
                    full_name: string | null;
                    username: string | null;
                  }>,
                  error: null,
                }),
            ownerIds.length
              ? admin
                  .from("subscriptions")
                  .select("user_id, tier_id, status")
                  .in("user_id", ownerIds)
              : Promise.resolve({
                  data: [] as Array<{
                    user_id: string;
                    tier_id: string | null;
                    status: string | null;
                  }>,
                  error: null,
                }),
            fetchAuthUsersByIds(ownerIds),
          ]);

        const memberCounts = new Map<string, number>();
        for (const r of (memberCountsRes.data ?? []) as Array<{
          workspace_id: string;
          members: number;
        }>) {
          memberCounts.set(r.workspace_id, Number(r.members));
        }

        const storageBytes = new Map<string, number>();
        const filesCount = new Map<string, number>();
        for (const r of (storageStatsRes.data ?? []) as Array<{
          workspace_id: string;
          total_bytes: number;
          files_count: number;
        }>) {
          storageBytes.set(r.workspace_id, Number(r.total_bytes));
          filesCount.set(r.workspace_id, Number(r.files_count));
        }

        const profiles = new Map(
          (
            (profilesRes.data ?? []) as Array<{
              user_id: string;
              full_name: string | null;
              username: string | null;
            }>
          ).map((p) => [p.user_id, p])
        );
        const subs = new Map(
          (
            (subsRes.data ?? []) as Array<{
              user_id: string;
              tier_id: string | null;
              status: string | null;
            }>
          ).map((s) => [s.user_id, s])
        );

        const header = [
          "workspace_id",
          "name",
          "owner_user_id",
          "owner_email",
          "owner_full_name",
          "owner_username",
          "owner_tier_id",
          "owner_subscription_status",
          "members",
          "files_count",
          "storage_bytes",
          "created_at",
          "updated_at",
        ];

        const lines: string[] = [header.join(",")];
        for (const id of args.targetIds) {
          const w = wsMap.get(id);
          const ownerId = w?.user_id ?? "";
          const p = ownerId ? profiles.get(ownerId) : null;
          const s = ownerId ? subs.get(ownerId) : null;
          const a = ownerId ? authMap.get(ownerId) : null;
          lines.push(
            [
              id,
              w?.name ?? "",
              ownerId,
              a?.email ?? "",
              p?.full_name ?? "",
              p?.username ?? "",
              s?.tier_id ?? "",
              s?.status ?? "",
              memberCounts.get(id) ?? 0,
              filesCount.get(id) ?? 0,
              storageBytes.get(id) ?? 0,
              w?.created_at ?? "",
              w?.updated_at ?? "",
            ]
              .map(csvCell)
              .join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";

        await runBulk({
          operation: "workspace.export_csv",
          target_kind: "workspace",
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
          filename: `workspaces-${stamp}.csv`,
          body: csv,
        };
      },
    },
  },

  /* ──────────────────── agents ──────────────────── */
  agents: {
    set_status_disabled: setAgentStatusHandler("disabled"),
    set_status_live: setAgentStatusHandler("live"),
    set_status_draft: setAgentStatusHandler("draft"),
    delete: {
      target_kind: "ai_agent",
      async run(args) {
        const admin = createAdminClient();
        // Pre-fetch existing rows + recent run counts so the worker
        // can fail-soft per agent without N+1 reads.
        const { data: existingRows } = await admin
          .from("ai_agents")
          .select("id, status")
          .in("id", args.targetIds);
        type ExistingLite = { id: string; status: string };
        const existingMap = new Map<string, ExistingLite>(
          ((existingRows ?? []) as ExistingLite[]).map((r) => [r.id, r])
        );

        const since = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        const recentRunCounts = new Map<string, number>();
        // Best-effort: a single grouped query if the targets list is small.
        await Promise.all(
          args.targetIds.map(async (id) => {
            const { count } = await admin
              .from("ai_agent_runs")
              .select("id", { count: "exact", head: true })
              .eq("agent_id", id)
              .gte("created_at", since);
            recentRunCounts.set(id, count ?? 0);
          })
        );

        const op = await runBulk({
          operation: "agent.delete",
          target_kind: "ai_agent",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
          },
          run: async (id) => {
            if (!SLUG_RE.test(id)) {
              return { ok: false, error: "invalid agent id" };
            }
            const existing = existingMap.get(id);
            if (!existing) return { ok: false, error: "agent not found" };
            if (existing.status !== "disabled") {
              return {
                ok: false,
                error: "agent must be disabled before deletion",
              };
            }
            const recent = recentRunCounts.get(id) ?? 0;
            if (recent > 0) {
              return {
                ok: false,
                error: `agent has ${recent} runs in the last 30 days; cannot delete`,
              };
            }
            const { error } = await admin
              .from("ai_agents")
              .delete()
              .eq("id", id);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          },
        });
        revalidatePath("/admin/agents");
        return jsonResultFromBulk(args, op);
      },
    },
    export_csv: {
      target_kind: "ai_agent",
      async run(args) {
        const admin = createAdminClient();
        const { data } = await admin
          .from("ai_agents")
          .select(
            "id, display_name, description, kind, model, fast_model, status, access_mode, sort_order, temperature, max_tokens, created_at, updated_at"
          )
          .in("id", args.targetIds);

        type AgentLite = {
          id: string;
          display_name: string | null;
          description: string | null;
          kind: string | null;
          model: string | null;
          fast_model: string | null;
          status: string | null;
          access_mode: string | null;
          sort_order: number | null;
          temperature: number | null;
          max_tokens: number | null;
          created_at: string | null;
          updated_at: string | null;
        };

        const map = new Map<string, AgentLite>(
          ((data ?? []) as AgentLite[]).map((r) => [r.id, r])
        );

        const header = [
          "id",
          "display_name",
          "description",
          "kind",
          "model",
          "fast_model",
          "status",
          "access_mode",
          "sort_order",
          "temperature",
          "max_tokens",
          "created_at",
          "updated_at",
        ];

        const lines: string[] = [header.join(",")];
        for (const id of args.targetIds) {
          const a = map.get(id);
          lines.push(
            [
              id,
              a?.display_name ?? "",
              a?.description ?? "",
              a?.kind ?? "",
              a?.model ?? "",
              a?.fast_model ?? "",
              a?.status ?? "",
              a?.access_mode ?? "",
              a?.sort_order ?? 0,
              a?.temperature ?? 0,
              a?.max_tokens ?? 0,
              a?.created_at ?? "",
              a?.updated_at ?? "",
            ]
              .map(csvCell)
              .join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";

        await runBulk({
          operation: "agent.export_csv",
          target_kind: "ai_agent",
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
          filename: `agents-${stamp}.csv`,
          body: csv,
        };
      },
    },
  },

  /* ──────────────────── skills ──────────────────── */
  skills: {
    set_status_disabled: setSkillStatusHandler("disabled"),
    set_status_live: setSkillStatusHandler("live"),
    delete: {
      target_kind: "ai_skill",
      async run(args) {
        const admin = createAdminClient();
        const { data: existingRows } = await admin
          .from("ai_skills")
          .select("id, kind")
          .in("id", args.targetIds);
        type ExistingLite = { id: string; kind: string };
        const existingMap = new Map<string, ExistingLite>(
          ((existingRows ?? []) as ExistingLite[]).map((r) => [r.id, r])
        );

        const op = await runBulk({
          operation: "skill.delete",
          target_kind: "ai_skill",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
          },
          run: async (id) => {
            if (!SLUG_RE.test(id)) {
              return { ok: false, error: "invalid skill id" };
            }
            const existing = existingMap.get(id);
            if (!existing) return { ok: false, error: "skill not found" };
            // Code skills are owned by source — rejected server-side.
            if (existing.kind === "code") {
              return {
                ok: false,
                error:
                  "code skills cannot be deleted from the admin panel",
              };
            }
            const { error } = await admin
              .from("ai_skills")
              .delete()
              .eq("id", id);
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          },
        });
        revalidatePath("/admin/skills");
        return jsonResultFromBulk(args, op);
      },
    },
    export_csv: {
      target_kind: "ai_skill",
      async run(args) {
        const admin = createAdminClient();
        const { data } = await admin
          .from("ai_skills")
          .select(
            "id, kind, display_name, description, status, category, sort_order, tools_json, requires_confirmation_default, created_at, updated_at"
          )
          .in("id", args.targetIds);

        type SkillLite = {
          id: string;
          kind: string | null;
          display_name: string | null;
          description: string | null;
          status: string | null;
          category: string | null;
          sort_order: number | null;
          tools_json: unknown;
          requires_confirmation_default: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };

        const map = new Map<string, SkillLite>(
          ((data ?? []) as SkillLite[]).map((r) => [r.id, r])
        );

        const header = [
          "id",
          "kind",
          "display_name",
          "description",
          "status",
          "category",
          "sort_order",
          "tool_count",
          "requires_confirmation_default",
          "created_at",
          "updated_at",
        ];

        const lines: string[] = [header.join(",")];
        for (const id of args.targetIds) {
          const s = map.get(id);
          const toolCount = Array.isArray(s?.tools_json)
            ? (s!.tools_json as unknown[]).length
            : 0;
          lines.push(
            [
              id,
              s?.kind ?? "",
              s?.display_name ?? "",
              s?.description ?? "",
              s?.status ?? "",
              s?.category ?? "",
              s?.sort_order ?? 0,
              toolCount,
              s?.requires_confirmation_default ? "true" : "false",
              s?.created_at ?? "",
              s?.updated_at ?? "",
            ]
              .map(csvCell)
              .join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";

        await runBulk({
          operation: "skill.export_csv",
          target_kind: "ai_skill",
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
          filename: `skills-${stamp}.csv`,
          body: csv,
        };
      },
    },
  },

  /* ──────────────────── apps ──────────────────── */
  apps: {
    toggle_publish: {
      target_kind: "app_registry",
      async run(args) {
        const admin = createAdminClient();
        // Pre-fetch current published bools so we can flip per row.
        const { data: rows } = await admin
          .from("app_registry")
          .select("id, published")
          .in("id", args.targetIds);
        type RowLite = { id: string; published: boolean };
        const map = new Map<string, RowLite>(
          ((rows ?? []) as RowLite[]).map((r) => [r.id, r])
        );

        const op = await runBulk({
          operation: "app.toggle_publish",
          target_kind: "app_registry",
          target_ids: args.targetIds,
          actor_id: args.actorId,
          metadata: {
            scope: args.scope,
            action_id: args.actionId,
          },
          run: async (id) => {
            if (!SLUG_RE.test(id)) {
              return { ok: false, error: "invalid app slug" };
            }
            const existing = map.get(id);
            if (!existing) return { ok: false, error: "app not found" };
            const next = !existing.published;
            const { error } = await admin
              .from("app_registry")
              .update({
                published: next,
                updated_by: args.actorId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, data: { published: next } };
          },
        });
        revalidatePath("/admin/apps");
        return jsonResultFromBulk(args, op);
      },
    },
    set_access_admin_only: setAppAccessHandler("admin_only"),
    set_access_authenticated: setAppAccessHandler("authenticated"),
    export_csv: {
      target_kind: "app_registry",
      async run(args) {
        const admin = createAdminClient();
        const { data } = await admin
          .from("app_registry")
          .select(
            "id, domain, title, description, category, published, access_mode, access_tiers, sort_order, created_at, updated_at"
          )
          .in("id", args.targetIds);

        type AppLite = {
          id: string;
          domain: string | null;
          title: string | null;
          description: string | null;
          category: string | null;
          published: boolean | null;
          access_mode: string | null;
          access_tiers: unknown;
          sort_order: number | null;
          created_at: string | null;
          updated_at: string | null;
        };

        const map = new Map<string, AppLite>(
          ((data ?? []) as AppLite[]).map((r) => [r.id, r])
        );

        const header = [
          "id",
          "domain",
          "title",
          "description",
          "category",
          "published",
          "access_mode",
          "access_tiers",
          "sort_order",
          "created_at",
          "updated_at",
        ];

        const lines: string[] = [header.join(",")];
        for (const id of args.targetIds) {
          const a = map.get(id);
          const tiers = Array.isArray(a?.access_tiers)
            ? (a!.access_tiers as unknown[]).join("|")
            : "";
          lines.push(
            [
              id,
              a?.domain ?? "",
              a?.title ?? "",
              a?.description ?? "",
              a?.category ?? "",
              a?.published ? "true" : "false",
              a?.access_mode ?? "",
              tiers,
              a?.sort_order ?? 0,
              a?.created_at ?? "",
              a?.updated_at ?? "",
            ]
              .map(csvCell)
              .join(",")
          );
        }
        const csv = lines.join("\r\n") + "\r\n";

        await runBulk({
          operation: "app.export_csv",
          target_kind: "app_registry",
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
          filename: `apps-${stamp}.csv`,
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

function changeWorkspaceTierHandler(tier: string): ActionHandler {
  return {
    target_kind: "workspace",
    async run(args) {
      const admin = createAdminClient();

      // Resolve owners up front; tier is per-user via subscriptions.
      const { data: wsRows } = await admin
        .from("workspaces")
        .select("id, user_id")
        .in("id", args.targetIds);
      type WsLite = { id: string; user_id: string };
      const ownerByWs = new Map<string, string>(
        ((wsRows ?? []) as WsLite[]).map((w) => [w.id, w.user_id])
      );

      const op = await runBulk({
        operation: `workspace.change_tier.${tier}`,
        target_kind: "workspace",
        target_ids: args.targetIds,
        actor_id: args.actorId,
        metadata: {
          scope: args.scope,
          action_id: args.actionId,
          tier_id: tier,
        },
        run: async (id) => {
          if (!UUID_RE.test(id)) {
            return { ok: false, error: "invalid workspace id" };
          }
          const ownerId = ownerByWs.get(id);
          if (!ownerId) return { ok: false, error: "workspace not found" };
          const { error } = await admin.from("subscriptions").upsert(
            {
              user_id: ownerId,
              tier_id: tier,
              status: "active",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
          if (error) return { ok: false, error: error.message };
          return { ok: true, data: { owner_id: ownerId, tier_id: tier } };
        },
      });

      revalidatePath("/admin/workspaces");
      revalidatePath("/admin/subscriptions");

      return jsonResultFromBulk(args, op);
    },
  };
}

function setAgentStatusHandler(
  status: "live" | "draft" | "disabled"
): ActionHandler {
  return {
    target_kind: "ai_agent",
    async run(args) {
      const admin = createAdminClient();
      const op = await runBulk({
        operation: `agent.set_status.${status}`,
        target_kind: "ai_agent",
        target_ids: args.targetIds,
        actor_id: args.actorId,
        metadata: {
          scope: args.scope,
          action_id: args.actionId,
          status,
        },
        run: async (id) => {
          if (!SLUG_RE.test(id)) {
            return { ok: false, error: "invalid agent id" };
          }
          // Fail-soft: require the row exists; surfaces unknown ids clearly.
          const { data: existing, error: readErr } = await admin
            .from("ai_agents")
            .select("id, status")
            .eq("id", id)
            .maybeSingle();
          if (readErr) return { ok: false, error: readErr.message };
          if (!existing) return { ok: false, error: "agent not found" };
          const { error } = await admin
            .from("ai_agents")
            .update({
              status,
              updated_by: args.actorId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
          if (error) return { ok: false, error: error.message };
          return { ok: true, data: { status } };
        },
      });
      revalidatePath("/admin/agents");
      return jsonResultFromBulk(args, op);
    },
  };
}

function setSkillStatusHandler(
  status: "live" | "draft" | "disabled"
): ActionHandler {
  return {
    target_kind: "ai_skill",
    async run(args) {
      const admin = createAdminClient();
      const op = await runBulk({
        operation: `skill.set_status.${status}`,
        target_kind: "ai_skill",
        target_ids: args.targetIds,
        actor_id: args.actorId,
        metadata: {
          scope: args.scope,
          action_id: args.actionId,
          status,
        },
        run: async (id) => {
          if (!SLUG_RE.test(id)) {
            return { ok: false, error: "invalid skill id" };
          }
          const { data: existing, error: readErr } = await admin
            .from("ai_skills")
            .select("id")
            .eq("id", id)
            .maybeSingle();
          if (readErr) return { ok: false, error: readErr.message };
          if (!existing) return { ok: false, error: "skill not found" };
          const { error } = await admin
            .from("ai_skills")
            .update({
              status,
              updated_by: args.actorId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
          if (error) return { ok: false, error: error.message };
          return { ok: true, data: { status } };
        },
      });
      revalidatePath("/admin/skills");
      return jsonResultFromBulk(args, op);
    },
  };
}

function setAppAccessHandler(
  accessMode: "admin_only" | "authenticated"
): ActionHandler {
  return {
    target_kind: "app_registry",
    async run(args) {
      const admin = createAdminClient();
      const op = await runBulk({
        operation: `app.set_access.${accessMode}`,
        target_kind: "app_registry",
        target_ids: args.targetIds,
        actor_id: args.actorId,
        metadata: {
          scope: args.scope,
          action_id: args.actionId,
          access_mode: accessMode,
        },
        run: async (id) => {
          if (!SLUG_RE.test(id)) {
            return { ok: false, error: "invalid app slug" };
          }
          const { data: existing, error: readErr } = await admin
            .from("app_registry")
            .select("id")
            .eq("id", id)
            .maybeSingle();
          if (readErr) return { ok: false, error: readErr.message };
          if (!existing) return { ok: false, error: "app not found" };
          const { error } = await admin
            .from("app_registry")
            .update({
              access_mode: accessMode,
              updated_by: args.actorId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
          if (error) return { ok: false, error: error.message };
          return { ok: true, data: { access_mode: accessMode } };
        },
      });
      revalidatePath("/admin/apps");
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
