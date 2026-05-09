import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  inputClass,
  listAuthUsers,
} from "../../_lib";
import { mintTokenAction } from "../_actions";

import { API_SCOPES } from "../../_types";

export const dynamic = "force-dynamic";

type WorkspaceRow = { id: string; name: string | null };

type SearchParams = {
  q?: string;
  user_id?: string;
};

const SCOPE_HINTS: Record<(typeof API_SCOPES)[number], string> = {
  "read:profile": "Read user profile + workspace memberships.",
  "read:workspaces": "List workspaces, members, settings.",
  "read:files": "List + download workspace files.",
  "write:files": "Upload + delete workspace files.",
  "read:crm": "Read CRM contacts, deals, forms.",
  "write:crm": "Mutate CRM contacts, deals, forms.",
  "read:boards": "Read boards, columns, cards.",
  "write:boards": "Mutate boards, columns, cards.",
  "agent:dispatch": "Trigger agent runs on the user's behalf.",
  "admin:read": "Admin-only: read every table the panel reads.",
  "admin:write": "Admin-only: mutate platform state. Use sparingly.",
};

export default async function MintApiTokenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const selectedUserId = (sp.user_id ?? "").trim();

  let users: { id: string; email: string | null }[] = [];
  if (q) {
    const r = await listAuthUsers({ emailLike: q, perPage: 25 });
    users = r.rows;
  }

  // Pull a small set of workspaces for the dropdown. The form won't
  // submit if you pick a stale workspace because the FK insert would
  // fail; the dropdown is just a convenience.
  const admin = createAdminClient();
  const { data: wsRows } = await admin
    .from("workspaces")
    .select("id, name, user_id")
    .order("created_at", { ascending: false })
    .limit(200);
  const workspaces = (wsRows ?? []) as (WorkspaceRow & { user_id: string })[];

  // If a user is selected, narrow workspaces to ones they own or are a
  // member of so you can't accidentally mint a token bound to a workspace
  // the user has no relationship with.
  let scopedWorkspaces = workspaces;
  let selectedUserEmail: string | null = null;
  if (selectedUserId) {
    const [memberRes, userRes] = await Promise.all([
      admin
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", selectedUserId),
      admin.auth.admin.getUserById(selectedUserId).catch(() => null),
    ]);
    selectedUserEmail = userRes?.data?.user?.email ?? null;
    const ownIds = new Set(
      workspaces.filter((w) => w.user_id === selectedUserId).map((w) => w.id)
    );
    for (const m of (memberRes.data ?? []) as { workspace_id: string }[]) {
      ownIds.add(m.workspace_id);
    }
    scopedWorkspaces = workspaces.filter((w) => ownIds.has(w.id));
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/api-tokens"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← API tokens
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">Mint API token</h1>
        <p className="mt-0.5 text-xs text-muted">
          Generates a 32-byte token. The raw value is shown ONCE on the
          tokens index page after you submit. Persist it then.
        </p>
      </div>

      {/* Step 1: pick user */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">1. Pick user</h2>
        <p className="mt-1 text-xs text-muted">
          Search auth.users by email substring. The token will be bound
          to this user_id.
        </p>
        <form
          method="get"
          action="/admin/api-tokens/new"
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="email contains..."
            className={`${inputClass} h-9`}
          />
          {selectedUserId && (
            <input type="hidden" name="user_id" value={selectedUserId} />
          )}
          <button type="submit" className={buttonGhostClass}>
            Search
          </button>
        </form>

        {q && (
          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-app bg-app">
            {users.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-faint">
                No users match.
              </div>
            ) : (
              <ul className="divide-y divide-app">
                {users.map((u) => {
                  const params = new URLSearchParams({
                    q,
                    user_id: u.id,
                  });
                  const isSelected = u.id === selectedUserId;
                  return (
                    <li key={u.id}>
                      <Link
                        href={`/admin/api-tokens/new?${params.toString()}`}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-app-elevated ${
                          isSelected
                            ? "bg-tool-accent-soft text-tool-accent"
                            : "text-app"
                        }`}
                      >
                        <span>{u.email ?? "(no email)"}</span>
                        <span className="font-mono text-[10px] text-faint">
                          {u.id.slice(0, 8)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {selectedUserId && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            Selected:{" "}
            <span className="font-mono">
              {selectedUserEmail ?? selectedUserId}
            </span>
          </div>
        )}
      </section>

      {/* Step 2: token form. Disabled if no user picked. */}
      <section
        className={`rounded-xl border p-5 transition-colors ${
          selectedUserId
            ? "border-app bg-app-elevated"
            : "border-app/60 bg-app-elevated/40"
        }`}
      >
        <h2 className="text-sm font-semibold text-app">
          2. Token details
        </h2>
        {!selectedUserId && (
          <p className="mt-1 text-xs text-muted">
            Pick a user above to enable this form.
          </p>
        )}

        <form action={mintTokenAction} className="mt-4 space-y-4">
          <input type="hidden" name="user_id" value={selectedUserId} />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" hint="Free-text. Shown in the index.">
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. backups daemon"
                disabled={!selectedUserId}
                className={inputClass}
              />
            </Field>
            <Field label="Workspace (optional)">
              <select
                name="workspace_id"
                defaultValue=""
                disabled={!selectedUserId}
                className={inputClass}
              >
                <option value="_global">Global (no workspace)</option>
                {scopedWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Scopes"
            hint="Token can only call endpoints that match a granted scope."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {API_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-app bg-app p-2.5 text-sm transition-colors hover:border-tool-accent has-[:checked]:border-tool-accent has-[:checked]:bg-tool-accent-soft"
                >
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    disabled={!selectedUserId}
                    className="mt-0.5 h-4 w-4 accent-tool-accent"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-app">
                      {scope}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {SCOPE_HINTS[scope]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Expires" hint="Optional. Leave blank for never.">
            <input
              type="date"
              name="expires_at"
              disabled={!selectedUserId}
              className={`${inputClass} max-w-[200px]`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!selectedUserId}
              className={buttonClass}
            >
              Mint token
            </button>
            <Link href="/admin/api-tokens" className={buttonGhostClass}>
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
