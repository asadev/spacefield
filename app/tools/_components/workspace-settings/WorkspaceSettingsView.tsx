"use client";

/* WorkspaceSettingsView — sectioned settings UI for one workspace.
 *
 * Renders inline below the workspace row in WorkspacesPane. Tabs across
 * the top navigate between the section components.
 *
 * Section visibility:
 *   - General: everyone (owners can edit)
 *   - Storage: everyone (owners can change add-on)
 *   - Members: everyone (admins manage members; members read-only)
 *   - Permissions: owner-only
 *   - Activity: everyone (members read-only)
 *   - Danger: owner-only
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../useAuth";
import GeneralSection from "./GeneralSection";
import StorageSection from "./StorageSection";
import MembersSection from "./MembersSection";
import PermissionsSection from "./PermissionsSection";
import ActivitySection from "./ActivitySection";
import AISection from "./AISection";
import DangerSection from "./DangerSection";
import {
  PILL,
  type SectionId,
  type WorkspaceFullRow,
  type WorkspaceRole,
  type WorkspaceSummary,
} from "./types";

interface Props {
  workspace: WorkspaceSummary;
  tierBaseMb: number | null;
  tierName: string;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onWorkspaceDeleted: (id: string) => void;
  onWorkspaceChanged: (id: string, patch: Partial<WorkspaceFullRow>) => void;
}

interface TabDef {
  id: SectionId;
  label: string;
  visibleFor: WorkspaceRole[];
}

const TABS: TabDef[] = [
  { id: "general", label: "General", visibleFor: ["owner", "admin", "member"] },
  { id: "storage", label: "Storage", visibleFor: ["owner", "admin", "member"] },
  { id: "members", label: "Members", visibleFor: ["owner", "admin", "member"] },
  { id: "permissions", label: "Permissions", visibleFor: ["owner"] },
  { id: "activity", label: "Activity", visibleFor: ["owner", "admin", "member"] },
  { id: "ai", label: "AI", visibleFor: ["owner", "admin", "member"] },
  { id: "danger", label: "Danger", visibleFor: ["owner"] },
];

export default function WorkspaceSettingsView({
  workspace,
  tierBaseMb,
  tierName,
  onError,
  onSuccess,
  onWorkspaceDeleted,
  onWorkspaceChanged,
}: Props) {
  const { supabase } = useAuth();
  const [section, setSection] = useState<SectionId>("general");
  const [full, setFull] = useState<WorkspaceFullRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(workspace.member_count);

  const tabs = useMemo(
    () => TABS.filter((t) => t.visibleFor.includes(workspace.role)),
    [workspace.role]
  );

  const refreshFull = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select(
          "id, name, description, avatar_url, created_at, archived_at, default_member_role, who_can_invite, who_can_install, who_can_uninstall"
        )
        .eq("id", workspace.id)
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
    } catch (err) {
      onError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [supabase, workspace.id, onError]);

  useEffect(() => {
    void refreshFull();
  }, [refreshFull]);

  // If the active tab disappears (e.g. owner demoted to admin via
  // ownership transfer), drop back to General.
  useEffect(() => {
    if (!tabs.some((t) => t.id === section)) {
      setSection("general");
    }
  }, [tabs, section]);

  const onSavedPatch = (patch: Partial<WorkspaceFullRow>) => {
    setFull((prev) => (prev ? { ...prev, ...patch } : prev));
    onWorkspaceChanged(workspace.id, patch);
  };

  const refreshMemberCount = useCallback(async () => {
    const { count } = await supabase
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id);
    if (typeof count === "number") setMemberCount(count);
  }, [supabase, workspace.id]);

  return (
    <div className="mt-3 rounded-xl border border-app bg-app">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-app p-2">
        {tabs.map((t) => {
          const active = t.id === section;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`rounded-md px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.14em] transition-colors ${
                active
                  ? "bg-tool-accent text-white"
                  : "text-secondary hover:bg-surface hover:text-app"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={refreshFull}
          className={`${PILL} ml-auto`}
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      <div className="p-4">
        {loading && (
          <div className="h-32 animate-pulse rounded-xl bg-surface" />
        )}
        {!loading && section === "general" && (
          <GeneralSection
            workspaceId={workspace.id}
            role={workspace.role}
            full={full}
            memberCount={memberCount}
            onSaved={onSavedPatch}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
        {!loading && section === "storage" && (
          <StorageSection
            workspaceId={workspace.id}
            role={workspace.role}
            tierBaseMb={tierBaseMb}
            tierName={tierName}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
        {!loading && section === "members" && (
          <MembersSection
            workspaceId={workspace.id}
            workspaceName={full?.name ?? workspace.name}
            role={workspace.role}
            whoCanInvite={full?.who_can_invite ?? "admins"}
            onError={onError}
            onSuccess={onSuccess}
            onChanged={() => void refreshMemberCount()}
          />
        )}
        {!loading && section === "permissions" && (
          <PermissionsSection
            workspaceId={workspace.id}
            role={workspace.role}
            full={full}
            onSaved={onSavedPatch}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
        {!loading && section === "activity" && (
          <ActivitySection
            workspaceId={workspace.id}
            onError={onError}
          />
        )}
        {!loading && section === "ai" && (
          <AISection
            workspaceId={workspace.id}
            role={workspace.role}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
        {!loading && section === "danger" && (
          <DangerSection
            workspaceId={workspace.id}
            workspaceName={full?.name ?? workspace.name}
            role={workspace.role}
            archivedAt={full?.archived_at ?? null}
            onWorkspaceChanged={(p) => onSavedPatch(p)}
            onWorkspaceDeleted={() => onWorkspaceDeleted(workspace.id)}
            onError={onError}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}
