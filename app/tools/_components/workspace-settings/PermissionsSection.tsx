"use client";

/* PermissionsSection — owner-only.
 *
 * Three radio groups + a select for default new-member role. Saves
 * the diff via /api/workspaces/update.
 */

import { useEffect, useState } from "react";
import {
  PILL,
  PRIMARY,
  type DefaultMemberRole,
  type WhoCan,
  type WorkspaceFullRow,
  type WorkspaceRole,
} from "./types";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  full: WorkspaceFullRow | null;
  onSaved: (next: Partial<WorkspaceFullRow>) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export default function PermissionsSection({
  workspaceId,
  role,
  full,
  onSaved,
  onError,
  onSuccess,
}: Props) {
  const [defaultRole, setDefaultRole] = useState<DefaultMemberRole>(
    full?.default_member_role ?? "member"
  );
  const [whoCanInvite, setWhoCanInvite] = useState<WhoCan>(
    full?.who_can_invite ?? "admins"
  );
  const [whoCanInstall, setWhoCanInstall] = useState<WhoCan>(
    full?.who_can_install ?? "admins"
  );
  const [whoCanUninstall, setWhoCanUninstall] = useState<WhoCan>(
    full?.who_can_uninstall ?? "admins"
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDefaultRole(full?.default_member_role ?? "member");
    setWhoCanInvite(full?.who_can_invite ?? "admins");
    setWhoCanInstall(full?.who_can_install ?? "admins");
    setWhoCanUninstall(full?.who_can_uninstall ?? "admins");
  }, [
    full?.id,
    full?.default_member_role,
    full?.who_can_invite,
    full?.who_can_install,
    full?.who_can_uninstall,
  ]);

  if (role !== "owner") {
    return (
      <div className="rounded-xl border border-app bg-app p-4 text-sm text-secondary">
        Only the workspace owner can change permissions.
      </div>
    );
  }

  const dirty =
    defaultRole !== (full?.default_member_role ?? "member") ||
    whoCanInvite !== (full?.who_can_invite ?? "admins") ||
    whoCanInstall !== (full?.who_can_install ?? "admins") ||
    whoCanUninstall !== (full?.who_can_uninstall ?? "admins");

  const reset = () => {
    setDefaultRole(full?.default_member_role ?? "member");
    setWhoCanInvite(full?.who_can_invite ?? "admins");
    setWhoCanInstall(full?.who_can_install ?? "admins");
    setWhoCanUninstall(full?.who_can_uninstall ?? "admins");
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          default_member_role: defaultRole,
          who_can_invite: whoCanInvite,
          who_can_install: whoCanInstall,
          who_can_uninstall: whoCanUninstall,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Update failed (${res.status})`);
      }
      onSaved({
        default_member_role: defaultRole,
        who_can_invite: whoCanInvite,
        who_can_install: whoCanInstall,
        who_can_uninstall: whoCanUninstall,
      });
      onSuccess("Permissions updated.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Row
        label="Default role for new members"
        hint="Applied when an invitee accepts without a role override."
      >
        <Pills<DefaultMemberRole>
          value={defaultRole}
          onChange={setDefaultRole}
          options={[
            { id: "member", label: "Member" },
            { id: "admin", label: "Admin" },
          ]}
        />
      </Row>
      <Row
        label="Who can invite people"
        hint="Members invite when team-wide invites are enabled."
      >
        <Pills<WhoCan>
          value={whoCanInvite}
          onChange={setWhoCanInvite}
          options={[
            { id: "admins", label: "Admins only" },
            { id: "members", label: "All members" },
          ]}
        />
      </Row>
      <Row
        label="Who can install apps"
        hint="Controls the App Store install button."
      >
        <Pills<WhoCan>
          value={whoCanInstall}
          onChange={setWhoCanInstall}
          options={[
            { id: "admins", label: "Admins only" },
            { id: "members", label: "All members" },
          ]}
        />
      </Row>
      <Row
        label="Who can uninstall apps"
        hint="Removing a tool affects everyone in the workspace."
      >
        <Pills<WhoCan>
          value={whoCanUninstall}
          onChange={setWhoCanUninstall}
          options={[
            { id: "admins", label: "Admins only" },
            { id: "members", label: "All members" },
          ]}
        />
      </Row>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={PRIMARY}
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? "Saving…" : "Save permissions"}
        </button>
        <button
          type="button"
          className={PILL}
          disabled={!dirty || saving}
          onClick={reset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app p-4">
      <div className="text-sm font-medium text-app">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-tool-accent bg-tool-accent text-white"
                : "border-app bg-app text-secondary hover:bg-surface"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
