"use client";

/* Groups tab — list synced WhatsApp groups + create/manage.
 *
 *  list view ─── click group ──→ side panel (members + composer)
 *      │
 *      ├── "Sync" (refresh from Evolution)
 *      └── "Create" → modal (name + multi-contact picker)
 */

import { useCallback, useEffect, useState } from "react";
import {
  createGroup,
  fetchGroups,
  type WaGroup,
} from "./api";
import ContactPicker from "./ContactPicker";
import WhatsAppMessageComposer from "@/components/whatsapp/WhatsAppMessageComposer";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

export default function GroupsTab({ workspaceId, compact }: Props) {
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<WaGroup | null>(null);

  const refresh = useCallback(
    async (force?: boolean) => {
      if (force) setSyncing(true);
      else setLoading(true);
      setError(null);
      const res = await fetchGroups(workspaceId, force);
      setLoading(false);
      setSyncing(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGroups(res.data);
    },
    [workspaceId]
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return (
    <div className={`flex h-full bg-app ${compact ? "flex-col" : "flex-row"}`}>
      {/* List */}
      <section
        className={`flex flex-col border-r border-app bg-app-elevated ${
          compact ? "w-full" : "w-[360px] min-w-[300px]"
        } ${compact && selected ? "hidden" : ""}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-app p-2">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            Groups · {groups.length}
          </h3>
          <div className="flex items-center gap-1.5">
            <SecondaryButton onClick={() => refresh(true)} disabled={syncing}>
              <MiniIcon name="refresh" /> {syncing ? "Syncing…" : "Sync"}
            </SecondaryButton>
            <PrimaryButton onClick={() => setCreateOpen(true)}>
              <MiniIcon name="plus" /> New
            </PrimaryButton>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-faint">loading…</div>
          ) : error ? (
            <div className="p-3">
              <ErrorBlock body={error} onRetry={() => refresh(true)} />
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              kicker="whatsapp.groups"
              compact={compact}
              title="No groups yet"
              body={
                <span>
                  Existing WhatsApp groups on this number sync automatically.
                  Create a new one to message customers in bulk through a
                  shared thread.
                </span>
              }
              cta={
                <PrimaryButton onClick={() => setCreateOpen(true)}>
                  <MiniIcon name="plus" /> Create group
                </PrimaryButton>
              }
            />
          ) : (
            <ul role="list" className="divide-y divide-app">
              {groups.map((g) => {
                const active = selected?.id === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(g)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                        active ? "bg-tool-accent-soft" : "hover:bg-surface"
                      }`}
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                        <MiniIcon name="users" size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-app">
                            {g.name}
                          </span>
                          <Pill>{g.member_count}</Pill>
                        </div>
                        <div className="truncate text-xs text-secondary">
                          {g.last_message_preview ?? "—"}
                        </div>
                        <div className="text-[0.6rem] text-faint">
                          {formatRelative(g.last_message_at)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Detail */}
      <section
        className={`flex min-w-0 flex-1 flex-col bg-app ${
          compact && !selected ? "hidden" : ""
        }`}
      >
        {!selected ? (
          <EmptyState
            kicker="whatsapp.groups"
            compact={compact}
            title="Pick a group"
            body={<span>Select a group on the left to see members & send to it.</span>}
          />
        ) : (
          <GroupDetail
            workspaceId={workspaceId}
            group={selected}
            compact={compact}
            onBack={() => setSelected(null)}
          />
        )}
      </section>

      {createOpen ? (
        <CreateGroupModal
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
          onCreated={async (g) => {
            setCreateOpen(false);
            setSelected(g);
            await refresh(true);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupDetail({
  workspaceId,
  group,
  compact,
  onBack,
}: {
  workspaceId: string;
  group: WaGroup;
  compact: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app">
      <header className="flex shrink-0 items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        {compact ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 text-secondary hover:bg-surface"
            aria-label="Back to groups"
          >
            <MiniIcon name="close" size={16} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-app">{group.name}</div>
          <div className="text-[0.65rem] font-mono text-faint">
            {group.member_count} member{group.member_count === 1 ? "" : "s"}
            {" · "}
            {group.evolution_group_id.slice(0, 16)}…
          </div>
        </div>
      </header>

      <div className="flex-1 p-3">
        <h4 className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Send to this group
        </h4>
        <WhatsAppMessageComposer
          workspaceId={workspaceId}
          defaultTargetType="group"
          defaultTargetId={group.id}
          fixedTarget
          onSend={() => undefined}
        />
      </div>
    </div>
  );
}

function CreateGroupModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (group: WaGroup) => void;
}) {
  const [name, setName] = useState("");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!name.trim()) {
        setError("Group name is required.");
        return;
      }
      if (contactIds.length === 0) {
        setError("Add at least one contact.");
        return;
      }
      setBusy(true);
      const res = await createGroup(workspaceId, name.trim(), contactIds);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // K-07: createGroup unwraps the server `{ item }` envelope and returns
      // the WaGroup directly.
      onCreated(res.data);
    },
    [contactIds, name, onCreated, workspaceId]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-app px-4 py-3">
            <h3 className="text-base font-semibold text-app">Create WhatsApp group</h3>
            <p className="mt-0.5 text-xs text-secondary">
              Creates a real WhatsApp group on your shop number. Members are
              added to the group via Evolution.
            </p>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Group name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Eid 2026 — Repeat Customers"
                maxLength={64}
                className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                required
              />
            </label>

            <div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Members
              </span>
              <div className="mt-1">
                <ContactPicker
                  workspaceId={workspaceId}
                  selectedIds={contactIds}
                  onChange={setContactIds}
                  maxSelected={256}
                  placeholder="Search CRM contacts to add"
                />
              </div>
            </div>

            {error ? <ErrorBlock body={error} /> : null}
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-app px-4 py-3">
            <SecondaryButton onClick={onClose} disabled={busy}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" loading={busy}>
              Create group
            </PrimaryButton>
          </footer>
        </form>
      </div>
    </div>
  );
}
