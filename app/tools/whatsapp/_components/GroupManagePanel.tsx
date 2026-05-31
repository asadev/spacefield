"use client";

/* WhatsApp inbox v2 — Wave 4 · EPIC-10 Group management.
 *
 * Modal-ish panel for one group: live participants (+ admin badges) refreshed
 * from Evolution, subject/description edit, announce-only + locked-info
 * toggles, add/remove/promote/demote participants, and invite-link get/revoke.
 * "Invite-only" / "not-admin" failures surface as a friendly inline error
 * (the server returns the upstream Evolution text with HTTP 502).
 *
 * Mounted on demand from GroupsTab (kept out of the initial chunk).
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchGroupDetail,
  fetchPickContacts,
  groupAction,
  type WaGroupDetail,
  type WaPickContact,
} from "./api";
import { DangerButton, ErrorBlock, MiniIcon, PrimaryButton, SecondaryButton } from "./ui";

interface Props {
  workspaceId: string;
  groupId: string;
  onClose: () => void;
  onChanged: () => void;
  compact?: boolean;
}

function jidToNumber(jid: string): string {
  return (jid.split("@")[0] ?? jid).replace(/\D/g, "");
}

export default function GroupManagePanel({
  workspaceId,
  groupId,
  onClose,
  onChanged,
  compact,
}: Props) {
  const [detail, setDetail] = useState<WaGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchGroupDetail(workspaceId, groupId);
    if (res.ok) {
      setDetail(res.data);
      setSubject(res.data.name ?? "");
      setDescription(res.data.description ?? "");
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [workspaceId, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (
      key: string,
      action: Parameters<typeof groupAction>[2],
      payload?: Parameters<typeof groupAction>[3],
    ) => {
      setBusy(key);
      setError(null);
      const res = await groupAction(workspaceId, groupId, action, payload);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return res;
      }
      if (action === "leave") {
        onChanged();
        onClose();
        return res;
      }
      await load();
      onChanged();
      return res;
    },
    [workspaceId, groupId, load, onChanged, onClose],
  );

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  return (
    <div
      className={
        compact
          ? "absolute inset-0 z-30 flex flex-col bg-app"
          : "fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      }
    >
      <div
        className={
          compact
            ? "flex h-full w-full flex-col"
            : "flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-app bg-app shadow-xl"
        }
      >
        <header className="flex shrink-0 items-center justify-between border-b border-app bg-app-elevated px-4 py-2.5">
          <span className="truncate font-semibold text-app">
            {detail?.name ?? "Group"}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-secondary hover:bg-surface hover:text-app"
            aria-label="Close"
          >
            <MiniIcon name="close" size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {error ? <ErrorBlock body={error} onRetry={load} /> : null}
          {loading && !detail ? (
            <p className="text-sm text-faint">Loading group…</p>
          ) : !detail ? (
            <p className="text-sm text-faint">Group unavailable.</p>
          ) : (
            <>
              {/* subject + description */}
              <section className="space-y-2">
                <Label>Group info</Label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
                  placeholder="Group subject"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
                  placeholder="Description"
                />
                <div className="flex gap-2">
                  <PrimaryButton
                    loading={busy === "subject"}
                    onClick={() => act("subject", "update_subject", { subject })}
                  >
                    Save name
                  </PrimaryButton>
                  <SecondaryButton onClick={() => act("desc", "update_description", { description })}>
                    Save description
                  </SecondaryButton>
                </div>
              </section>

              {/* settings toggles */}
              <section className="space-y-2">
                <Label>Settings</Label>
                <Toggle
                  label="Announce-only (only admins can send)"
                  checked={detail.is_announce}
                  busy={busy === "announce"}
                  onChange={(v) => act("announce", "set_announce", { value: v })}
                />
                <Toggle
                  label="Locked info (only admins can edit group)"
                  checked={detail.is_locked}
                  busy={busy === "locked"}
                  onChange={(v) => act("locked", "set_locked", { value: v })}
                />
              </section>

              {/* invite link */}
              <section className="space-y-2">
                <Label>Invite link</Label>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton
                    onClick={async () => {
                      const res = await act("invite", "invite_code");
                      if (res.ok && res.data.invite_url) setInviteUrl(res.data.invite_url);
                    }}
                  >
                    Get link
                  </SecondaryButton>
                  <DangerButton
                    onClick={async () => {
                      const res = await act("revoke", "revoke_invite");
                      if (res.ok) setInviteUrl(res.data.invite_url ?? null);
                    }}
                  >
                    Revoke + reissue
                  </DangerButton>
                </div>
                {inviteUrl ? (
                  <div className="break-all rounded border border-app bg-app-elevated px-2 py-1 font-mono text-[0.7rem] text-tool-accent">
                    {inviteUrl}
                  </div>
                ) : null}
              </section>

              {/* add participants */}
              <AddParticipants
                workspaceId={workspaceId}
                busy={busy === "add"}
                onAdd={(numbers) => act("add", "add_participants", { participants: numbers })}
              />

              {/* participants list */}
              <section className="space-y-1">
                <Label>Participants ({detail.participants.length})</Label>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {detail.participants.map((p) => {
                    const num = jidToNumber(p.jid);
                    return (
                      <div
                        key={p.jid}
                        className="flex items-center gap-2 rounded border border-app bg-app-elevated px-2 py-1.5"
                      >
                        <span className="flex-1 truncate font-mono text-xs text-app">
                          +{num}
                        </span>
                        {p.isAdmin ? (
                          <span className="rounded-full bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.14em] text-tool-accent">
                            admin
                          </span>
                        ) : null}
                        <div className="flex gap-1">
                          {p.isAdmin ? (
                            <RowBtn onClick={() => act("demote", "demote", { participants: [num] })}>
                              Demote
                            </RowBtn>
                          ) : (
                            <RowBtn onClick={() => act("promote", "promote", { participants: [num] })}>
                              Promote
                            </RowBtn>
                          )}
                          <RowBtn
                            danger
                            onClick={() => act("remove", "remove_participants", { participants: [num] })}
                          >
                            Remove
                          </RowBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* leave */}
              <section className="border-t border-app pt-3">
                <DangerButton onClick={() => act("leave", "leave")}>
                  Leave group
                </DangerButton>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddParticipants({
  workspaceId,
  busy,
  onAdd,
}: {
  workspaceId: string;
  busy: boolean;
  onAdd: (numbers: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WaPickContact[]>([]);
  const [picked, setPicked] = useState<WaPickContact[]>([]);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      const res = await fetchPickContacts(workspaceId, q, true);
      if (res.ok) setResults(res.data);
    },
    [workspaceId],
  );

  return (
    <section className="space-y-2">
      <Label>Add participants</Label>
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search contacts…"
        className="w-full rounded-lg border border-app bg-transparent px-3 py-2 text-sm text-app"
      />
      {results.length > 0 ? (
        <div className="max-h-32 overflow-y-auto rounded-lg border border-app">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setPicked((prev) => (prev.find((p) => p.id === c.id) ? prev : [...prev, c]));
                setResults([]);
                setQuery("");
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-app hover:bg-surface"
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {picked.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {picked.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs text-secondary"
              >
                {c.name || c.phone}
                <button
                  onClick={() => setPicked((prev) => prev.filter((p) => p.id !== c.id))}
                  className="text-faint"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <PrimaryButton
            loading={busy}
            onClick={() => {
              const nums = picked
                .map((c) => (c.phone ?? "").replace(/\D/g, ""))
                .filter(Boolean);
              if (nums.length) onAdd(nums);
              setPicked([]);
            }}
          >
            Add {picked.length} to group
          </PrimaryButton>
        </>
      ) : null}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  busy,
  onChange,
}: {
  label: string;
  checked: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={busy}
      className="flex w-full items-center justify-between rounded-lg border border-app bg-app-elevated px-3 py-2 text-left text-sm text-app disabled:opacity-60"
    >
      <span className="pr-2 text-xs">{label}</span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-tool-accent" : "bg-surface"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function RowBtn({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.12em] ${
        danger
          ? "border-rose-500/40 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
          : "border-app text-secondary hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}
