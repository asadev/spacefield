"use client";

/* WorkspaceScopedSection — single-section pane for one workspace.
 *
 * Replaces the old WorkspacesPane → click row → expand → tab pattern.
 * Each settings section that operates on a workspace (Workspace info,
 * Members, AI, Storage, etc.) is now a top-level Settings entry, and
 * this component is what the right pane renders.
 *
 * Responsibilities:
 *   1. Read the active workspace from useWorkspaces().
 *   2. Resolve its summary row + role from RPC `my_workspaces`.
 *   3. Fetch the full workspace row + tier info + member count.
 *   4. Render a small workspace switcher header so the user knows which
 *      workspace's settings they're viewing and can flip to another in
 *      one click without leaving the section.
 *   5. Render the matching *Section.tsx with the props it expects. */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../useAuth";
import { useWorkspaces } from "../useWorkspaces";
import GeneralSection from "./GeneralSection";
import StorageSection from "./StorageSection";
import MembersSection from "./MembersSection";
import PermissionsSection from "./PermissionsSection";
import ActivitySection from "./ActivitySection";
import AISection from "./AISection";
import DangerSection from "./DangerSection";
import SharedLinksSection from "./SharedLinksSection";
import {
  PILL,
  type SectionId,
  type WorkspaceFullRow,
  type WorkspaceSummary,
} from "./types";

interface Props {
  /** Which workspace-scoped settings section to render. */
  section: SectionId;
}

interface MeResponse {
  tier_config?: {
    name?: string | null;
    max_storage_per_workspace_mb?: number | null;
  } | null;
}

