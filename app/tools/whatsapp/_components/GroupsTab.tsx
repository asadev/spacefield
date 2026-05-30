"use client";

import { useState, useEffect, useCallback } from "react";

interface WaGroup {
  id: string;
  name: string | null;
  evolution_group_id: string;
  member_count: number;
  members_synced_at: string | null;
  created_at: string;
}

interface GroupsTabProps {
  workspaceId: string;
  // Accepted for parity with the other WhatsApp tabs (OS-shell passes it);
  // this tab's layout doesn't branch on it yet.
  compact?: boolean;
}

export default function GroupsTab({ workspaceId }: GroupsTabProps) {
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [needsSync, setNeedsSync] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/whatsapp/groups?workspace_id=${workspaceId}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load groups");
      setGroups(data.items || []);
      setNeedsSync(Boolean(data.needs_sync));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const syncGroups = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/groups/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync groups");
      await loadGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  }, [workspaceId, loadGroups]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Create-group state
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<
    { id: string; label: string }[]
  >([]);
  const [contactResults, setContactResults] = useState<
    { id: string; label: string }[]
  >([]);

  const createGroup = useCallback(async () => {
    if (!groupName.trim() || selectedContacts.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: groupName.trim(),
          contact_ids: selectedContacts.map((c) => c.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create group");
      setGroupName("");
      setSelectedContacts([]);
      setShowCreate(false);
      await loadGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }, [groupName, selectedContacts, workspaceId, loadGroups]);

  const searchContacts = useCallback(
    async (q: string) => {
      setContactQuery(q);
      if (q.trim().length < 2) {
        setContactResults([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/whatsapp/contacts?workspace_id=${workspaceId}&q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (res.ok) setContactResults(data.items || []);
      } catch {
        // ignore search errors
      }
    },
    [workspaceId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          WhatsApp Groups
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={syncGroups}
            disabled={syncing}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync groups"}
          </button>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
          >
            {showCreate ? "Cancel" : "New group"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <div>
            <input
              type="text"
              value={contactQuery}
              onChange={(e) => searchContacts(e.target.value)}
              placeholder="Search contacts to add…"
              className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
            {contactResults.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)]">
                {contactResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedContacts((prev) =>
                        prev.find((p) => p.id === c.id)
                          ? prev
                          : [...prev, c],
                      );
                      setContactResults([]);
                      setContactQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {selectedContacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedContacts.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs"
                  >
                    {c.label}
                    {/* remove chip */}
                    <button
                      onClick={() =>
                        setSelectedContacts((prev) =>
                          prev.filter((p) => p.id !== c.id),
                        )
                      }
                      className="text-[var(--text-tertiary)]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={createGroup}
            disabled={creating || !groupName.trim() || selectedContacts.length === 0}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
      )}

      {/* render the synced groups list */}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading ? (
        <p className="text-sm text-[var(--text-tertiary)]">Loading…</p>
      ) : groups.length === 0 && needsSync ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No groups synced yet.
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Sync to pull this number&apos;s WhatsApp groups so you can message
            them and see group names in your conversations.
          </p>
          <button
            onClick={syncGroups}
            disabled={syncing}
            className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync groups now"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3"
            >
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  {g.name || g.evolution_group_id}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {g.member_count} members
                </p>
              </div>
            </div>
          ))}
          {groups.length === 0 && !loading && (
            <p className="text-sm text-[var(--text-tertiary)]">
              No groups yet. Create one above or sync from WhatsApp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
