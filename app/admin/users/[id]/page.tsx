import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  sendPasswordResetLinkForm,
  setUserTier,
  toggleUserAdmin,
} from "../../_actions";
import Avatar from "../../_components/Avatar";
import {
  fetchAuthUsersByIds,
  formatBytes,
  formatDateTime,
  inputClass,
  tierBadgeClass,
} from "../../_lib";

export const dynamic = "force-dynamic";

type Profile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  designation: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_admin: boolean | null;
  created_at: string;
};

type Subscription = {
  user_id: string;
  tier_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
};

type Tier = {
  tier_id: string;
  name: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
};

type WorkspaceMember = {
  workspace_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const [profileRes, subRes, tiersRes, ownedRes, joinedMembershipRes] =
    await Promise.all([
      admin.from("profiles").select("*").eq("user_id", id).maybeSingle(),
      admin.from("subscriptions").select("*").eq("user_id", id).maybeSingle(),
      admin
        .from("subscription_tiers")
        .select("tier_id, name")
        .order("sort_order", { ascending: true }),
      admin
        .from("workspaces")
        .select("id, name, user_id, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("workspace_members")
        .select("workspace_id, user_id, role, joined_at")
        .eq("user_id", id),
    ]);

  const profile = profileRes.data as Profile | null;
  const sub = subRes.data as Subscription | null;
  const tiers = (tiersRes.data ?? []) as Tier[];
  const owned = (ownedRes.data ?? []) as WorkspaceRow[];
  const memberships = (joinedMembershipRes.data ?? []) as WorkspaceMember[];

  // auth.users entry for email + created_at
  const authMap = await fetchAuthUsersByIds([id]);
  const authUser = authMap.get(id);
  if (!profile && !authUser?.id) {
    notFound();
  }

  // Joined workspaces (membership where user is not the owner)
  const joinedIds = memberships
    .filter((m) => m.role !== "owner")
    .map((m) => m.workspace_id);
  const joinedRes = joinedIds.length
    ? await admin
        .from("workspaces")
        .select("id, name, user_id, created_at")
        .in("id", joinedIds)
    : { data: [] as WorkspaceRow[], error: null };
  const joined = (joinedRes.data ?? []) as WorkspaceRow[];

  // Member counts for owned workspaces
  const ownedIds = owned.map((w) => w.id);
  const memberCountByWs = new Map<string, number>();
  if (ownedIds.length) {
    const { data } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .in("workspace_id", ownedIds);
    for (const r of (data ?? []) as Array<{ workspace_id: string }>) {
      memberCountByWs.set(
        r.workspace_id,
        (memberCountByWs.get(r.workspace_id) ?? 0) + 1
      );
    }
  }

  const name =
    profile?.full_name ||
    profile?.username ||
    authUser?.email ||
    id.slice(0, 8);
  const isAdmin = Boolean(profile?.is_admin);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/users" className="hover:text-tool-accent">
          ← Users
        </Link>
      </div>

      {/* Header card */}
      <section className="flex flex-wrap items-start gap-4 rounded-xl border border-app bg-app-elevated p-5">
        <Avatar url={profile?.avatar_url ?? null} fallback={name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-app">{name}</h1>
          <div className="mt-0.5 text-sm text-secondary">
            {authUser?.email ?? "—"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {profile?.username && <span>@{profile.username}</span>}
            {profile?.designation && <span>· {profile.designation}</span>}
            <span>· joined {formatDateTime(profile?.created_at || authUser?.created_at || null)}</span>
          </div>
          {profile?.bio && (
            <p className="mt-2 max-w-prose text-sm text-secondary">
              {profile.bio}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tierBadgeClass(sub?.tier_id)}`}
          >
            {sub?.tier_id ?? "free"}
          </span>
          {isAdmin && (
            <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
              admin
            </span>
          )}
        </div>
      </section>

      {/* Two columns: subscription + admin actions, then workspaces */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Subscription</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Tier</dt>
            <dd className="font-medium text-app">{sub?.tier_id ?? "free"}</dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-app">{sub?.status ?? "—"}</dd>
            <dt className="text-muted">Started</dt>
            <dd className="font-mono text-xs tabular-nums text-secondary">
              {formatDateTime(sub?.started_at)}
            </dd>
            <dt className="text-muted">Expires</dt>
            <dd className="font-mono text-xs tabular-nums text-secondary">
              {formatDateTime(sub?.expires_at)}
            </dd>
          </dl>

          <form action={setUserTier} className="mt-4 flex items-center gap-2">
            <input type="hidden" name="user_id" value={id} />
            <select
              name="tier_id"
              defaultValue={sub?.tier_id ?? "free"}
              className={`${inputClass} h-9 max-w-[12rem]`}
            >
              {tiers.map((t) => (
                <option key={t.tier_id} value={t.tier_id}>
                  {t.name} ({t.tier_id})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-lg bg-tool-accent px-3 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Change tier
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Admin actions</h2>

          <form action={toggleUserAdmin} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="user_id" value={id} />
            <input
              type="hidden"
              name="next"
              value={isAdmin ? "false" : "true"}
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-app bg-app px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
            >
              {isAdmin ? "Revoke admin" : "Grant admin"}
            </button>
          </form>

          {authUser?.email && (
            <form action={sendPasswordResetLinkForm} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="email" value={authUser.email} />
              <button
                type="submit"
                className="h-9 rounded-lg border border-app bg-app px-3 text-xs font-medium text-app transition-colors hover:border-tool-accent"
              >
                Send password reset
              </button>
              <span className="text-xs text-muted">
                Recovery link emailed via Resend SMTP.
              </span>
            </form>
          )}
        </section>
      </div>

      {/* Workspaces */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">
            Owned workspaces ({owned.length})
          </h2>
          <ul className="mt-3 divide-y divide-app">
            {owned.length === 0 && (
              <li className="py-3 text-sm text-faint">None yet.</li>
            )}
            {owned.map((w) => (
              <li key={w.id} className="py-2 text-sm">
                <Link
                  href={`/admin/workspaces/${w.id}`}
                  className="flex items-center justify-between gap-3 hover:text-tool-accent"
                >
                  <span className="truncate font-medium text-app">{w.name}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">
                    {memberCountByWs.get(w.id) ?? 1} members
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">
            Joined workspaces ({joined.length})
          </h2>
          <ul className="mt-3 divide-y divide-app">
            {joined.length === 0 && (
              <li className="py-3 text-sm text-faint">None.</li>
            )}
            {joined.map((w) => (
              <li key={w.id} className="py-2 text-sm">
                <Link
                  href={`/admin/workspaces/${w.id}`}
                  className="flex items-center justify-between gap-3 hover:text-tool-accent"
                >
                  <span className="truncate text-app">{w.name}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted">
                    {memberships.find((m) => m.workspace_id === w.id)?.role ??
                      "member"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Used in storage */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Storage</h2>
        <p className="mt-1 text-xs text-muted">
          Aggregate file size across all workspaces this user owns.
        </p>
        <UserStorageStat ownedIds={ownedIds} />
      </section>
    </div>
  );
}

async function UserStorageStat({ ownedIds }: { ownedIds: string[] }) {
  if (ownedIds.length === 0) {
    return <div className="mt-3 text-sm text-faint">No workspaces.</div>;
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("workspace_files")
    .select("size_bytes, workspace_id")
    .in("workspace_id", ownedIds);
  const total = ((data ?? []) as Array<{ size_bytes: number }>).reduce(
    (sum, r) => sum + Number(r.size_bytes ?? 0),
    0
  );
  const count = (data ?? []).length;
  return (
    <div className="mt-3 flex items-baseline gap-3 font-mono tabular-nums">
      <div className="text-2xl text-app">{formatBytes(total)}</div>
      <div className="text-xs text-muted">{count} files</div>
    </div>
  );
}
