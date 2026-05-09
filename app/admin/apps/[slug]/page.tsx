import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
  listAuthUsers,
} from "../../_lib";
import type { AppRegistryRow } from "../../_types";
import { TIER_IDS } from "../../_types";
import {
  clearUserGrant,
  clearWorkspaceGrant,
  setUserGrant,
  setWorkspaceGrant,
  togglePublished,
  updateApp,
} from "../_actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    user_q?: string;
    test_uid?: string;
    test_ws?: string;
  }>;
};

const ACCESS_MODES = [
  { value: "public", label: "Public — anyone (no auth)" },
  { value: "authenticated", label: "Authenticated — any signed-in user" },
  { value: "tier", label: "Tier — limited to selected tiers" },
  { value: "allowlist", label: "Allowlist — only listed user UUIDs" },
  { value: "admin_only", label: "Admin only" },
] as const;

const DOMAIN_LABELS: Record<string, string> = {
  re: "Real Estate",
  solutions: "Solutions",
  os: "OS shell",
  admin: "Admin",
};

type WorkspaceGrantRow = {
  workspace_id: string;
  granted: boolean;
  granted_by: string | null;
  created_at: string;
  workspace: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
};

type UserGrantRow = {
  user_id: string;
  granted: boolean;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
};

type WorkspaceLite = {
  id: string;
  name: string;
};

async function togglePublishedAction(formData: FormData): Promise<void> {
  "use server";
  await togglePublished(formData);
}

async function updateAppAction(formData: FormData): Promise<void> {
  "use server";
  await updateApp(formData);
}

async function setWorkspaceGrantAction(formData: FormData): Promise<void> {
  "use server";
  await setWorkspaceGrant(formData);
}

async function clearWorkspaceGrantAction(formData: FormData): Promise<void> {
  "use server";
  await clearWorkspaceGrant(formData);
}

async function setUserGrantAction(formData: FormData): Promise<void> {
  "use server";
  await setUserGrant(formData);
}

async function clearUserGrantAction(formData: FormData): Promise<void> {
  "use server";
  await clearUserGrant(formData);
}

