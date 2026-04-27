import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { removeWorkspaceMember } from "../../_actions";
import {
  fetchAuthUsersByIds,
  formatBytes,
  formatDateTime,
} from "../../_lib";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type Member = {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type FileRow = {
  id: string;
  user_id: string;
  name: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
};

export default async function AdminWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const wsRes = await admin
    .from("workspaces")
    .select("id, user_id, name, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  const workspace = wsRes.data as Workspace | null;
  if (!workspace) notFound();

  const [membersRes, filesRes] = await Promise.all([
    admin
      .from("workspace_members")
      .select("workspace_id, user_id, role, joined_at")
      .eq("workspace_id", id)
      .order("joined_at", { ascending: true }),
    admin
      .from("workspace_files")
      .select("id, user_id, name, size_bytes, content_type, created_at")
      .eq("workspace_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const members = (membersRes.data ?? []) as Member[];
  const files = (filesRes.data ?? []) as FileRow[];

  const allUserIds = Array.from(
    new Set([...members.map((m) => m.user_id), ...files.map((f) => f.user_id)])
  );

  // Total bytes is a SQL aggregate via RPC — used to read every
  // workspace_files row in this workspace just to sum size_bytes.
  const [authMap, profilesRes, storageRes] = await Promise.all([
    fetchAuthUsersByIds(allUserIds),
    allUserIds.length
      ? admin
          .from("profiles")
          .select("user_id, full_name, username, avatar_url")
          .in("user_id", allUserIds)
      : Promise.resolve({
          data: [] as Array<{
            user_id: string;
            full_name: string | null;
            username: string | null;
            avatar_url: string | null;
          }>,
          error: null,
        }),
    admin.rpc("admin_single_workspace_storage", { p_workspace_id: id }),
  ]);

  const profiles = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id, p])
  );

  const storageRow = (Array.isArray(storageRes.data) ? storageRes.data[0] : storageRes.data) as
    | { files_count: number; total_bytes: number }
    | undefined;
  const totalBytes = Number(storageRow?.total_bytes ?? 0);
  const totalFilesCount = Number(storageRow?.files_count ?? 0);

  const ownerId = workspace.user_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/workspaces" className="hover:text-tool-accent">
          ← Workspaces
        </Link>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h1 className="text-xl font-semibold text-app">{workspace.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>created {formatDateTime(workspace.created_at)}</span>
          <span>· updated {formatDateTime(workspace.updated_at)}</span>
          <span>· {members.length} members</span>
          <span>· {formatBytes(totalBytes)} stored</span>
        </div>
      </section>

      {/* Members */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Members ({members.length})</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Member</th>
                <th className="px-3 py-2 text-left font-normal">Email</th>
                <th className="px-3 py-2 text-left font-normal">Role</th>
                <th className="px-3 py-2 text-left font-normal">Joined</th>
                <th className="px-3 py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const p = profiles.get(m.user_id);
                const u = authMap.get(m.user_id);
                const name =
                  p?.full_name || p?.username || u?.email || m.user_id.slice(0, 8);
                const isOwner = m.role === "owner" || m.user_id === ownerId;
                return (
                  <tr
                    key={m.user_id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${m.user_id}`}
                        className="text-app hover:text-tool-accent"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {u?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">{m.role}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(m.joined_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isOwner ? (
                        <span className="text-xs text-faint">owner</span>
                      ) : (
                        <form action={removeWorkspaceMember}>
                          <input type="hidden" name="workspace_id" value={id} />
                          <input type="hidden" name="user_id" value={m.user_id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-app bg-app px-2.5 py-1 text-xs text-app transition-colors hover:border-rose-400 hover:text-rose-400"
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-faint">
                    No members.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Files */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app">
            Files (top 50 of {totalFilesCount.toLocaleString()})
          </h2>
          <span className="font-mono text-xs tabular-nums text-muted">
            {formatBytes(totalBytes)} total
          </span>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Name</th>
                <th className="px-3 py-2 text-left font-normal">Type</th>
                <th className="px-3 py-2 text-right font-normal">Size</th>
                <th className="px-3 py-2 text-left font-normal">Uploader</th>
                <th className="px-3 py-2 text-left font-normal">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-faint">
                    No files.
                  </td>
                </tr>
              ) : (
                files.map((f) => {
                  const p = profiles.get(f.user_id);
                  const u = authMap.get(f.user_id);
                  const uploaderName =
                    p?.full_name || p?.username || u?.email || f.user_id.slice(0, 8);
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-app last:border-b-0 hover:bg-app/40"
                    >
                      <td className="px-3 py-2 text-app">{f.name}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {f.content_type ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-secondary">
                        {formatBytes(f.size_bytes)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/users/${f.user_id}`}
                          className="text-secondary hover:text-tool-accent"
                        >
                          {uploaderName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {formatDateTime(f.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
