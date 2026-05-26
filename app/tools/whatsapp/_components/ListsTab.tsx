"use client";

/* Lists tab — saved CRM-contact lists for bulk WhatsApp sending.
 *
 * A "list" is a Spacefield-side group (not a WhatsApp group). Sends to a
 * list dispatch individual 1:1 messages so:
 *   - recipients don't see each other
 *   - delivery is metered against the warm-up cap
 *   - template variants randomise wording for anti-ban
 */

import { useCallback, useEffect, useState } from "react";
import {
  createList,
  deleteList,
  fetchLists,
  type WaList,
} from "./api";
import ContactPicker from "./ContactPicker";
import WhatsAppMessageComposer from "@/components/whatsapp/WhatsAppMessageComposer";
import {
  DangerButton,
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  estimateSendDuration,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

export default function ListsTab({ workspaceId, compact }: Props) {
  const [lists, setLists] = useState<WaList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<WaList | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchLists(workspaceId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLists(res.data);
    // If a selected list was deleted upstream, drop the selection
    if (selected && !res.data.find((l) => l.id === selected.id)) {
      setSelected(null);
    }
  }, [workspaceId, selected]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const handleDelete = useCallback(
    async (list: WaList) => {
      if (!confirm(`Delete "${list.name}"? Contacts stay in your CRM.`)) return;
      setDeleteBusy(true);
      const res = await deleteList(workspaceId, list.id);
      setDeleteBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (selected?.id === list.id) setSelected(null);
      await refresh();
    },
    [refresh, selected, workspaceId]
  );

  return (
    <div className={`flex h-full bg-app ${compact ? "flex-col" : "flex-row"}`}>
      {/* List view */}
      <section
        className={`flex flex-col border-r border-app bg-app-elevated ${
          compact ? "w-full" : "w-[360px] min-w-[300px]"
        } ${compact && selected ? "hidden" : ""}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-app p-2">
          <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
            Saved lists · {lists.length}
          </h3>
          <PrimaryButton onClick={() => setCreateOpen(true)}>
            <MiniIcon name="plus" /> New
          </PrimaryButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-faint">loading…</div>
          ) : error ? (
            <div className="p-3">
              <ErrorBlock body={error} onRetry={refresh} />
            </div>
          ) : lists.length === 0 ? (
            <EmptyState
              kicker="whatsapp.lists"
              compact={compact}
              title="No saved lists yet"
              body={
                <span>
                  Lists hold a snapshot of CRM contacts to message in bulk.
                  Useful for cohorts like &ldquo;Eid repeat buyers&rdquo; or
                  &ldquo;Lapsed leads, last 90 days&rdquo;.
                </span>
              }
              cta={
                <PrimaryButton onClick={() => setCreateOpen(true)}>
                  <MiniIcon name="plus" /> Create list
                </PrimaryButton>
              }
            />
          ) : (
            <ul role="list" className="divide-y divide-app">
              {lists.map((l) => {
                const active = selected?.id === l.id;
                const count = l.contact_count ?? l.contact_ids.length;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(l)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                        active ? "bg-tool-accent-soft" : "hover:bg-surface"
                      }`}
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tool-accent-soft text-tool-accent">
                        <MiniIcon name="list" size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-app">
                            {l.name}
                          </span>
                          <Pill>{count}</Pill>
                        </div>
                        <div className="text-[0.6rem] text-faint">
                          Last used {formatRelative(l.last_used_at)}
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
            kicker="whatsapp.lists"
            compact={compact}
            title="Pick a list"
            body={<span>Select a list to send the same message to everyone in it.</span>}
          />
        ) : (
          <ListDetail
            workspaceId={workspaceId}
            list={selected}
            compact={compact}
            onBack={() => setSelected(null)}
            onDelete={() => handleDelete(selected)}
            deleting={deleteBusy}
          />
        )}
      </section>

      {createOpen ? (
        <CreateListModal
          workspaceId={workspaceId}
          onClose={() => setCreateOpen(false)}
          onCreated={async (list) => {
            setCreateOpen(false);
            setSelected(list);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ListDetail({
  workspaceId,
  list,
  compact,
  onBack,
  onDelete,
  deleting,
}: {
  workspaceId: string;
  list: WaList;
  compact: boolean;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const count = list.contact_count ?? list.contact_ids.length;
  const eta = estimateSendDuration(count);
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app">
      <header className="flex shrink-0 items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        {compact ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 text-secondary hover:bg-surface"
            aria-label="Back to lists"
          >
            <MiniIcon name="close" size={16} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-app">{list.name}</div>
          <div className="text-[0.65rem] font-mono text-faint">
            {count} contact{count === 1 ? "" : "s"} · last used {formatRelative(list.last_used_at)}
          </div>
        </div>
        <DangerButton onClick={onDelete} disabled={deleting}>
          <MiniIcon name="trash" /> Delete
        </DangerButton>
      </header>

      <div className="flex-1 space-y-3 p-3">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 font-semibold">
            <MiniIcon name="warning" /> Bulk send throttle
          </div>
          <p className="mt-1 text-xs opacity-90">
            Sending to {count} contact{count === 1 ? "" : "s"} will take ~{eta} at
            the workspace&rsquo;s current cap. Variants are recommended to avoid
            ban detection.
          </p>
        </div>

        <h4 className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          Compose
        </h4>
        <WhatsAppMessageComposer
          workspaceId={workspaceId}
          defaultTargetType="list"
          defaultTargetId={list.id}
          fixedTarget
          showVariants
          onSend={() => undefined}
        />
      </div>
    </div>
  );
}

function CreateListModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (list: WaList) => void;
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
        setError("Name is required.");
        return;
      }
      if (contactIds.length === 0) {
        setError("Add at least one contact.");
        return;
      }
      setBusy(true);
      const res = await createList(workspaceId, name.trim(), contactIds);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated(res.data.list);
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
            <h3 className="text-base font-semibold text-app">Create saved list</h3>
            <p className="mt-0.5 text-xs text-secondary">
              Lists are private to this workspace and editable later.
            </p>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <label className="block">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Eid repeat buyers"
                maxLength={64}
                className="mt-1 w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
                required
              />
            </label>

            <div>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
                Contacts
              </span>
              <div className="mt-1">
                <ContactPicker
                  workspaceId={workspaceId}
                  selectedIds={contactIds}
                  onChange={setContactIds}
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
              Create list
            </PrimaryButton>
          </footer>
        </form>
      </div>
    </div>
  );
}