export default async function AdminAppDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const userQ = (sp.user_q ?? "").trim();
  const testUid = (sp.test_uid ?? "").trim();
  const testWs = (sp.test_ws ?? "").trim();

  const admin = createAdminClient();

  const [appRes, wsGrantsRes, userGrantsRes, workspacesRes] = await Promise.all(
    [
      admin.from("app_registry").select("*").eq("id", slug).maybeSingle(),
      admin
        .from("workspace_tool_grants")
        .select(
          "workspace_id, granted, granted_by, created_at, workspace:workspaces(id,name)"
        )
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("user_app_grants")
        .select("user_id, granted, granted_by, reason, created_at")
        .eq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(200),
      // pull every workspace for the picker. Volumes are admin-scoped
      // so a 1000-row cap is plenty.
      admin
        .from("workspaces")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(1000),
    ]
  );

  const app = (appRes.data as AppRegistryRow | null) ?? null;
  if (!app) notFound();

  const wsGrants = (wsGrantsRes.data ?? []) as WorkspaceGrantRow[];
  const userGrants = (userGrantsRes.data ?? []) as UserGrantRow[];
  const workspaces = (workspacesRes.data ?? []) as WorkspaceLite[];

  // Resolve emails for every user_app_grants row.
  const grantUserIds = userGrants.map((g) => g.user_id);
  const grantedByIds = userGrants
    .map((g) => g.granted_by)
    .filter((v): v is string => Boolean(v));
  const wsGrantedByIds = wsGrants
    .map((g) => g.granted_by)
    .filter((v): v is string => Boolean(v));
  const allUserIds = Array.from(
    new Set([...grantUserIds, ...grantedByIds, ...wsGrantedByIds])
  );
  const userMap = await fetchAuthUsersByIds(allUserIds);

  // Optional admin-side email lookup for the "add user grant" picker.
  let userQuery: { id: string; email: string | null }[] = [];
  if (userQ) {
    const search = await listAuthUsers({
      page: 1,
      perPage: 25,
      emailLike: userQ,
    });
    userQuery = search.rows.map((r) => ({ id: r.id, email: r.email }));
  }

  // Run the visibility tester if the admin filled both fields.
  let visibilityResult: unknown = null;
  let visibilityError: string | null = null;
  if (testUid) {
    try {
      const { data, error } = await admin.rpc("app_visible", {
        app_slug: slug,
        uid: testUid,
        ws_id: testWs || null,
      });
      if (error) {
        visibilityError = error.message;
      } else {
        visibilityResult = data;
      }
    } catch (e) {
      visibilityError = e instanceof Error ? e.message : String(e);
    }
  }

  const accessTiers = Array.isArray(app.access_tiers) ? app.access_tiers : [];
  const allowlistText = Array.isArray(app.allowlist_user_ids)
    ? app.allowlist_user_ids.join("\n")
    : "";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/admin/apps"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Apps & Features
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">{app.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {app.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
              <span className="rounded-md border border-app bg-app px-2 py-1 font-mono tabular-nums">
                {app.id}
              </span>
              <span className="rounded-md border border-app bg-app px-2 py-1">
                {DOMAIN_LABELS[app.domain] ?? app.domain}
              </span>
              {app.category && (
                <span className="rounded-md border border-app bg-app px-2 py-1">
                  {app.category}
                </span>
              )}
              <span className="rounded-md border border-app bg-app px-2 py-1">
                sort {app.sort_order}
              </span>
            </div>
          </div>

          <form
            action={togglePublishedAction}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="slug" value={app.id} />
            <input
              type="hidden"
              name="next"
              value={app.published ? "false" : "true"}
            />
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                app.published
                  ? "bg-emerald-500/15 text-emerald-500"
                  : "bg-rose-500/15 text-rose-500"
              }`}
            >
              {app.published ? "Published" : "Hidden"}
            </span>
            <button type="submit" className={buttonGhostClass}>
              {app.published ? "Unpublish" : "Publish"}
            </button>
          </form>
        </div>
      </div>

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Edit app</h2>
        <p className="mt-1 text-xs text-muted">
          Updates apply immediately. Allowlist is one user UUID per line.
        </p>
        <form action={updateAppAction} className="mt-4 grid gap-4">
          <input type="hidden" name="slug" value={app.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Title</span>
              <input
                name="title"
                defaultValue={app.title}
                required
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Category</span>
              <input
                name="category"
                defaultValue={app.category}
                placeholder="e.g. real-estate, social, finance"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Description</span>
            <textarea
              name="description"
              defaultValue={app.description}
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Icon</span>
              <input
                name="icon"
                defaultValue={app.icon ?? ""}
                placeholder="emoji or asset path"
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Sort order</span>
              <input
                name="sort_order"
                type="number"
                step={1}
                defaultValue={app.sort_order}
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Access mode</span>
              <select
                name="access_mode"
                defaultValue={app.access_mode}
                className={inputClass}
              >
                {ACCESS_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <fieldset className="rounded-lg border border-app bg-app p-3">
              <legend className="px-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                Access tiers (when mode = tier)
              </legend>
              <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                {TIER_IDS.map((tier) => {
                  const checked = accessTiers.includes(tier);
                  return (
                    <label
                      key={tier}
                      className="flex items-center gap-2 rounded-md border border-app bg-app-elevated px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        name="access_tier"
                        value={tier}
                        defaultChecked={checked}
                        className="h-4 w-4 accent-[var(--tool-accent,#7c3aed)]"
                      />
                      <span className="text-app capitalize">{tier}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="block text-xs">
              <span className="mb-1 block text-faint">
                Allowlist user IDs (one UUID per line)
              </span>
              <textarea
                name="allowlist_user_ids"
                defaultValue={allowlistText}
                rows={6}
                placeholder="00000000-0000-0000-0000-000000000000"
                className={`${inputClass} resize-y font-mono text-[11px] tabular-nums`}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
          </div>
        </form>

        <div className="mt-4 grid gap-2 text-[11px] text-muted sm:grid-cols-3">
          <div>
            Last updated: {formatDateTime(app.updated_at)}
            {app.updated_by ? (
              <span className="ml-1 text-faint">
                by {userMap.get(app.updated_by)?.email ?? app.updated_by.slice(0, 8)}
              </span>
            ) : null}
          </div>
          <div>Created: {formatDateTime(app.created_at)}</div>
          <div>
            Workspace overrides: {wsGrants.length} · User overrides:{" "}
            {userGrants.length}
          </div>
        </div>
      </section>

      {/* Workspace overrides */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Workspace overrides</h2>
        <p className="mt-1 text-xs text-muted">
          Per-workspace grant. Wins over the tier baseline. Block keeps a
          workspace out even when their tier would allow.
        </p>

        <form
          action={setWorkspaceGrantAction}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]"
        >
          <input type="hidden" name="slug" value={app.id} />
          <select name="workspace_id" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Pick a workspace…
            </option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name || w.id}
              </option>
            ))}
          </select>
          <select name="granted" defaultValue="true" className={inputClass}>
            <option value="true">Allow</option>
            <option value="false">Block</option>
          </select>
          <button type="submit" className={buttonGhostClass}>
            Save override
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {wsGrants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              No workspace-specific overrides.
            </div>
          ) : (
            wsGrants.map((grant) => {
              const ws = Array.isArray(grant.workspace)
                ? grant.workspace[0]
                : grant.workspace;
              const grantedBy = grant.granted_by
                ? userMap.get(grant.granted_by)?.email ??
                  grant.granted_by.slice(0, 8)
                : "—";
              return (
                <div
                  key={grant.workspace_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {ws?.name ?? grant.workspace_id}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {grant.workspace_id}
                    </div>
                    <div className="text-[11px] text-muted">
                      Set {formatDateTime(grant.created_at)} · by {grantedBy}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        grant.granted
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {grant.granted ? "Allowed" : "Blocked"}
                    </span>
                    <form action={clearWorkspaceGrantAction}>
                      <input type="hidden" name="slug" value={app.id} />
                      <input
                        type="hidden"
                        name="workspace_id"
                        value={grant.workspace_id}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-app px-2 py-1 text-[11px] text-muted transition-colors hover:text-app"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* User overrides */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">User overrides</h2>
        <p className="mt-1 text-xs text-muted">
          Per-user grant. Wins over both tier baseline AND workspace
          override. Use sparingly.
        </p>

        {/* User search */}
        <form
          action={`/admin/apps/${encodeURIComponent(app.id)}`}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <label className="block text-xs flex-1 min-w-[16rem]">
            <span className="mb-1 block text-faint">
              Find a user by email substring
            </span>
            <input
              name="user_q"
              defaultValue={userQ}
              placeholder="example@spacefield.co"
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonGhostClass}>
            Search
          </button>
          {userQ && (
            <Link
              href={`/admin/apps/${encodeURIComponent(app.id)}`}
              className="text-[11px] text-muted underline"
            >
              Clear search
            </Link>
          )}
        </form>

        {userQ && (
          <div className="mt-3 space-y-2 rounded-lg border border-dashed border-app bg-app p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-faint">
              {userQuery.length} match{userQuery.length === 1 ? "" : "es"}
            </div>
            {userQuery.length === 0 ? (
              <div className="text-xs text-muted">
                No user matched “{userQ}”.
              </div>
            ) : (
              userQuery.map((u) => (
                <form
                  key={u.id}
                  action={setUserGrantAction}
                  className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)_auto]"
                >
                  <input type="hidden" name="slug" value={app.id} />
                  <input type="hidden" name="user_id" value={u.id} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {u.email ?? "—"}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {u.id}
                    </div>
                  </div>
                  <select
                    name="granted"
                    defaultValue="true"
                    className={inputClass}
                  >
                    <option value="true">Allow</option>
                    <option value="false">Block</option>
                  </select>
                  <input
                    name="reason"
                    placeholder="Reason (optional)"
                    className={inputClass}
                  />
                  <button type="submit" className={buttonGhostClass}>
                    Save
                  </button>
                </form>
              ))
            )}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {userGrants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              No per-user overrides.
            </div>
          ) : (
            userGrants.map((grant) => {
              const u = userMap.get(grant.user_id);
              const grantedBy = grant.granted_by
                ? userMap.get(grant.granted_by)?.email ??
                  grant.granted_by.slice(0, 8)
                : "—";
              return (
                <div
                  key={grant.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {u?.email ?? "—"}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {grant.user_id}
                    </div>
                    <div className="text-[11px] text-muted">
                      {grant.reason ? (
                        <span className="text-secondary">
                          “{grant.reason}”
                        </span>
                      ) : (
                        <span className="text-faint">no reason</span>
                      )}
                      <span className="mx-1">·</span>
                      Set {formatDateTime(grant.created_at)} · by {grantedBy}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        grant.granted
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {grant.granted ? "Allowed" : "Blocked"}
                    </span>
                    <form action={clearUserGrantAction}>
                      <input type="hidden" name="slug" value={app.id} />
                      <input
                        type="hidden"
                        name="user_id"
                        value={grant.user_id}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-app px-2 py-1 text-[11px] text-muted transition-colors hover:text-app"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Visibility tester */}
      <section className="rounded-xl border border-app bg-app-elevated p-4">
        <h2 className="text-sm font-semibold text-app">Visibility tester</h2>
        <p className="mt-1 text-xs text-muted">
          Calls <code className="text-secondary">app_visible(slug, uid, ws_id)</code> on
          the database and shows the verdict. Workspace UUID is optional.
        </p>
        <form
          action={`/admin/apps/${encodeURIComponent(app.id)}`}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          {userQ && <input type="hidden" name="user_q" value={userQ} />}
          <input
            name="test_uid"
            defaultValue={testUid}
            placeholder="User UUID"
            className={`${inputClass} font-mono text-xs tabular-nums`}
          />
          <input
            name="test_ws"
            defaultValue={testWs}
            placeholder="Workspace UUID (optional)"
            className={`${inputClass} font-mono text-xs tabular-nums`}
          />
          <button type="submit" className={buttonGhostClass}>
            Run test
          </button>
        </form>

        {testUid ? (
          <div className="mt-4 rounded-lg border border-app bg-app p-3 text-xs">
            {visibilityError ? (
              <div className="text-rose-500">RPC error: {visibilityError}</div>
            ) : (
              <pre className="overflow-x-auto font-mono text-[11px] tabular-nums text-app">
                {JSON.stringify(visibilityResult, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
            Enter a user UUID to evaluate visibility for that user.
          </div>
        )}
      </section>
    </div>
  );
}
