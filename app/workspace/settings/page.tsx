import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspaceDeletion,
  type WorkspaceDeletionRequest,
} from "@/lib/lifecycle";

import WorkspaceDangerCard from "./_components/WorkspaceDangerCard";

/* /workspace/settings — Owner-only workspace settings.
 *
 * Lists every workspace the signed-in user owns. For each, renders
 * a Danger Zone card that can request soft-deletion (30-day grace)
 * or cancel a pending deletion request.
 *
 * Membership lookup: workspace_members has the canonical role; we
 * filter to rows where role = 'owner' for the current user.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace settings — Space Field",
  robots: { index: false, follow: false },
};

type OwnedWorkspace = {
  id: string;
  name: string;
  pending: WorkspaceDeletionRequest | null;
};

export default async function WorkspaceSettingsPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    redirect("/signin?next=/workspace/settings");
  }
  const userId = userData.user.id;

  // Pull owned workspace IDs first. workspace_members has
  // (workspace_id, user_id, role). RLS keeps this scoped to the
  // caller's own membership rows.
  const { data: ownerships, error: ownersErr } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .eq("role", "owner");

  if (ownersErr) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold">Workspace settings</h1>
        <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-500">
          Couldn&apos;t load your workspaces: {ownersErr.message}
        </p>
      </main>
    );
  }

  const wsIds = (ownerships ?? []).map((r) => r.workspace_id as string);

  let workspaces: { id: string; name: string }[] = [];
  if (wsIds.length > 0) {
    const { data: wsRows } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", wsIds);
    workspaces = (wsRows ?? []) as { id: string; name: string }[];
  }

  // Soft-delete sets workspaces.deleted_at, which makes the above
  // select hide them from the standard list when an RLS-style filter
  // is in play. We still want to show those workspaces here so the
  // owner can cancel — fetch any missing ones explicitly.
  const known = new Set(workspaces.map((w) => w.id));
  const missing = wsIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    const { data: extra } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", missing);
    if (extra) workspaces = workspaces.concat(extra as { id: string; name: string }[]);
  }

  // For each owned workspace, fetch any active deletion request.
  const enriched: OwnedWorkspace[] = await Promise.all(
    workspaces.map(async (w) => ({
      id: w.id,
      name: w.name,
      pending: await getActiveWorkspaceDeletion(w.id),
    }))
  );

  enriched.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="text-sm text-muted">
          Owner-only danger zone. Day-to-day workspace settings (members,
          name, etc.) are inside the app — open Settings → Workspaces from
          your dock.
        </p>
      </header>

      {enriched.length === 0 ? (
        <section className="rounded-xl border border-app bg-app-elevated p-6 text-sm text-muted">
          You don&apos;t own any workspaces. Only the owner sees the danger
          zone — admins and members can&apos;t delete a workspace.
        </section>
      ) : (
        <div className="space-y-6">
          {enriched.map((w) => (
            <WorkspaceDangerCard key={w.id} workspace={w} />
          ))}
        </div>
      )}
    </main>
  );
}
