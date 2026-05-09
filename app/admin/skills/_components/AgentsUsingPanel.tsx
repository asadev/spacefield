import Link from "next/link";

import type { AiAgentRow } from "../../_types";

/**
 * Server component. Caller passes the agents that include this skill in
 * their allowed_skills list — we just render the list with cross-links
 * to the agents admin page.
 */

export type AgentsUsingPanelProps = {
  skillId: string;
  agents: Pick<
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
};

const STATUS_STYLES: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-500",
  draft: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disabled: "bg-rose-500/15 text-rose-500",
};

export default function AgentsUsingPanel({
  skillId,
  agents,
}: AgentsUsingPanelProps) {
  if (agents.length === 0) {
    return (
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">
            Agents using this skill
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            No agents reference{" "}
            <code className="font-mono text-app">{skillId}</code> in their
            allowed_skills list. Add it from{" "}
            <Link
              href="/admin/agents"
              className="text-tool-accent hover:opacity-80"
            >
              /admin/agents
            </Link>
            .
          </p>
        </header>
      </section>
    );
  }

  // Hide the internal global-overrides anchor row.
  const visible = agents.filter((a) => a.id !== "__global__");

  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
      <header>
        <h2 className="text-sm font-semibold text-app">
          Agents using this skill{" "}
          <span className="ml-1 text-[11px] font-normal text-muted">
            ({visible.length})
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          These agents include{" "}
          <code className="font-mono text-app">{skillId}</code> in their
          allowed_skills list. Click through to view or edit any of them.
        </p>
      </header>
      <ul className="space-y-1.5">
        {visible.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app p-2.5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/agents/${encodeURIComponent(a.id)}`}
                  className="font-medium text-app hover:text-tool-accent"
                >
                  {a.display_name}
                </Link>
                <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-[11px] text-secondary">
                  {a.id}
                </code>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    STATUS_STYLES[a.status] ??
                    "bg-app text-faint border border-app"
                  }`}
                >
                  {a.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-secondary">
                  {a.kind}
                </span>
                <span>{a.model}</span>
                <span>·</span>
                <span>{Array.isArray(a.allowed_skills) ? a.allowed_skills.length : 0} skills allowed</span>
              </div>
            </div>
            <Link
              href={`/admin/agents/${encodeURIComponent(a.id)}`}
              className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
            >
              Open agent
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
