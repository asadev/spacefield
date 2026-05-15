import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  getAuthUserId,
  listProjects,
  resolveWorkspaceId,
} from "@/lib/tasks/server";

import NewProjectButton from "./_components/NewProjectButton";
import ProjectsList from "./_components/ProjectsList";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export default async function ProjectsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const userId = await getAuthUserId();
  if (!userId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center">
          <h1 className="text-xl font-semibold text-app">Sign in to see projects</h1>
          <Link
            href="/signin"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  const workspaceId = await resolveWorkspaceId(single(sp.workspace) ?? null);
  if (!workspaceId) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-xl border border-app bg-app-elevated p-8 text-center text-sm text-muted">
          No workspace. Create one first.
        </div>
      </div>
    );
  }

  const projects = await listProjects(workspaceId).catch(() => []);

  // Counts: one query, then bucket in memory.
  const supabase = await createClient();
  const { data: countRows } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);
  const counts = new Map<string, number>();
  for (const r of (countRows ?? []) as { project_id: string | null }[]) {
    if (!r.project_id) continue;
    counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Work
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">Projects</h1>
          <p className="mt-0.5 text-xs text-muted">
            {projects.length} project{projects.length === 1 ? "" : "s"}. A
            project groups related tasks under a single status schema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs text-secondary transition-colors hover:border-tool-accent hover:text-app"
          >
            Tasks
          </Link>
          <NewProjectButton workspaceId={workspaceId} />
        </div>
      </div>

      <ProjectsList projects={projects} taskCounts={counts} />
    </div>
  );
}
