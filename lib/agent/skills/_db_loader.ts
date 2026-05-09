/* DB-driven skill loader.
 *
 * Reads `public.ai_skills` (status='live' only) and produces the same
 * SkillDefinition[] shape the runtime already consumes from ALL_SKILLS.
 *
 *   kind='code'   → handler/tools come from the static import in
 *                   ALL_SKILLS (matched by id). DB metadata
 *                   (system_fragment, description, label) is merged on
 *                   top so admins can tweak prompt without touching
 *                   source.
 *   kind='custom' → handler is a generic dispatcher built from
 *                   tools_json. Each tool's input is validated by the
 *                   model (JSON-schema), then dispatched to the
 *                   configured Postgres RPC or HTTPS endpoint.
 *
 * Caches the merged result in-process for 60s. Falls back to the
 * code-defined ALL_SKILLS on any error (DB down, bad row shape, etc.) so
 * the agent runtime can never lose its skill catalog.
 */

import { createAdminClient } from "@/lib/supabase/admin";

import type {
  SkillDefinition,
  ToolDefinition,
  ToolExecuteResult,
  UserContext,
} from "@/lib/agent/runtime/types";
import type { AiSkillRow, SkillToolDef } from "@/app/admin/_types";

import { ALL_SKILLS } from "./index";
import { toolError, toolOk } from "./_helpers";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  skills: SkillDefinition[];
};

let cache: CacheEntry | null = null;
let inflight: Promise<SkillDefinition[]> | null = null;

/**
 * Public API. Returns the merged DB+code skill set, falling back to
 * ALL_SKILLS on any error. Multiple concurrent callers share a single
 * inflight DB read.
 */
export async function getSkillsFromDb(): Promise<SkillDefinition[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.skills;
  }
  if (inflight) return inflight;

  inflight = loadAndCache(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Bust the cache (call after admin writes). Optional helper. */
export function invalidateSkillsCache(): void {
  cache = null;
}

async function loadAndCache(now: number): Promise<SkillDefinition[]> {
  try {
    const merged = await loadFromDb();
    cache = {
      skills: merged,
      expiresAt: now + CACHE_TTL_MS,
    };
    return merged;
  } catch (e) {
    // Soft-fail: log once and use the static catalog. Cache the fallback
    // for the same TTL so we don't hammer a broken DB.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[skills/_db_loader] falling back to ALL_SKILLS:", e);
    }
    cache = {
      skills: ALL_SKILLS,
      expiresAt: now + CACHE_TTL_MS,
    };
    return ALL_SKILLS;
  }
}

async function loadFromDb(): Promise<SkillDefinition[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select(
      "id, kind, display_name, description, system_fragment, status, handler_module, tools_json"
    )
    .eq("status", "live")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`ai_skills read failed: ${error.message}`);

  const rows = (data ?? []) as Pick<
    AiSkillRow,
    | "id"
    | "kind"
    | "display_name"
    | "description"
    | "system_fragment"
    | "status"
    | "handler_module"
    | "tools_json"
  >[];

  // Map of code-defined skills by id, used for kind='code' merges.
  const byId = new Map(ALL_SKILLS.map((s) => [s.id, s]));

  const out: SkillDefinition[] = [];
  for (const r of rows) {
    if (r.kind === "code") {
      const base = byId.get(r.id);
      if (!base) {
        // DB row references a code skill that's no longer in ALL_SKILLS.
        // Skip — runtime can't dispatch tools we don't have handlers for.
        continue;
      }
      out.push({
        id: base.id,
        label: r.display_name || base.label,
        description: r.description || base.description,
        systemFragment: r.system_fragment || base.systemFragment,
        tools: base.tools,
      });
      continue;
    }

    // Custom skill — build dispatcher tools from tools_json.
    const tools = buildCustomTools(r.id, r.tools_json ?? []);
    out.push({
      id: r.id,
      label: r.display_name || r.id,
      description: r.description ?? "",
      systemFragment: r.system_fragment ?? "",
      tools,
    });
  }

  // Add any code skills that are not in the DB (fresh deploy with no
  // matching seed row) so the runtime never silently loses functionality.
  for (const code of ALL_SKILLS) {
    if (!rows.some((r) => r.id === code.id)) {
      out.push(code);
    }
  }

  return out;
}

