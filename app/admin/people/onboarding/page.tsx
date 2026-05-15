import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OnboardingTaskTemplate,
  OnboardingTemplate,
} from "@/lib/people/types";

import OnboardingEditor from "./_OnboardingEditor";

export const dynamic = "force-dynamic";

/**
 * Admin CRUD for onboarding templates. Each template is a small jsonb
 * task list; we render existing templates grouped by workspace and let
 * admins create new ones via the editor below.
 */
export default async function OnboardingTemplatesPage() {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("id, name, slug")
    .order("name");
  const { data: tpls } = await admin
    .from("onboarding_templates")
    .select("*")
    .order("created_at", { ascending: false });

  const workspaces = (ws ?? []) as { id: string; name: string; slug: string }[];
  const templates = (tpls ?? []) as OnboardingTemplate[];
  const byWorkspace = new Map<string, OnboardingTemplate[]>();
  for (const t of templates) {
    const list = byWorkspace.get(t.workspace_id) ?? [];
    list.push(t);
    byWorkspace.set(t.workspace_id, list);
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            HR / People
          </div>
          <h1 className="mt-1 text-xl font-semibold text-app">
            Onboarding templates
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {templates.length} templates across {workspaces.length} workspaces
          </p>
        </div>
        <Link
          href="/admin/people"
          className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app hover:border-tool-accent"
        >
          ← People
        </Link>
      </div>

      <OnboardingEditor workspaces={workspaces} />

      <div className="space-y-6">
        {workspaces.map((w) => {
          const list = byWorkspace.get(w.id) ?? [];
          if (!list.length) return null;
          return (
            <div key={w.id} className="rounded-xl border border-app bg-app-elevated">
              <header className="border-b border-app px-4 py-3 text-sm font-semibold text-app">
                {w.name}{" "}
                <span className="text-xs font-normal text-faint">/ {w.slug}</span>
              </header>
              <ul>
                {list.map((t) => (
                  <li key={t.id} className="border-b border-app px-4 py-3 last:border-b-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-app">{t.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-faint">
                        {(t.tasks as OnboardingTaskTemplate[]).length} tasks
                      </span>
                    </div>
                    <ol className="mt-2 list-decimal pl-5 text-xs text-secondary">
                      {(t.tasks as OnboardingTaskTemplate[]).slice(0, 8).map((task, i) => (
                        <li key={i}>
                          {task.title}
                          {task.due_day_offset !== undefined && (
                            <span className="ml-1 text-faint">
                              (+{task.due_day_offset}d)
                            </span>
                          )}
                        </li>
                      ))}
                      {(t.tasks as OnboardingTaskTemplate[]).length > 8 && (
                        <li className="text-faint">
                          …{(t.tasks as OnboardingTaskTemplate[]).length - 8} more
                        </li>
                      )}
                    </ol>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
