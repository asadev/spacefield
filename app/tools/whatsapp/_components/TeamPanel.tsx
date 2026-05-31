"use client";

/* Team + multi-number panel (EPIC-20) — lazy-loaded.
 *
 * Two sub-views (responsive CSS only, mobile-first):
 *   1. Numbers : list every connected Evolution line; edit label/role; set the
 *                default; toggle capacity-aware round-robin auto-assignment to a
 *                team. (Adding a new line creates the row; pairing happens in the
 *                Connection tab.)
 *   2. Teams   : create teams, add workspace members, set per-agent capacity +
 *                presence (available/away/offline). The auto-assigner picks the
 *                lowest-load available agent under capacity.
 *
 * Auto-assignment shipped: round-robin + capacity + presence (the
 * whatsapp_pick_assignee RPC). Default OFF — manual single-assignee remains the
 * baseline.
 */

import { useCallback, useEffect, useState } from "react";
import {
  addTeamMember,
  createInstanceLine,
  createTeam,
  deleteTeam,
  fetchInstances,
  fetchMembers,
  fetchTeams,
  removeTeamMember,
  updateInstance,
  updateTeamMember,
  type WaInstanceRow,
  type WaMember,
  type WaTeam,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

type View = "numbers" | "teams";

export default function TeamPanel({ workspaceId, compact }: Props) {
  const [view, setView] = useState<View>("numbers");
  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center gap-1 border-b border-app bg-app-elevated px-3 py-2">
        {(
          [
            ["numbers", "Numbers"],
            ["teams", "Teams"],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] transition-colors ${
              view === key
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:bg-surface hover:text-app"
            }`}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "numbers" ? (
          <NumbersView workspaceId={workspaceId} compact={compact} />
        ) : (
          <TeamsView workspaceId={workspaceId} compact={compact} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Numbers (multi-instance) ───────────────────────── */

function NumbersView({ workspaceId, compact }: Props) {
  const [instances, setInstances] = useState<WaInstanceRow[]>([]);
  const [teams, setTeams] = useState<WaTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const refresh = useCallback(async () => {
    const [inst, tm] = await Promise.all([fetchInstances(workspaceId), fetchTeams(workspaceId)]);
    setLoading(false);
    if (!inst.ok) {
      setError(inst.error);
      return;
    }
    setError(null);
    setInstances(inst.data);
    if (tm.ok) setTeams(tm.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = useCallback(
    async (id: string, body: Parameters<typeof updateInstance>[2]) => {
      const res = await updateInstance(workspaceId, id, body);
      if (res.ok) void refresh();
    },
    [workspaceId, refresh],
  );

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Numbers · {instances.length}
        </h3>
        <PrimaryButton onClick={() => setCreating(true)}>
          <MiniIcon name="plus" /> Add line
        </PrimaryButton>
      </div>

      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      {instances.length === 0 ? (
        <EmptyState
          kicker="whatsapp.numbers"
          compact={compact}
          title="No numbers yet"
          body={<span>Pair your first WhatsApp line in the Connection tab.</span>}
        />
      ) : (
        <ul role="list" className="space-y-2">
          {instances.map((inst) => (
            <li key={inst.id} className="rounded-md border border-app bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-app">
                  {inst.label || inst.phone_number || inst.evolution_instance_name}
                </span>
                <Pill tone={inst.status === "connected" ? "success" : "neutral"}>
                  {inst.status}
                </Pill>
                {inst.is_default ? <Pill tone="info">default</Pill> : null}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                    Label
                  </span>
                  <input
                    defaultValue={inst.label ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (inst.label ?? "")) void patch(inst.id, { label: e.target.value });
                    }}
                    placeholder="Sales line"
                    className="mt-0.5 w-full rounded border border-app bg-app-elevated px-2 py-1 text-xs text-app outline-none"
                  />
                </label>
                <label className="block">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                    Role
                  </span>
                  <select
                    value={inst.role}
                    onChange={(e) => void patch(inst.id, { role: e.target.value })}
                    className="mt-0.5 w-full rounded border border-app bg-app-elevated px-2 py-1 text-xs text-app outline-none"
                  >
                    {["general", "sales", "support"].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 rounded border border-app bg-app-elevated p-2">
                <label className="flex items-center gap-2 text-xs text-secondary">
                  <input
                    type="checkbox"
                    checked={inst.auto_assign_enabled}
                    onChange={(e) =>
                      void patch(inst.id, { auto_assign_enabled: e.target.checked })
                    }
                  />
                  Auto-assign new chats (round-robin · capacity · presence)
                </label>
                {inst.auto_assign_enabled ? (
                  <label className="mt-1.5 block">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.14em] text-faint">
                      Assign to team
                    </span>
                    <select
                      value={inst.auto_assign_team_id ?? ""}
                      onChange={(e) =>
                        void patch(inst.id, { auto_assign_team_id: e.target.value || null })
                      }
                      className="mt-0.5 w-full rounded border border-app bg-surface px-2 py-1 text-xs text-app outline-none"
                    >
                      <option value="">Select a team…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {teams.length === 0 ? (
                      <span className="mt-0.5 block text-[0.6rem] text-amber-600 dark:text-amber-300">
                        Create a team first (Teams tab).
                      </span>
                    ) : null}
                  </label>
                ) : null}
              </div>

              {!inst.is_default ? (
                <button
                  type="button"
                  onClick={() => void patch(inst.id, { is_default: true })}
                  className="mt-2 rounded-md border border-app px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] text-secondary hover:border-tool-accent hover:text-tool-accent"
                >
                  Make default
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreating(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-app bg-app-elevated p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-app">Add a WhatsApp line</h3>
            <p className="mt-1 text-xs text-secondary">
              Creates a second line. Pair it from the Connection tab after.
            </p>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Support)"
              className="mt-3 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <SecondaryButton onClick={() => setCreating(false)}>Cancel</SecondaryButton>
              <PrimaryButton
                onClick={async () => {
                  const res = await createInstanceLine(workspaceId, {
                    label: newLabel.trim() || undefined,
                  });
                  if (res.ok) {
                    setCreating(false);
                    setNewLabel("");
                    void refresh();
                  }
                }}
              >
                Add line
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Teams ───────────────────────── */

function TeamsView({ workspaceId, compact }: Props) {
  const [teams, setTeams] = useState<WaTeam[]>([]);
  const [members, setMembers] = useState<WaMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeam, setNewTeam] = useState("");

  const refresh = useCallback(async () => {
    const [tm, mb] = await Promise.all([fetchTeams(workspaceId), fetchMembers(workspaceId)]);
    setLoading(false);
    if (!tm.ok) {
      setError(tm.error);
      return;
    }
    setError(null);
    setTeams(tm.data);
    if (mb.ok) setMembers(mb.data);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <div className="p-4 text-xs text-faint">loading…</div>;

  return (
    <div className="p-3">
      {error ? <ErrorBlock body={error} onRetry={refresh} /> : null}

      <div className="mb-3 flex items-center gap-2">
        <input
          value={newTeam}
          onChange={(e) => setNewTeam(e.target.value)}
          placeholder="New team name"
          className="flex-1 rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
        />
        <PrimaryButton
          onClick={async () => {
            if (!newTeam.trim()) return;
            const res = await createTeam(workspaceId, newTeam.trim());
            if (res.ok) {
              setNewTeam("");
              void refresh();
            }
          }}
        >
          <MiniIcon name="plus" /> Team
        </PrimaryButton>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          kicker="whatsapp.teams"
          compact={compact}
          title="No teams yet"
          body={
            <span>
              Create a team and add members with a capacity. Then enable
              auto-assignment on a number to route new chats round-robin.
            </span>
          }
        />
      ) : (
        <ul role="list" className="space-y-3">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              workspaceId={workspaceId}
              team={team}
              members={members}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCard({
  workspaceId,
  team,
  members,
  onChanged,
}: {
  workspaceId: string;
  team: WaTeam;
  members: WaMember[];
  onChanged: () => void;
}) {
  const [addUser, setAddUser] = useState("");
  const memberIds = new Set(team.members.map((m) => m.user_id));
  const candidates = members.filter((m) => !memberIds.has(m.id));

  return (
    <li className="rounded-md border border-app bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-app">{team.name}</span>
        <button
          type="button"
          onClick={async () => {
            if (!confirm(`Delete team "${team.name}"?`)) return;
            const res = await deleteTeam(workspaceId, team.id);
            if (res.ok) onChanged();
          }}
          className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
          aria-label="Delete team"
        >
          <MiniIcon name="trash" size={14} />
        </button>
      </div>

      {team.members.length === 0 ? (
        <div className="text-xs text-faint">No members yet.</div>
      ) : (
        <ul className="space-y-1.5">
          {team.members.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 rounded border border-app bg-app-elevated px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-app">{m.name}</span>
              <label className="flex items-center gap-1 text-[0.6rem] text-secondary">
                cap
                <input
                  type="number"
                  min={1}
                  defaultValue={m.capacity}
                  onBlur={(e) => {
                    const cap = Number(e.target.value);
                    if (cap && cap !== m.capacity)
                      void updateTeamMember(workspaceId, team.id, m.user_id, { capacity: cap });
                  }}
                  className="w-14 rounded border border-app bg-surface px-1 py-0.5 text-xs text-app outline-none"
                />
              </label>
              <select
                value={m.presence}
                onChange={(e) =>
                  void updateTeamMember(workspaceId, team.id, m.user_id, {
                    presence: e.target.value,
                  })
                }
                className="rounded border border-app bg-surface px-1.5 py-0.5 text-[0.65rem] text-app outline-none"
              >
                {["available", "away", "offline"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span className="text-[0.6rem] text-faint">load {m.active_count}</span>
              <button
                type="button"
                onClick={async () => {
                  const res = await removeTeamMember(workspaceId, team.id, m.user_id);
                  if (res.ok) onChanged();
                }}
                className="rounded p-0.5 text-rose-500 hover:bg-rose-500/10"
                aria-label="Remove member"
              >
                <MiniIcon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={addUser}
            onChange={(e) => setAddUser(e.target.value)}
            className="flex-1 rounded border border-app bg-app-elevated px-2 py-1 text-xs text-app outline-none"
          >
            <option value="">Add member…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <SecondaryButton
            onClick={async () => {
              if (!addUser) return;
              const res = await addTeamMember(workspaceId, team.id, addUser);
              if (res.ok) {
                setAddUser("");
                onChanged();
              }
            }}
          >
            Add
          </SecondaryButton>
        </div>
      ) : null}
    </li>
  );
}
