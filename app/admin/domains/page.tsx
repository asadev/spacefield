import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, inputClass } from "../_lib";
import type {
  CustomDomainScope,
  WorkspaceCustomDomainRow,
} from "../_types";
import { addDomain } from "./_actions";
import { CheckMark, ScopeChip, StatusChip } from "./_components/StatusChip";
import { RowActions } from "./_components/RowActions";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

async function addDomainVoid(formData: FormData): Promise<void> {
  "use server";
  await addDomain(formData);
}

export default async function AdminDomainsPage() {
  const admin = createAdminClient();

  // Pull all custom domains. Volume is small (one row per customer-attached
  // hostname), so no pagination — newest first.
  const { data: rowsRaw } = await admin
    .from("workspace_custom_domains")
    .select("*")
    .order("created_at", { ascending: false });
  const rows = (rowsRaw ?? []) as WorkspaceCustomDomainRow[];

  const wsIds = Array.from(new Set(rows.map((r) => r.workspace_id)));
  const { data: wsData } = wsIds.length
    ? await admin.from("workspaces").select("id, name").in("id", wsIds)
    : { data: [] as WorkspaceLite[] };
  const workspaces = new Map(
    ((wsData ?? []) as WorkspaceLite[]).map((w) => [w.id, w])
  );

  // For the picker on the "+ Add domain" form. Pull recent workspaces so
  // the dropdown isn't unbounded — admin can switch to UUID input for
  // older ones.
  const { data: pickerWsData } = await admin
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(200);
  const pickerWorkspaces = (pickerWsData ?? []) as WorkspaceLite[];

  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    pending: rows.filter(
      (r) => r.status === "pending" || r.status === "txt_verified"
    ).length,
    disabled: rows.filter((r) => r.status === "disabled").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Domains
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">Custom domains</h1>
        <p className="mt-0.5 text-xs text-muted">
          Workspace white-label hostnames. Admin verifies DNS (TXT then CNAME)
          and attaches to Vercel. {counts.total} total · {counts.active} active
          · {counts.pending} pending · {counts.disabled} disabled.
        </p>
      </div>

      {/* + Add domain form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">+ Add domain</h2>
        <p className="mt-1 text-xs text-muted">
          Inserts a pending row with an auto-generated TXT token. Customer
          adds DNS records before you can verify.
        </p>
        <form
          action={addDomainVoid}
          className="mt-4 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]"
        >
          <select
            name="workspace_id"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Select workspace
            </option>
            {pickerWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="domain"
            placeholder="example.com"
            required
            className={inputClass}
          />
          <select
            name="scope"
            defaultValue="workspace"
            className={inputClass}
          >
            <option value="workspace">workspace</option>
            <option value="toshare">toshare</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </form>
      </section>

      {/* List */}
      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Domain</th>
              <th className="px-3 py-2 text-left font-normal">Workspace</th>
              <th className="px-3 py-2 text-left font-normal">Scope</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-center font-normal">TXT</th>
              <th className="px-3 py-2 text-center font-normal">CNAME</th>
              <th className="px-3 py-2 text-center font-normal">Vercel</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
              <th className="px-3 py-2 text-right font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-faint"
                >
                  No custom domains yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const ws = workspaces.get(row.workspace_id);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/domains/${row.id}`}
                        className="font-mono text-xs text-app hover:text-tool-accent"
                      >
                        {row.domain}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {ws ? (
                        <Link
                          href={`/admin/workspaces/${row.workspace_id}`}
                          className="text-app hover:text-tool-accent"
                        >
                          {ws.name}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-faint">
                          {row.workspace_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <ScopeChip scope={row.scope as CustomDomainScope} />
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckMark ok={Boolean(row.txt_verified_at)} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckMark ok={Boolean(row.cname_verified_at)} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <CheckMark ok={Boolean(row.added_to_vercel_at)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <RowActions row={row} variant="compact" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