/* ──────────────────────────── custom skill dispatcher ─────────────────────── */

function buildCustomTools(
  skillId: string,
  defs: SkillToolDef[]
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const def of defs) {
    if (!def || typeof def !== "object") continue;
    if (typeof def.name !== "string" || def.name.length === 0) continue;
    tools.push({
      name: def.name,
      description: def.description ?? "",
      input_schema: (def.input_schema ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      }) as Record<string, unknown>,
      read_only: Boolean(def.read_only),
      execute: makeCustomExecute(skillId, def),
    });
  }
  return tools;
}

function makeCustomExecute(
  skillId: string,
  def: SkillToolDef
): ToolDefinition["execute"] {
  return async (input: unknown, ctx: UserContext): Promise<ToolExecuteResult> => {
    if (def.handler_kind === "rpc") {
      return dispatchRpc(def, input, ctx);
    }
    if (def.handler_kind === "http") {
      return dispatchHttp(skillId, def, input, ctx);
    }
    return toolError(`unknown handler_kind for tool "${def.name}"`);
  };
}

async function dispatchRpc(
  def: SkillToolDef,
  input: unknown,
  ctx: UserContext
): Promise<ToolExecuteResult> {
  const target = (def.handler_target ?? "").trim();
  if (!target) return toolError("handler_target empty");
  // Use the caller-scoped client so RLS still applies inside the RPC.
  const payload = buildRpcPayload(input, def, ctx);
  try {
    const { data, error } = await ctx.supabase.rpc(target, payload);
    if (error) return toolError(error.message);
    return toolOk(data ?? null);
  } catch (e) {
    return toolError((e as Error).message);
  }
}

function buildRpcPayload(
  input: unknown,
  def: SkillToolDef,
  ctx: UserContext
): Record<string, unknown> {
  // Convention: pass the model's input as `args`, plus context the RPC
  // can use to enforce auth without trusting the model. RPCs that take a
  // single jsonb arg should accept the whole object; ones that take
  // named args should opt-in to the keys they care about.
  return {
    args: input,
    workspace_id: ctx.workspaceId,
    user_id: ctx.userId,
    role: ctx.role,
    tier: ctx.tier,
    handler_params: def.handler_params ?? null,
  };
}

async function dispatchHttp(
  skillId: string,
  def: SkillToolDef,
  input: unknown,
  ctx: UserContext
): Promise<ToolExecuteResult> {
  const url = (def.handler_target ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return toolError("handler_target is not an http(s) URL");
  }
  const body = JSON.stringify({
    skill_id: skillId,
    tool: def.name,
    input,
    context: {
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      role: ctx.role,
      tier: ctx.tier,
      channel: ctx.channel,
    },
    handler_params: def.handler_params ?? null,
  });

  // Optional HMAC signature when SKILLS_HTTP_HANDLER_SECRET is set.
  // Imported lazily so that deployments without crypto in their runtime
  // (edge?) don't crash on module load — getSkillsFromDb() is called
  // from server-only paths so dynamic require is safe.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "spacefield-skill-dispatcher/1.0",
  };
  const secret = process.env.SKILLS_HTTP_HANDLER_SECRET;
  if (secret) {
    try {
      const { createHmac } = await import("node:crypto");
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      headers["x-spacefield-signature"] = `sha256=${sig}`;
    } catch {
      // crypto not available in this runtime — ship without signature.
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return toolError(
        `handler returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const data = await res.json().catch(() => null);
      return toolOk(data);
    }
    const text = await res.text().catch(() => "");
    return toolOk(text);
  } catch (e) {
    return toolError((e as Error).message);
  }
}
