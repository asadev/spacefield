import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonGhostClass, inputClass } from "../../../_lib";
import { setUserAgentAllowlist } from "../../_actions";

type AgentRow = {
  id: string;
  display_name: string;
  description: string;
  status: string;
  kind: string;
  access_mode: string;
  allowlist_user_ids: unknown;
};

export default async function AgentsTab({
  userId,
  agentsQuery,
}: {
  userId: string;
  agentsQuery: string;
}) {
  const admin = createAdminClient();
  // Pull allowlist agents AND non-allowlist for visibility (read-only context).
  const { data } = await admin
    .from("ai_agents")
    .select(
      "id, display_name, description, status, kind, access_mode, allowlist_user_ids"
    )
    .order("display_name", { ascending: true });
  const all = (data ?? []) as AgentRow[];

  const allowlistAgents = all.filter((a) => a.access_mode === "allowlist");
  const otherAgents = all.filter((a) => a.access_mode !== "allowlist");

  const needle = agentsQuery.toLowerCase();
  const filteredAllowlist = needle
    ? allowlistAgents.filter(
        (a) =>
          a.id.toLowerCase().includes(needle) ||
          a.display_name.toLowerCase().includes(needle)
      )
    : allowlistAgents;

  const presence = (a: AgentRow): boolean => {
    const arr = Array.isArray(a.allowlist_user_ids)
      ? (a.allowlist_user_ids as unknown[])
      : [];
    return arr.some((v) => String(v) === userId);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">Allowlist agents</h2>
            <p className="mt-1 text-xs text-muted">
              Agents whose <code className="text-secondary">access_mode</code>
              {" "}is <code className="text-secondary">allowlist</code>. Toggle
              whether this user is in each agent&apos;s allowlist.
            </p>
          </div>
          <span className="text-[11px] text-muted">
            {allowlistAgents.length} allowlist agents · {otherAgents.length}{" "}
            other modes
          </span>
        </div>

        <form
          action={`/admin/users/${userId}`}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value="agents" />
          <label className="block text-xs flex-1 min-w-[16rem]">
            <span className="mb-1 block text-faint">Filter agents</span>
            <input
              name="agents_q"
              defaultValue={agentsQuery}
              placeholder="search by id or name"
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonGhostClass}>
            Filter
          </button>
          {agentsQuery && (
            <Link
              href={`/admin/users/${userId}?tab=agents`}
              className="text-[11px] text-muted underline"
            >
              Clear
            </Link>
          )}
        </form>

        <div className="mt-4 space-y-2">
          {filteredAllowlist.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              {allowlistAgents.length === 0
                ? "No agents are configured with access_mode=allowlist."
                : "No matches."}
            </div>
          ) : (
            filteredAllowlist.map((a) => {
              const present = presence(a);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/agents/${encodeURIComponent(a.id)}`}
                        className="truncate text-sm text-app hover:text-tool-accent"
                      >
                        {a.display_name}
                      </Link>
                      <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] text-muted">
                        {a.kind}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          a.status === "live"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : a.status === "draft"
                              ? "bg-amber-500/15 text-amber-500"
                              : "bg-app-elevated text-muted"
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-faint tabular-nums">
                      {a.id}
                    </div>
                    {a.description && (
                      <div className="truncate text-[11px] text-muted">
                        {a.description}
                      </div>
                    )}
                  </div>
                  <form
                    action={setUserAgentAllowlist}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="user_id" value={userId} />
                    <input type="hidden" name="agent_id" value={a.id} />
                    <input
                      type="hidden"
                      name="present"
                      value={present ? "false" : "true"}
                    />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        present
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-app-elevated text-muted"
                      }`}
                    >
                      {present ? "Allowed" : "Not allowed"}
                    </span>
                    <button type="submit" className={buttonGhostClass}>
                      {present ? "Remove" : "Allow"}
                    </button>
                  </form>
                </div>
              );
            })
          )}
        </div>
      </section>

      {otherAgents.length > 0 && (
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">
            Other access modes (read-only)
          </h2>
          <p className="mt-1 text-xs text-muted">
            These agents don&apos;t use allowlists, so per-user toggling
            doesn&apos;t apply. They&apos;re shown for context.
          </p>
          <div className="mt-4 space-y-2">
            {otherAgents.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/agents/${encodeURIComponent(a.id)}`}
                    className="truncate text-sm text-app hover:text-tool-accent"
                  >
                    {a.display_name}
                  </Link>
                  <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                    {a.id}
                  </div>
                </div>
                <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] text-muted">
                  {a.access_mode}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
