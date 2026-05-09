import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { readCodeSkillTools, readSkillSource } from "@/lib/agent/skills/_inspector";

import { formatDateTime } from "../../_lib";
import type {
  AgentToolOverrideRow,
  AiAgentRow,
  AiAgentRunRow,
  AiSkillRow,
} from "../../_types";
import { deleteSkill, setSkillStatus, updateSkill } from "../_actions";
import AgentsUsingPanel from "../_components/AgentsUsingPanel";
import KindChip from "../_components/KindChip";
import RecentRunsPanel from "../_components/RecentRunsPanel";
import SkillForm from "../_components/SkillForm";
import SourceCodePanel from "../_components/SourceCodePanel";
import StatusChip from "../_components/StatusChip";
import TestRunnerPanel from "../_components/TestRunnerPanel";
import ToolOverridesPanel from "../_components/ToolOverridesPanel";

export const dynamic = "force-dynamic";

const RUNS_LIMIT = 50;
const GLOBAL_AGENT_ID = "__global__";

export default async function AdminSkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const admin = createAdminClient();

  // Skill row
  const { data: skillData, error: skillErr } = await admin
    .from("ai_skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (skillErr) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load skill: {skillErr.message}
      </div>
    );
  }
  const skill = skillData as AiSkillRow | null;
  if (!skill) notFound();

  const isCode = skill.kind === "code";

  // Source code (for code skills)
  const sourceInfo = isCode
    ? await readSkillSource(skill.id, skill.handler_module ?? null)
    : null;
  const codeRegistry = isCode ? await readCodeSkillTools(skill.id) : null;

  // Recent runs — best-effort tag match, then substring fallback.
  const sanitized = id.replace(/[%_\\]/g, "\\$&");
  const [{ data: taggedRuns }, { data: substringRuns }, { data: agentsData }, { data: overridesData }] =
    await Promise.all([
      admin
        .from("ai_agent_runs")
        .select(
          "id, agent_id, channel, status, input_excerpt, output_excerpt, duration_ms, model, created_at"
        )
        .filter("metadata->>skill_id", "eq", id)
        .order("created_at", { ascending: false })
        .limit(RUNS_LIMIT),
      admin
        .from("ai_agent_runs")
        .select(
          "id, agent_id, channel, status, input_excerpt, output_excerpt, duration_ms, model, created_at"
        )
        .ilike("input_excerpt", `%${sanitized}%`)
        .order("created_at", { ascending: false })
        .limit(RUNS_LIMIT),
      admin
        .from("ai_agents")
        .select(
          "id, display_name, kind, model, status, allowed_skills, sort_order, updated_at"
        )
        .filter("allowed_skills", "cs", JSON.stringify([id]))
        .order("status", { ascending: true })
        .order("display_name", { ascending: true }),
      admin
        .from("agent_tool_overrides")
        .select("*")
        .eq("agent_id", GLOBAL_AGENT_ID)
        .eq("skill_id", id),
    ]);

  // Merge runs (preferring tagged ones first, deduping on id).
  type RunRow = Pick<
    AiAgentRunRow,
    | "id"
    | "agent_id"
    | "channel"
    | "status"
    | "input_excerpt"
    | "output_excerpt"
    | "duration_ms"
    | "model"
    | "created_at"
  >;
  const tagged = (taggedRuns ?? []) as RunRow[];
  const substring = (substringRuns ?? []) as RunRow[];
  const seenRuns = new Set(tagged.map((r) => r.id));
  const mergedRuns = [...tagged];
  for (const r of substring) {
    if (seenRuns.has(r.id)) continue;
    mergedRuns.push(r);
    seenRuns.add(r.id);
    if (mergedRuns.length >= RUNS_LIMIT) break;
  }
  mergedRuns.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const agents = (agentsData ?? []) as Pick<
    AiAgentRow,
    | "id"
    | "display_name"
    | "kind"
    | "model"
    | "status"
    | "allowed_skills"
    | "sort_order"
    | "updated_at"
  >[];
  const overrides = (overridesData ?? []) as AgentToolOverrideRow[];

  // Tool names for the test runner picker.
  const toolNames = isCode
    ? (codeRegistry?.tools.map((t) => t.name) ?? [])
    : skill.tools_json.map((t) => t.name);

  // Quick status flip — same UX as the agents page.
  const nextStatus = (
    {
      live: "disabled",
      draft: "live",
      disabled: "draft",
    } as const
  )[skill.status];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/skills"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Skills
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {skill.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {skill.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {skill.id}
              </code>
              <KindChip kind={skill.kind} />
              <StatusChip status={skill.status} />
              <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                {skill.category}
              </span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(skill.updated_at)}</span>
            </div>
          </div>

          {/* Quick status flip */}
          <form action={setSkillStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={skill.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              {skill.status === "live"
                ? "Disable"
                : skill.status === "draft"
                  ? "Publish (live)"
                  : "Move to draft"}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor column */}
        <div className="min-w-0 space-y-6">
          {isCode && (
            <div className="rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-4 text-xs text-app">
              <strong className="font-semibold">Code-defined skill.</strong>{" "}
              The handler lives at{" "}
              <code className="font-mono">{skill.handler_module}</code>. You
              can edit metadata (display name, description, system fragment,
              category, status, role gates, sort order, icon) and add
              global tool overrides below — but the tool implementations
              themselves are locked to source. To deprecate this skill,
              set status to <em>disabled</em>.
            </div>
          )}

          <SkillForm mode="edit" action={updateSkill} skill={skill} />

          {/* Source-code panel — only meaningful for code skills, but always rendered for kind hint. */}
          <SourceCodePanel
            kind={skill.kind}
            handlerModule={skill.handler_module}
            path={sourceInfo?.relPath ?? null}
            source={sourceInfo?.source ?? null}
          />

          {/* Tool override panel — code skills only */}
          {isCode && codeRegistry && (
            <ToolOverridesPanel
              skillId={skill.id}
              sourceTools={codeRegistry.tools.map((t) => ({
                name: t.name,
                description: t.description,
                read_only: t.read_only,
                required_role: t.required_role,
              }))}
              overrides={overrides}
            />
          )}

          {/* Test runner — works for both kinds */}
          <TestRunnerPanel skill={skill} toolNames={toolNames} />

          {/* Agents using this skill */}
          <AgentsUsingPanel skillId={skill.id} agents={agents} />

          {/* Recent runs */}
          <RecentRunsPanel skillId={skill.id} runs={mergedRuns} />

          {/* Danger zone — only meaningful for custom skills. */}
          {!isCode && (
            <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
              <header>
                <h2 className="text-sm font-semibold text-rose-500">
                  Danger zone
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Hard delete removes the row and any tools defined under it.
                  Code-defined skills can never be deleted from this panel —
                  they&apos;re owned by source.
                </p>
              </header>
              <form action={deleteSkill}>
                <input type="hidden" name="id" value={skill.id} />
                <button
                  type="submit"
                  className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
                >
                  Delete skill
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Sidebar — at-a-glance summary. */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Summary</h2>
              <p className="mt-0.5 text-xs text-muted">
                What the runtime sees for this skill.
              </p>
            </header>

            <dl className="space-y-2 text-xs">
              <Detail label="Kind">
                <KindChip kind={skill.kind} />
              </Detail>
              <Detail label="Status">
                <StatusChip status={skill.status} />
              </Detail>
              <Detail label="Category">
                <span className="text-app">{skill.category}</span>
              </Detail>
              <Detail label="Sort order">
                <span className="font-mono text-app">{skill.sort_order}</span>
              </Detail>
              <Detail label="Tools">
                {skill.kind === "code" ? (
                  <span className="font-mono text-app">
                    {codeRegistry?.tools.length ?? 0} (source)
                  </span>
                ) : (
                  <span className="font-mono text-app">
                    {Array.isArray(skill.tools_json)
                      ? skill.tools_json.length
                      : 0}
                  </span>
                )}
              </Detail>
              <Detail label="Overrides">
                <span className="font-mono text-app">{overrides.length}</span>
              </Detail>
              <Detail label="Confirms">
                <span
                  className={
                    skill.requires_confirmation_default
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-faint"
                  }
                >
                  {skill.requires_confirmation_default
                    ? "yes (default)"
                    : "per-tool"}
                </span>
              </Detail>
              <Detail label="Roles">
                <span className="font-mono text-[11px] text-app">
                  {Array.isArray(skill.allowed_workspace_roles) &&
                  skill.allowed_workspace_roles.length > 0
                    ? skill.allowed_workspace_roles.join(", ")
                    : "—"}
                </span>
              </Detail>
              {skill.handler_module && (
                <Detail label="Module">
                  <code className="font-mono text-[11px] text-app">
                    {skill.handler_module}
                  </code>
                </Detail>
              )}
              <Detail label="Agents using">
                <span className="font-mono text-app">
                  {agents.filter((a) => a.id !== GLOBAL_AGENT_ID).length}
                </span>
              </Detail>
              <Detail label="Recent runs">
                <span className="font-mono text-app">{mergedRuns.length}</span>
              </Detail>
            </dl>
          </section>

          {!isCode && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-2">
                <h2 className="text-sm font-semibold text-app">
                  Runtime dispatch
                </h2>
              </header>
              <p className="text-[11px] leading-relaxed text-muted">
                Each tool defined below is exposed to the agent with its
                JSON schema. When the model calls a tool, the runtime
                validates the input, then either invokes the named Postgres
                RPC with a JSONB arg or POSTs the input to the HTTPS
                handler URL with an HMAC signature header. Return value
                is forwarded to the model.
              </p>
            </section>
          )}

          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-2">
              <h2 className="text-sm font-semibold text-app">
                API endpoints
              </h2>
            </header>
            <ul className="space-y-1.5 text-[11px] text-secondary">
              <li>
                <code className="font-mono text-app">GET</code>{" "}
                <code className="font-mono">/api/admin/skills/{skill.id}/source</code>
              </li>
              <li>
                <code className="font-mono text-app">GET</code>{" "}
                <code className="font-mono">/api/admin/skills/{skill.id}/runs</code>
              </li>
              <li>
                <code className="font-mono text-app">GET</code>{" "}
                <code className="font-mono">/api/admin/skills/{skill.id}/agents</code>
              </li>
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Read-only mirrors of the panels above for ops scripts. All
              admin-gated.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