export default function WorkspaceScopedSection({ section }: Props) {
  const { user, supabase, enabled } = useAuth();
  const { workspaces: localWs, activeId, switchWorkspace } = useWorkspaces();

  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [full, setFull] = useState<WorkspaceFullRow | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [tierBaseMb, setTierBaseMb] = useState<number | null>(null);
  const [tierName, setTierName] = useState<string>("Free");
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingFull, setLoadingFull] = useState(false);
  const [msg, setMsg] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  /* Resolve summaries (role, member_count) for every workspace the user
   * belongs to. Used by the inline switcher; the active workspace's
   * summary is what gets passed into the section components below. */
  const refreshSummaries = useCallback(async () => {
    if (!enabled || !user) {
      setLoadingSummary(false);
      return;
    }
    setLoadingSummary(true);
    try {
      const [{ data: wsList, error: wsErr }, meRes] = await Promise.all([
        supabase.rpc("my_workspaces"),
        fetch("/api/me", { cache: "no-store" }).catch(() => null),
      ]);
      if (wsErr) throw wsErr;
      setSummaries(((wsList as WorkspaceSummary[]) ?? []).map((w) => ({ ...w })));
      if (meRes && meRes.ok) {
        const me = (await meRes.json()) as MeResponse;
        setTierBaseMb(me.tier_config?.max_storage_per_workspace_mb ?? null);
        setTierName(me.tier_config?.name ?? "Free");
      }
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Couldn't load workspace.",
      });
    } finally {
      setLoadingSummary(false);
    }
  }, [supabase, enabled, user]);

  useEffect(() => {
    void refreshSummaries();
  }, [refreshSummaries]);

  /* Fetch the active workspace's full row + member count whenever the
   * active workspace changes. */
  const active = useMemo(
    () => summaries.find((w) => w.id === activeId) ?? null,
    [summaries, activeId]
  );

  const refreshFull = useCallback(async () => {
    if (!active) return;
    setLoadingFull(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, description, avatar_url, created_at, archived_at, default_member_role, who_can_invite, who_can_install, who_can_uninstall"
        )
        .eq("id", active.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setFull({
          id: data.id,
          name: data.name,
          description: (data.description as string | null) ?? null,
          avatar_url: (data.avatar_url as string | null) ?? null,
          created_at: data.created_at,
          archived_at: (data.archived_at as string | null) ?? null,
          default_member_role:
            (data.default_member_role as "member" | "admin") ?? "member",
          who_can_invite:
            (data.who_can_invite as "admins" | "members") ?? "admins",
          who_can_install:
            (data.who_can_install as "admins" | "members") ?? "admins",
          who_can_uninstall:
            (data.who_can_uninstall as "admins" | "members") ?? "admins",
        });
      }
      const { count } = await supabase
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", active.id);
      if (typeof count === "number") setMemberCount(count);
    } catch (err) {
      setMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Load failed",
      });
    } finally {
      setLoadingFull(false);
    }
  }, [supabase, active]);

  useEffect(() => {
    void refreshFull();
  }, [refreshFull]);

  const onError = useCallback(
    (text: string) => setMsg({ type: "error", text }),
    []
  );
  const onSuccess = useCallback(
    (text: string) => setMsg({ type: "success", text }),
    []
  );
  const onSavedPatch = useCallback(
    (patch: Partial<WorkspaceFullRow>) => {
      setFull((prev) => (prev ? { ...prev, ...patch } : prev));
      if (typeof patch.name === "string") {
        setSummaries((prev) =>
          prev.map((r) =>
            r.id === active?.id ? { ...r, name: patch.name as string } : r
          )
        );
      }
    },
    [active]
  );
  const onWorkspaceDeleted = useCallback(() => {
    if (!active) return;
    setSummaries((prev) => prev.filter((r) => r.id !== active.id));
    setFull(null);
  }, [active]);

  /* ───────── Render guards ───────── */

  if (!enabled) {
    return (
      <p className="text-sm text-secondary">
        Sign-in isn&apos;t configured for this build.
      </p>
    );
  }
  if (!user) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-5 text-sm text-secondary">
        Sign in to manage workspace settings.
      </div>
    );
  }
  if (loadingSummary) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface" />;
  }
  if (summaries.length === 0) {
    return (
      <Empty
        title="No workspaces yet"
        body="Create a workspace from the dock or File menu, then come back here."
      />
    );
  }
  if (!active) {
    // The local active id doesn't match any synced workspace yet
    // (e.g. a freshly created one). Offer the first synced workspace.
    return (
      <Empty
        title="No active workspace"
        body="Pick a workspace below to view its settings."
        children={
          <ul className="mt-4 space-y-2">
            {summaries.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={`${PILL} w-full justify-between`}
                  onClick={() => switchWorkspace(w.id)}
                >
                  {w.name}
                </button>
              </li>
            ))}
          </ul>
        }
      />
    );
  }

  // Owner/admin/member-only sections fall back to a friendly notice if
  // the user's role can't see them.
  const role = active.role;
  const ownerOnly = section === "permissions" || section === "danger";
  if (ownerOnly && role !== "owner") {
    return (
      <Empty
        title="Owners only"
        body="This section is visible only to the workspace owner."
      />
    );
  }

  /* ───────── Render ───────── */

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        active={active}
        all={summaries}
        onSwitch={(id) => switchWorkspace(id)}
        onRefresh={() => {
          void refreshSummaries();
          void refreshFull();
        }}
      />

      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.type === "success"
              ? "border-tool-accent-soft bg-tool-accent-soft text-app"
              : "border-rose-400/25 bg-rose-400/10 text-rose-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loadingFull && !full ? (
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
      ) : (
        <div className="rounded-xl border border-app bg-app p-4">
          {section === "general" && (
            <GeneralSection
              workspaceId={active.id}
              role={role}
              full={full}
              memberCount={memberCount}
              onSaved={onSavedPatch}
              onError={onError}
              onSuccess={onSuccess}
            />
          )}
          {section === "storage" && (
            <StorageSection
              workspaceId={active.id}
              role={role}
              tierBaseMb={tierBaseMb}
              tierName={tierName}
              onError={onError}
              onSuccess={onSuccess}
            />
          )}
          {section === "members" && (
            <MembersSection
              workspaceId={active.id}
              workspaceName={full?.name ?? active.name}
              role={role}
              whoCanInvite={full?.who_can_invite ?? "admins"}
              onError={onError}
              onSuccess={onSuccess}
              onChanged={() => void refreshFull()}
            />
          )}
          {section === "permissions" && (
            <PermissionsSection
              workspaceId={active.id}
              role={role}
              full={full}
              onSaved={onSavedPatch}
              onError={onError}
              onSuccess={onSuccess}
            />
          )}
          {section === "activity" && (
            <ActivitySection workspaceId={active.id} onError={onError} />
          )}
          {section === "shared-links" && (
            <SharedLinksSection
              workspaceId={active.id}
              workspaceLabel={full?.name ?? active.name}
            />
          )}
          {section === "ai" && (
            <AISection
              workspaceId={active.id}
              role={role}
              onError={onError}
              onSuccess={onSuccess}
            />
          )}
          {section === "danger" && (
            <DangerSection
              workspaceId={active.id}
              workspaceName={full?.name ?? active.name}
              role={role}
              archivedAt={full?.archived_at ?? null}
              onWorkspaceChanged={onSavedPatch}
              onWorkspaceDeleted={onWorkspaceDeleted}
              onError={onError}
              onSuccess={onSuccess}
            />
          )}
        </div>
      )}

      {/* Hint when there are local-only workspaces not yet synced. */}
      {localWs.length > summaries.length && (
        <p className="text-xs text-muted">
          {localWs.length - summaries.length} local workspace
          {localWs.length - summaries.length === 1 ? "" : "s"} aren&apos;t
          synced yet. They&apos;ll appear here automatically.
        </p>
      )}
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function WorkspaceHeader({
  active,
  all,
  onSwitch,
  onRefresh,
}: {
  active: WorkspaceSummary;
  all: WorkspaceSummary[];
  onSwitch: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-app bg-app-elevated px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
          Workspace
        </div>
        <div className="mt-1 flex items-center gap-2">
          <select
            aria-label="Switch active workspace"
            value={active.id}
            onChange={(e) => onSwitch(e.target.value)}
            className="min-w-0 max-w-full truncate bg-transparent text-sm font-semibold text-app focus:outline-none"
          >
            {all.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <span className="rounded-md border border-app bg-app px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-secondary">
            {active.role}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={PILL}
        onClick={onRefresh}
        title="Refresh workspace data"
      >
        Refresh
      </button>
    </div>
  );
}

function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-6">
      <h3 className="text-sm font-semibold text-app">{title}</h3>
      <p className="mt-1 text-sm text-secondary">{body}</p>
      {children}
    </div>
  );
}
