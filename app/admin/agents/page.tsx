import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import BulkActionBar, { type BulkAction } from "../_components/BulkActionBar";
import { BulkActionProvider } from "../_components/BulkActionContext";
import BulkRowCheckbox, {
  BulkSelectAllCheckbox,
} from "../_components/BulkRowCheckbox";
import { formatDateTime } from "../_lib";
import type { AiAgentRow } from "../_types";
import StatusChip from "./_components/StatusChip";
import KindChip from "./_components/KindChip";
import AccessChip from "./_components/AccessChip";

export const dynamic = "force-dynamic";

const AGENT_BULK_ACTIONS: BulkAction[] = [
  {
    id: "set_status_disabled",
    label: "Set status: Disabled",
    confirmText: "Disable {n} agents?",
  },
  {
    id: "set_status_live",
    label: "Set status: Live",
    confirmText: "Mark {n} agents live?",
  },
  {
    id: "set_status_draft",
    label: "Set status: Draft",
    confirmText: "Move {n} agents to draft?",
  },
  {
    id: "delete",
    label: "Delete agents",
    kind: "destructive",
    confirmText:
      "Delete {n} agents? Only disabled agents with no recent runs are removed.",
  },
  {
    id: "export_csv",
    label: "Export selected as CSV",
    kind: "export",
  },
];

/**
 * Index of every row in `public.ai_agents`. The order mirrors how the
 * runtime resolves them (sort_order asc, then display_name) so what the
 * admin sees matches what end-users see in their picker.
 */
export default async function AdminAgentsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_agents")
    .select(
      "id, display_name, description, kind, model, status, access_mode, sort_order, updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load agents: {error.message}
      </div>
    );
  }

  type Row = Pick<
    AiAgentRow,
    | "id"
    | "display_name"
    | "description"
    | "kind"
    | "model"
    | "status"
    | "access_mode"
    | "sort_order"
    | "updated_at"
  >;
  const rows = (data ?? []) as Row[];

  const counts = {
    total: rows.length,
    live: rows.filter((r) => r.status === "live").length,
    draft: rows.filter((r) => r.status === "draft").length,
    disabled: rows.filter((r) => r.status === "disabled").length,
  };

  const pageIds = rows.map((r) => r.id);

  return (
    <BulkActionProvider scope="agents">
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Platform
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">AI agents</h1>
          <p className="mt-0.5 text-xs text-muted">
            {counts.total} agents · {counts.live} live · {counts.draft} draft ·{" "}
            {counts.disabled} disabled. Each row is a declarative
            assistant — model, prompt, skills, tools, and access rules.
          </p>
        </div>
        <Link
          href="/admin/agents/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          + New agent
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="w-8 px-3 py-2 text-left font-normal">
                <BulkSelectAllCheckbox
                  ids={pageIds}
                  label="Select all agents on page"
                />
              </th>
              <th className="px-3 py-2 text-left font-normal">Agent</th>
              <th className="px-3 py-2 text-left font-normal">ID</th>
              <th className="px-3 py-2 text-left font-normal">Kind</th>
              <th className="px-3 py-2 text-left font-normal">Model</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Access</th>
              <th className="px-3 py-2 text-left font-normal">Updated</th>
              <th className="px-3 py-2 text-right font-normal">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-faint"
                >
                  No agents yet. Click <span className="text-app">+ New agent</span> to seed one.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-app last:border-b-0 hover:bg-app/40"
                >
                  <td className="px-3 py-2 align-middle">
                    <BulkRowCheckbox
                      id={r.id}
                      label={`Select agent ${r.display_name}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/agents/${r.id}`}
                      className="text-app hover:text-tool-accent"
                    >
                      <div className="font-medium">{r.display_name}</div>
                      {r.description && (
                        <div className="mt-0.5 truncate text-[11px] text-muted">
                          {r.description}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {r.id}
                  </td>
                  <td className="px-3 py-2">
                    <KindChip kind={r.kind} />
                  </td>
                  <td className="px-3 py-2 text-xs text-secondary">
                    {r.model}
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <AccessChip mode={r.access_mode} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                    {formatDateTime(r.updated_at)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/agents/${r.id}`}
                      className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <BulkActionBar scope="agents" actions={AGENT_BULK_ACTIONS} />
    </div>
    </BulkActionProvider>
  );
}
