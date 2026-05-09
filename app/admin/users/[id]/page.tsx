import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import Avatar from "../../_components/Avatar";
import { fetchAuthUsersByIds, formatDateTime, tierBadgeClass } from "../../_lib";
import RoleAssignment from "./_RoleAssignment";
import ActivityTab from "./_tabs/ActivityTab";
import AgentsTab from "./_tabs/AgentsTab";
import AppsAndFeaturesTab from "./_tabs/AppsAndFeaturesTab";
import ProfileTab from "./_tabs/ProfileTab";
import SessionsTab from "./_tabs/SessionsTab";
import SubscriptionTab from "./_tabs/SubscriptionTab";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "subscription", label: "Subscription" },
  { id: "apps", label: "Apps & Features" },
  { id: "agents", label: "Agents" },
  { id: "activity", label: "Activity" },
  { id: "sessions", label: "Sessions" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | undefined): v is TabId {
  return TABS.some((t) => t.id === v);
}

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

type SubscriptionLite = {
  user_id: string;
  tier_id: string;
  status: string;
};

type AuthUserExtras = {
  email: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  phone: string | null;
  created_at: string | null;
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    apps_q?: string;
    agents_q?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: TabId = isTabId(sp.tab) ? sp.tab : "profile";

  const admin = createAdminClient();

  // Always pull the header data — it's shared by every tab.
  const [profileRes, subRes, authMap, authExtraRes] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "user_id, username, full_name, designation, bio, avatar_url, is_admin, created_at"
      )
      .eq("user_id", id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("user_id, tier_id, status")
      .eq("user_id", id)
      .maybeSingle(),
    fetchAuthUsersByIds([id]),
    admin.auth.admin.getUserById(id),
  ]);

  const profile = profileRes.data as Profile | null;
  const sub = subRes.data as SubscriptionLite | null;
  const authUser = authMap.get(id);

  // Pull the extra auth fields (banned_until, last_sign_in_at, etc.).
  const authExtras: AuthUserExtras = {
    email: authExtraRes.data?.user?.email ?? authUser?.email ?? null,
    banned_until:
      (authExtraRes.data?.user as { banned_until?: string | null } | undefined)
        ?.banned_until ?? null,
    last_sign_in_at: authExtraRes.data?.user?.last_sign_in_at ?? null,
    email_confirmed_at: authExtraRes.data?.user?.email_confirmed_at ?? null,
    phone: authExtraRes.data?.user?.phone ?? null,
    created_at: authExtraRes.data?.user?.created_at ?? authUser?.created_at ?? null,
  };

  if (!profile && !authUser?.id && !authExtraRes.data?.user) {
    notFound();
  }

  const name =
    profile?.full_name ||
    profile?.username ||
    authExtras.email ||
    id.slice(0, 8);

  const isAdmin = Boolean(profile?.is_admin);
  const isSuspended = (() => {
    if (!authExtras.banned_until) return false;
    const t = Date.parse(authExtras.banned_until);
    if (Number.isNaN(t)) return false;
    return t > Date.now();
  })();

  return (
    <div className="space-y-5">
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
            {authExtras.email ?? "—"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {profile?.username && <span>@{profile.username}</span>}
            {profile?.designation && <span>· {profile.designation}</span>}
            <span>
              · joined{" "}
              {formatDateTime(profile?.created_at || authExtras.created_at)}
            </span>
            {authExtras.last_sign_in_at && (
              <span>· last seen {formatDateTime(authExtras.last_sign_in_at)}</span>
            )}
          </div>
          {profile?.bio && (
            <p className="mt-2 max-w-prose text-sm text-secondary">
              {profile.bio}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {isSuspended && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-500">
              suspended
            </span>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-app text-sm">
        {TABS.map((t) => {
          const active = t.id === tab;
          const params = new URLSearchParams();
          params.set("tab", t.id);
          return (
            <Link
              key={t.id}
              href={`/admin/users/${id}?${params.toString()}`}
              className={
                "-mb-px border-b-2 px-3 py-2 transition-colors " +
                (active
                  ? "border-tool-accent text-app"
                  : "border-transparent text-muted hover:text-app")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Tab body */}
      {tab === "profile" && (
        <ProfileTab
          userId={id}
          profile={profile}
          authEmail={authExtras.email}
          authPhone={authExtras.phone}
          emailConfirmedAt={authExtras.email_confirmed_at}
          isSuspended={isSuspended}
          bannedUntil={authExtras.banned_until}
          isAdmin={isAdmin}
        />
      )}
      {tab === "subscription" && (
        <SubscriptionTab userId={id} authEmail={authExtras.email} />
      )}
      {tab === "apps" && (
        <AppsAndFeaturesTab userId={id} appsQuery={(sp.apps_q ?? "").trim()} />
      )}
      {tab === "agents" && (
        <AgentsTab userId={id} agentsQuery={(sp.agents_q ?? "").trim()} />
      )}
      {tab === "activity" && <ActivityTab userId={id} />}
      {tab === "sessions" && (
        <SessionsTab
          userId={id}
          lastSignInAt={authExtras.last_sign_in_at}
          isSuspended={isSuspended}
        />
      )}

      {/* Role assignment panel — visible on every tab so admins can
          inspect / mutate roles regardless of which tab is active.
          Added by AGENT AA (v6 roles + permissions). */}
      <RoleAssignment userId={id} userEmail={authExtras.email} />
    </div>
  );
}
