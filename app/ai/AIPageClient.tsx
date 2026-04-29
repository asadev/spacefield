"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/lib/workspaces/client";
import AISection from "../tools/_components/workspace-settings/AISection";
import type { WorkspaceRole } from "../tools/_components/workspace-settings/types";

/* Mobile-first AI settings surface. Reuses the full AISection from
 * the workspace-settings panel — same backend, same persona /
 * permissions / link flows. The wrapping chrome here is just a clean
 * top bar + auth gate so it works as a standalone route on any device.
 *
 * Auth flow: redirect to /signin?next=/ai if no session. Workspace
 * selection follows the existing useWorkspace hook (which auto-promotes
 * the desktop's active workspace to a team selection). If still no
 * team workspace after that, we surface a friendly create-on-desktop
 * prompt rather than an inline create flow — this page is meant to be
 * a quick mobile shortcut, not a full provisioning surface. */
export default function AIPageClient() {
  const { current, signedIn, loading } = useWorkspace();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  // Check auth synchronously on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setAuthed(!!data.user);
      } catch {
        if (!cancelled) setAuthed(false);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When the workspace resolves, pull the caller's role so the
  // permission editor knows whether to render in admin mode.
  useEffect(() => {
    let cancelled = false;
    if (current.kind !== "team") return;
    void (async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: member } = await supabase
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", current.id)
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (cancelled) return;
        const r = (member?.role as string | undefined) ?? "member";
        if (r === "owner" || r === "admin" || r === "member") setRole(r);
      } catch {
        /* fall back to the default 'member' */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current]);

  // Auto-dismiss toast after 3.5s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Loading shimmer until both auth + workspace are ready.
  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-app">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <div className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-faint">
            loading…
          </div>
        </div>
      </div>
    );
  }

  // Not signed in.
  if (!authed) {
    return (
      <div className="min-h-screen bg-app">
        <Header />
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
          <div className="w-full rounded-2xl border border-app bg-app-elevated p-6 text-center">
            <h1 className="text-lg font-semibold text-app">
              Sign in to manage your AI
            </h1>
            <p className="mt-2 text-sm text-secondary">
              The AI Assistant settings live inside your account. Sign in
              to link WhatsApp, Telegram, edit your persona, and tune
              permissions.
            </p>
            <Link
              href="/?next=/ai"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Signed in but no team workspace selected — direct them to the desktop.
  if (current.kind !== "team") {
    return (
      <div className="min-h-screen bg-app">
        <Header />
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-4 py-12">
          <div className="w-full rounded-2xl border border-app bg-app-elevated p-6 text-center">
            <h1 className="text-lg font-semibold text-app">
              Pick a workspace first
            </h1>
            <p className="mt-2 text-sm text-secondary">
              Open Spacefield, choose the workspace you want the AI to
              manage, then come back to this page on any device.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Open Spacefield
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app">
      <Header workspaceName={current.name} />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <AISection
          workspaceId={current.id}
          role={role}
          onError={(msg) => setToast({ kind: "err", msg })}
          onSuccess={(msg) => setToast({ kind: "ok", msg })}
        />
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={
            "fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur " +
            (toast.kind === "ok"
              ? "border-tool-accent-soft bg-app-elevated/90 text-app"
              : "border-rose-500/30 bg-app-elevated/90 text-app")
          }
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Header({ workspaceName }: { workspaceName?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-app bg-app-elevated/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary hover:text-app"
        >
          ← Spacefield
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {workspaceName && (
            <span className="rounded-md border border-app bg-app px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary">
              {workspaceName}
            </span>
          )}
          <span className="text-sm font-semibold text-app">AI Assistant</span>
        </div>
      </div>
    </header>
  );
}
