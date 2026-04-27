import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  fetchAuthUsersByIds,
  formatBytes,
  formatDate,
} from "../_lib";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Workspace = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
};

export default async function AdminWorkspacesPage() {
  const admin = createAdminClient();

  const { data: wsData } = await admin
    .from("workspaces")
    .select("id, user_id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(PER_PAGE);
  const workspaces = (wsData ?? []) as Workspace[];

  const wsIds = workspaces.map((w) => w.id);
  const ownerIds = Array.from(new Set(workspaces.map((w) => w.user_id)));

  // Per-workspace member counts and storage totals are SQL aggregates
  // via two RPCs. Used to be two unbounded scans of workspace_members
  // and workspace_files (could be millions of rows).
  const [memberCountsRes, storageStatsRes, profilesRes, authMap] = await Promise.all([
    wsIds.length
      ? admin.rpc("admin_workspace_member_counts", { p_workspace_ids: wsIds })
      : Promise.resolve({
          data: [] as Array<{ workspace_id: string; members: number }>,
          error: null,
        }),
    wsIds.length
      ? admin.rpc("admin_workspace_storage_stats", { p_workspace_ids: wsIds })
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
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
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
  for (const r of (storageStatsRes.data ?? []) as Array<{
    workspace_id: string;
    total_bytes: number;
  }>) {
    storageBytes.set(r.workspace_id, Number(r.total_bytes));
  }

  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Workspaces
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">All workspaces</h1>
        <p className="mt-0.5 text-xs text-muted">
          {workspaces.length} most recent shown.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">Name</th>
              <th className="px-3 py-2 text-left font-normal">Owner</th>
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-right font-normal">Members</th>
              <th className="px-3 py-2 text-right font-normal">Storage</th>
              <th className="px-3 py-2 text-left font-normal">Created</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No workspaces yet.
                </td>
              </tr>
            ) : (
              workspaces.map((w) => {
                const p = profiles.get(w.user_id);
                const u = authMap.get(w.user_id);
                const ownerName =
                  p?.full_name || p?.username || u?.email || w.user_id.slice(0, 8);
                return (
                  <tr
                    key={w.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/workspaces/${w.id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        {w.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-app">
                      <Link
                        href={`/admin/users/${w.user_id}`}
                        className="hover:text-tool-accent"
                      >
                        {ownerName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {u?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {memberCounts.get(w.id) ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                      {formatBytes(storageBytes.get(w.id) ?? 0)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDate(w.created_at)}
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
