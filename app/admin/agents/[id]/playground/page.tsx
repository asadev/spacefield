import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../../_lib";
import type { AiAgentRow } from "../../../_types";
import AgentPlaygroundChat from "./_chat";

export const dynamic = "force-dynamic";

/**
 * Live test playground for a specific agent. Renders the agent header,
 * a quick-reference panel for the system prompt + access mode, and the
 * client-side chat widget. The chat hits
 * `/api/admin/playground/agent-run` which calls Anthropic with the
 * agent's `system_prompt` + `model`.
 */
export default async function AdminAgentPlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminDb = createAdminClient();
  const { data: agentData, error } = await adminDb
    .from("ai_agents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load agent: {error.message}
      </div>
    );
  }
  const agent = agentData as AiAgentRow | null;
  if (!agent) notFound();

  const apiKeyConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/agents/${encodeURIComponent(agent.id)}`}
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← {agent.display_name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              Playground · {agent.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              Live chat with the agent&rsquo;s configured system prompt + model.
              Useful for sanity-checking edits before publishing.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {agent.id}
              </code>
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {agent.model}
              </code>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(agent.updated_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/agents/${encodeURIComponent(agent.id)}`}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              Edit agent
            </Link>
            <Link
              href="/admin/playground"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              All playgrounds
            </Link>
          </div>
        </div>
      </div>

      {!apiKeyConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <div className="font-semibold">No Anthropic API key configured.</div>
          <p className="mt-1 text-xs">
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> in the
            server environment to enable live runs. The chat will return a
            friendly error otherwise.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <AgentPlaygroundChat
            agentId={agent.id}
            agentName={agent.display_name}
            greeting={agent.greeting || null}
            model={agent.model}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Configuration</h2>
              <p className="mt-0.5 text-xs text-muted">
                What the playground sends. Edit the agent to change.
              </p>
            </header>
            <dl className="space-y-2 text-xs">
              <Detail label="Model">
                <code className="font-mono text-app">{agent.model}</code>
              </Detail>
              <Detail label="Temperature">
                <span className="font-mono text-app">{agent.temperature}</span>
              </Detail>
              <Detail label="Max tokens">
                <span className="font-mono text-app">{agent.max_tokens}</span>
              </Detail>
              <Detail label="Kind">
                <span className="font-mono text-app">{agent.kind}</span>
              </Detail>
              <Detail label="Status">
                <span className="font-mono text-app">{agent.status}</span>
              </Detail>
              <Detail label="Skills">
                <span className="font-mono text-app">
                  {(agent.allowed_skills ?? []).length}
                </span>
              </Detail>
            </dl>
          </section>

          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">System prompt</h2>
              <p className="mt-0.5 text-xs text-muted">
                Read-only. {agent.system_prompt.length} chars.
              </p>
            </header>
            <pre className="max-h-72 overflow-auto rounded-md border border-app bg-app p-3 font-mono text-[11px] leading-relaxed text-secondary">
              {agent.system_prompt || "(no system prompt)"}
            </pre>
          </section>

          {agent.greeting && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-2">
                <h2 className="text-sm font-semibold text-app">Greeting</h2>
              </header>
              <p className="whitespace-pre-wrap text-xs text-secondary">
                {agent.greeting}
              </p>
            </section>
          )}
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
