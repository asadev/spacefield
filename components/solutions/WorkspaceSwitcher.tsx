"use client";

import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/lib/workspaces/client";
import type { SelectedWorkspace } from "@/lib/workspaces/types";

// Dropdown used at the top of workspace-aware solution tools.
// Lets the user switch between "Personal (local only)" and any workspace
// they belong to, or jump off to create a new workspace.
export default function WorkspaceSwitcher() {
  const { current, setCurrent, workspaces, signedIn, loading } = useWorkspace();
  const [open, setOpen] = useState(false);

  const label =
    current.kind === "team" ? current.name : "Personal (local only)";

  const pick = (next: SelectedWorkspace) => {
    setCurrent(next);
    setOpen(false);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
          Workspace
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-3 py-1.5 text-sm text-app hover:border-tool-accent transition-colors"
          >
            <span>{loading ? "Loading..." : label}</span>
            <span className="text-muted">{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <div className="absolute left-0 z-20 mt-2 w-64 rounded-md border border-app bg-app-elevated p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => pick({ kind: "personal" })}
                className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-surface ${
                  current.kind === "personal" ? "text-tool-accent" : "text-app"
                }`}
              >
                <span>Personal (local only)</span>
                {current.kind === "personal" && <span>•</span>}
              </button>

              {signedIn && workspaces.length > 0 && (
                <div className="my-1 border-t border-app" />
              )}

              {workspaces.map((w) => {
                const selected =
                  current.kind === "team" && current.id === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() =>
                      pick({
                        kind: "team",
                        id: w.id,
                        slug: w.slug,
                        name: w.name,
                        role: w.role,
                      })
                    }
                    className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-surface ${
                      selected ? "text-tool-accent" : "text-app"
                    }`}
                  >
                    <span className="flex-1 truncate">{w.name}</span>
                    <span className="text-[0.6rem] uppercase tracking-[0.15em] text-muted">
                      {w.role}
                    </span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-app" />
              <Link
                href="/"
                className="block rounded-sm px-3 py-2 text-sm text-tool-accent hover:bg-surface"
                onClick={() => setOpen(false)}
              >
                Open workspace settings
              </Link>
              {!signedIn && (
                <Link
                  href="/signin?next=/solutions/tools"
                  className="block rounded-sm px-3 py-2 text-xs text-muted hover:bg-surface"
                  onClick={() => setOpen(false)}
                >
                  Sign in to use team workspaces
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted">
        {current.kind === "team" ? "Team mode — synced" : "Personal — local only"}
      </div>
    </div>
  );
}
