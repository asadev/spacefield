"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  workspaceId: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function NewProjectButton({ workspaceId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return;
    setErr(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            name: name.trim(),
            slug: slugify(name) || `project-${Date.now()}`,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr((json as { error?: string }).error ?? `HTTP ${res.status}`);
          return;
        }
        setOpen(false);
        setName("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "unknown");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white"
      >
        + New project
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-tool-accent bg-app-elevated px-2 py-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Project name"
        className="bg-transparent text-xs text-app outline-none placeholder:text-faint"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-tool-accent px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create"}
      </button>
      {err && (
        <span className="font-mono text-[10px] text-rose-500">{err}</span>
      )}
    </div>
  );
}
