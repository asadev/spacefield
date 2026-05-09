import Link from "next/link";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  inputClass,
  listAuthUsers,
} from "../../_lib";
import { createRequest } from "../_actions";
import {
  EXPORT_KIND_HINTS,
  EXPORT_KIND_LABELS,
  EXPORT_KINDS,
  type DataExportKind,
} from "../_helpers";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  user_id?: string;
  kind?: string;
};

export default async function NewDataExportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const selectedUserId = (sp.user_id ?? "").trim();
  const kind = (EXPORT_KINDS as readonly string[]).includes(sp.kind ?? "")
    ? (sp.kind as DataExportKind)
    : "gdpr_export";

  let users: { id: string; email: string | null }[] = [];
  if (q) {
    const r = await listAuthUsers({ emailLike: q, perPage: 25 });
    users = r.rows;
  }

  let selectedUserEmail: string | null = null;
  if (selectedUserId) {
    const m = await fetchAuthUsersByIds([selectedUserId]);
    selectedUserEmail = m.get(selectedUserId)?.email ?? null;
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/data-exports"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Data exports
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          New export request
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick a user (optional for workspace exports), the request kind
          and add notes for the operator who will run the export.
        </p>
      </div>

      {/* Step 1: pick user */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">1. Pick user</h2>
        <p className="mt-1 text-xs text-muted">
          Search auth.users by email substring. Required for{" "}
          <code>gdpr_export</code> and <code>deletion</code>; optional for{" "}
          <code>workspace_export</code>.
        </p>
        <form
          method="get"
          action="/admin/data-exports/new"
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
          <input type="hidden" name="kind" value={kind} />
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
                    kind,
                  });
                  const isSelected = u.id === selectedUserId;
                  return (
                    <li key={u.id}>
                      <Link
                        href={`/admin/data-exports/new?${params.toString()}`}
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

      {/* Step 2: kind picker (GET, no save) */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">2. Pick kind</h2>
        <form
          method="get"
          action="/admin/data-exports/new"
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          {q && <input type="hidden" name="q" value={q} />}
          {selectedUserId && (
            <input type="hidden" name="user_id" value={selectedUserId} />
          )}
          <select name="kind" defaultValue={kind} className={inputClass}>
            {EXPORT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXPORT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Switch kind
          </button>
        </form>
        <div className="mt-2 text-[11px] text-faint">
          {EXPORT_KIND_HINTS[kind]}
        </div>
      </section>

      {/* Step 3: save */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">3. Notes &amp; create</h2>

        <form action={createRequest} className="mt-4 space-y-4">
          <input type="hidden" name="kind" value={kind} />
          {selectedUserId && (
            <input type="hidden" name="user_id" value={selectedUserId} />
          )}

          <Field
            label="Notes"
            hint="Why this request was filed and any context the operator needs."
          >
            <textarea
              name="notes"
              rows={5}
              placeholder="e.g. Submitted via support ticket #SF-1234."
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Create request
            </button>
            <Link href="/admin/data-exports" className={buttonGhostClass}>
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
