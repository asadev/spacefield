"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import type { ProjectRow } from "@/lib/tasks/types";

interface Props {
  projects: ProjectRow[];
  workspaceId: string;
  activeView: "list" | "kanban" | "calendar";
}

/**
 * Toolbar with project filter, view switcher, and "+ New task".
 * View state is part of the URL (`?view=`) so server-rendered list and
 * server-rendered Kanban both work without client-side state leak.
 */
export default function TasksToolbar({
  projects,
  workspaceId,
  activeView,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStatus, setDraftStatus] = useState("Todo");
  const [draftProject, setDraftProject] = useState<string>(
    params.get("project") ?? ""
  );

  function updateParam(name: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(name, value);
    else next.delete(name);
    startTransition(() => router.replace(`/tasks?${next.toString()}`));
  }

  function setView(v: "list" | "kanban" | "calendar") {
    updateParam("view", v === "list" ? null : v);
  }

  async function submitDraft() {
    if (!draftTitle.trim()) return;
    setCreating(false);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: workspaceId,
        title: draftTitle.trim(),
        status: draftStatus,
        project_id: draftProject || undefined,
      }),
    });
    if (res.ok) {
      setDraftTitle("");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Project
          <select
            value={params.get("project") ?? ""}
            onChange={(e) => updateParam("project", e.target.value || null)}
            className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Status
          <input
            type="text"
            placeholder="any"
            defaultValue={params.get("status") ?? ""}
            onBlur={(e) => updateParam("status", e.target.value || null)}
            className="w-28 rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Assignee
          <select
            value={params.get("assignee") ?? ""}
            onChange={(e) => updateParam("assignee", e.target.value || null)}
            className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          >
            <option value="">Anyone</option>
            <option value="me">Me</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Priority
          <select
            value={params.get("priority") ?? ""}
            onChange={(e) => updateParam("priority", e.target.value || null)}
            className="rounded-lg border border-app bg-app-elevated px-2 py-1.5 text-xs text-app outline-none focus:border-tool-accent"
          >
            <option value="">Any</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated text-xs">
          {(["list", "kanban", "calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                activeView === v
                  ? "bg-tool-accent text-white"
                  : "text-secondary hover:bg-app"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs text-secondary transition-colors hover:border-tool-accent hover:text-app"
        >
          Projects
        </Link>
        {creating ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-tool-accent bg-app-elevated px-2 py-1">
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitDraft();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Task title"
              className="bg-transparent text-xs text-app outline-none placeholder:text-faint"
            />
            <select
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
              className="bg-transparent text-[10px] text-secondary outline-none"
            >
              <option value="Todo">Todo</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
            {projects.length > 0 && (
              <select
                value={draftProject}
                onChange={(e) => setDraftProject(e.target.value)}
                className="bg-transparent text-[10px] text-secondary outline-none"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={submitDraft}
              className="rounded-md bg-tool-accent px-2 py-0.5 text-[10px] font-medium text-white"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            + New task
          </button>
        )}
      </div>
    </div>
  );
}
