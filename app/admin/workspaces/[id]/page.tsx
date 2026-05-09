import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatBytes,
  formatDateTime,
  inputClass,
  tierBadgeClass,
} from "../../_lib";
import type {
  AdminAuditLogRow,
  AppRegistryRow,
  FeatureFlagRow,
  WorkspaceCustomDomainRow,
  WorkspaceRole,
} from "../../_types";
import { TIER_IDS, WORKSPACE_ROLES } from "../../_types";
import {
  addWorkspaceFeatureOverride,
  clearWorkspaceToolGrant,
  removeWorkspaceFeatureOverride,
  removeWorkspaceMember,
  setMemberRole,
  setWorkspaceAgentPermission,
  setWorkspacePaused,
  setWorkspaceTierOverride,
  setWorkspaceToolGrant,
  transferWorkspaceOwnership,
  updateWorkspaceBranding,
  updateWorkspacePersona,
} from "../_actions";
import {
  ALL_SKILL_IDS,
  EmptyHint,
  pickTab,
  PERMISSION_MODES,
  SectionCard,
  VOICE_TONES,
  WorkspaceTabs,
  type PermissionMode,
  type WorkspaceTabId,
} from "../_helpers";

export const dynamic = "force-dynamic";

/* ─────────────────────── row types (DB shapes) ─────────────────────── */

type Workspace = {
  id: string;
  user_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  avatar_url: string | null;
  toshare_brand_color: string | null;
  toshare_subdomain: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type Member = {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
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
  max_storage_per_workspace_mb: number;
  max_members_per_workspace: number;
};

type ToolGrantRow = {
  workspace_id: string;
  slug: string;
  granted: boolean;
  granted_by: string | null;
  created_at: string;
};

/** Local override of the foundation `WorkspaceFeatureOverrideRow` type —
 *  the foundation declared `user_id` but the actual table column (and
 *  what we read/write) is `workspace_id`. Keep this private to the
 *  workspaces section so we don't pollute the global type. */
type WorkspaceFeatureOverride = {
  workspace_id: string;
  flag_key: string;
  enabled: boolean;
  reason: string | null;
  set_by: string | null;
  created_at: string;
};

type AgentPersona = {
  workspace_id: string;
  bot_name: string;
  persona_description: string;
  voice_tone: string;
  custom_greeting: string;
  updated_at: string;
};

type AgentPermissionRow = {
  workspace_id: string;
  skill_id: string;
  mode: PermissionMode;
  updated_at: string;
};

type WorkspaceActivityRow = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  kind: string;
  payload: unknown;
  created_at: string;
};

type WorkspaceStateRow = {
  workspace_id: string;
  key: string;
  value: { paused?: boolean; set_at?: string } | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type StorageStatRow = { files_count: number; total_bytes: number } | undefined;

/* ─────────────────────── page ─────────────────────── */

export default async function AdminWorkspaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    feature_q?: string;
    app_q?: string;
    member_q?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = pickTab(sp.tab);

  const admin = createAdminClient();

  const wsRes = await admin
    .from("workspaces")
    .select(
      "id, user_id, name, slug, description, avatar_url, toshare_brand_color, toshare_subdomain, archived_at, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  const workspace = wsRes.data as Workspace | null;
  if (!workspace) notFound();

  const ownerId = workspace.user_id;

  // Header-card data we always want regardless of tab.
  const [
    membersRes,
    storageRes,
    pauseStateRes,
    ownerSubRes,
    tiersRes,
    ownerProfileRes,
  ] = await Promise.all([
    admin
      .from("workspace_members")
      .select("workspace_id, user_id, role, joined_at")
      .eq("workspace_id", id)
      .order("joined_at", { ascending: true }),
    admin.rpc("admin_single_workspace_storage", { p_workspace_id: id }),
    admin
      .from("workspace_state")
      .select("workspace_id, key, value")
      .eq("workspace_id", id)
      .eq("key", "admin_paused")
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("user_id, tier_id, status, started_at, expires_at")
      .eq("user_id", ownerId)
      .maybeSingle(),
    admin
      .from("subscription_tiers")
      .select("tier_id, name, max_storage_per_workspace_mb, max_members_per_workspace")
      .order("sort_order", { ascending: true }),
    admin
      .from("profiles")
      .select("user_id, full_name, username, avatar_url")
      .eq("user_id", ownerId)
      .maybeSingle(),
  ]);

  const members = (membersRes.data ?? []) as Member[];
  const storageStat = (
    Array.isArray(storageRes.data) ? storageRes.data[0] : storageRes.data
  ) as StorageStatRow;
  const totalBytes = Number(storageStat?.total_bytes ?? 0);
  const totalFilesCount = Number(storageStat?.files_count ?? 0);
  const pauseState = pauseStateRes.data as WorkspaceStateRow | null;
  const isPaused = Boolean(pauseState?.value?.paused);
  const ownerSub = ownerSubRes.data as Subscription | null;
  const tiers = (tiersRes.data ?? []) as Tier[];
  const ownerProfile = ownerProfileRes.data as ProfileRow | null;

  // Resolve auth.users lookups for members + owner so we have emails.
  const memberIds = members.map((m) => m.user_id);
  const allUserIds = Array.from(new Set([ownerId, ...memberIds]));
  const authMap = await fetchAuthUsersByIds(allUserIds);
  const ownerEmail = authMap.get(ownerId)?.email ?? null;

  return (
    <div className="space-y-5">
      {/* breadcrumb + header */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/workspaces" className="hover:text-tool-accent">
          ← Workspaces
        </Link>
      </div>

      <section className="flex flex-wrap items-start gap-4 rounded-xl border border-app bg-app-elevated p-5">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-app"
          style={{
            backgroundColor:
              workspace.toshare_brand_color ?? "var(--bg-app)",
            color: workspace.toshare_brand_color ? "#fff" : undefined,
          }}
        >
          {workspace.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.avatar_url}
              alt=""
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <span className="text-base font-semibold tracking-wide">
              {workspace.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-app">{workspace.name}</h1>
          <div className="mt-0.5 text-sm text-secondary">
            owner: {ownerEmail ?? ownerProfile?.full_name ?? ownerId.slice(0, 8)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <code className="rounded-md border border-app bg-app px-1.5 py-0.5 font-mono text-[10px] text-secondary">
              {workspace.id.slice(0, 8)}
            </code>
            {workspace.slug && (
              <span>· slug: {workspace.slug}</span>
            )}
            <span>· {members.length} members</span>
            <span>· {formatBytes(totalBytes)} stored</span>
            <span>· created {formatDateTime(workspace.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tierBadgeClass(ownerSub?.tier_id)}`}
          >
            {ownerSub?.tier_id ?? "free"}
          </span>
          {isPaused && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-500">
              paused
            </span>
          )}
          {workspace.archived_at && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500">
              archived
            </span>
          )}
        </div>
      </section>

      <WorkspaceTabs workspaceId={id} active={tab} />

      {/* Tab body */}
      {tab === "profile" && (
        <ProfileTab
          workspace={workspace}
          isPaused={isPaused}
        />
      )}
      {tab === "members" && (
        <MembersTab
          workspaceId={id}
          ownerId={ownerId}
          members={members}
          authMap={authMap}
          memberQ={(sp.member_q ?? "").trim()}
        />
      )}
      {tab === "tier" && (
        <TierStorageTab
          workspaceId={id}
          ownerId={ownerId}
          ownerSub={ownerSub}
          tiers={tiers}
          totalBytes={totalBytes}
          totalFilesCount={totalFilesCount}
        />
      )}
      {tab === "apps" && (
        <AppsFeaturesTab
          workspaceId={id}
          appQ={(sp.app_q ?? "").trim()}
          featureQ={(sp.feature_q ?? "").trim()}
        />
      )}
      {tab === "domains" && <DomainsTab workspaceId={id} />}
      {tab === "agents" && <AgentsTab workspaceId={id} />}
      {tab === "activity" && <ActivityTab workspaceId={id} />}
    </div>
  );
}

/* ═══════════════════════ TAB: Profile ═══════════════════════ */

async function ProfileTab({
  workspace,
  isPaused,
}: {
  workspace: Workspace;
  isPaused: boolean;
}) {
  return (
    <>
      <SectionCard
        title="Workspace profile"
        hint="Identity + branding. Slug is also the toShare link prefix."
      >
        <form action={updateWorkspaceBranding} className="grid gap-4">
          <input type="hidden" name="workspace_id" value={workspace.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Name</span>
              <input
                name="name"
                defaultValue={workspace.name}
                required
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Slug</span>
              <input
                name="slug"
                defaultValue={workspace.slug ?? ""}
                placeholder="my-workspace"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Description</span>
            <textarea
              name="description"
              defaultValue={workspace.description ?? ""}
              rows={3}
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Logo URL</span>
              <input
                name="avatar_url"
                defaultValue={workspace.avatar_url ?? ""}
                placeholder="https://…"
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">
                toShare brand color (#RRGGBB)
              </span>
              <input
                name="toshare_brand_color"
                defaultValue={workspace.toshare_brand_color ?? ""}
                placeholder="#0ea5e9"
                pattern="#[0-9a-fA-F]{6}"
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <div className="flex items-center justify-end">
            <button type="submit" className={buttonClass}>
              Save profile
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Workspace state"
        hint="Pause stops chat dispatch + the assistant from running tools. Members can still browse."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-secondary">
            Status:{" "}
            {isPaused ? (
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                paused
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                active
              </span>
            )}
          </div>
          <form action={setWorkspacePaused}>
            <input type="hidden" name="workspace_id" value={workspace.id} />
            <input
              type="hidden"
              name="paused"
              value={isPaused ? "false" : "true"}
            />
            <button type="submit" className={buttonGhostClass}>
              {isPaused ? "Unpause workspace" : "Pause workspace"}
            </button>
          </form>
        </div>
        <div className="mt-3 grid gap-1 text-[11px] text-muted">
          <div>
            toshare subdomain:{" "}
            {workspace.toshare_subdomain ? (
              <code className="text-secondary">{workspace.toshare_subdomain}.toshare.net</code>
            ) : (
              <span className="text-faint">not claimed</span>
            )}
          </div>
          <div>
            Archived at:{" "}
            {workspace.archived_at ? (
              <code className="text-secondary">
                {formatDateTime(workspace.archived_at)}
              </code>
            ) : (
              <span className="text-faint">no</span>
            )}
          </div>
          <div>Last updated: {formatDateTime(workspace.updated_at)}</div>
        </div>
      </SectionCard>
    </>
  );
}

/* ═══════════════════════ TAB: Members ═══════════════════════ */

async function MembersTab({
  workspaceId,
  ownerId,
  members,
  authMap,
  memberQ,
}: {
  workspaceId: string;
  ownerId: string;
  members: Member[];
  authMap: Awaited<ReturnType<typeof fetchAuthUsersByIds>>;
  memberQ: string;
}) {
  const admin = createAdminClient();
  const memberIds = members.map((m) => m.user_id);
  const profilesRes = memberIds.length
    ? await admin
        .from("profiles")
        .select("user_id, full_name, username, avatar_url")
        .in("user_id", memberIds)
    : { data: [] as ProfileRow[], error: null };
  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
  );

  // Optional email substring filter for the transfer-ownership picker.
  let candidateMembers = members;
  if (memberQ) {
    const needle = memberQ.toLowerCase();
    candidateMembers = members.filter((m) => {
      const u = authMap.get(m.user_id);
      return (u?.email ?? "").toLowerCase().includes(needle);
    });
  }

  return (
    <>
      <SectionCard
        title={`Members (${members.length})`}
        hint="Owner can't be demoted directly — use Transfer ownership below."
      >
        <div className="overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Member</th>
                <th className="px-3 py-2 text-left font-normal">Email</th>
                <th className="px-3 py-2 text-left font-normal">Role</th>
                <th className="px-3 py-2 text-left font-normal">Joined</th>
                <th className="px-3 py-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-faint"
                  >
                    No members.
                  </td>
                </tr>
              )}
              {members.map((m) => {
                const p = profiles.get(m.user_id);
                const u = authMap.get(m.user_id);
                const name =
                  p?.full_name ||
                  p?.username ||
                  u?.email ||
                  m.user_id.slice(0, 8);
                const isOwner = m.role === "owner" || m.user_id === ownerId;
                return (
                  <tr
                    key={m.user_id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${m.user_id}`}
                        className="text-app hover:text-tool-accent"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {u?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {isOwner ? (
                        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
                          owner
                        </span>
                      ) : (
                        <form
                          action={setMemberRole}
                          className="flex items-center gap-2"
                        >
                          <input
                            type="hidden"
                            name="workspace_id"
                            value={workspaceId}
                          />
                          <input
                            type="hidden"
                            name="user_id"
                            value={m.user_id}
                          />
                          <select
                            name="role"
                            defaultValue={m.role}
                            className={`${inputClass} h-8 max-w-[8rem] text-xs`}
                          >
                            {WORKSPACE_ROLES.filter((r) => r !== "owner").map(
                              (r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              )
                            )}
                          </select>
                          <button
                            type="submit"
                            className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                          >
                            Save
                          </button>
                        </form>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(m.joined_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isOwner ? (
                        <span className="text-[11px] text-faint">
                          owner (transfer below)
                        </span>
                      ) : (
                        <form action={removeWorkspaceMember}>
                          <input
                            type="hidden"
                            name="workspace_id"
                            value={workspaceId}
                          />
                          <input
                            type="hidden"
                            name="user_id"
                            value={m.user_id}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-app transition-colors hover:border-rose-400 hover:text-rose-400"
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Transfer ownership"
        hint="Pick a current member. The previous owner is demoted to admin."
      >
        <form
          action={`/admin/workspaces/${workspaceId}`}
          className="mb-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value="members" />
          <label className="block text-xs flex-1 min-w-[14rem]">
            <span className="mb-1 block text-faint">
              Filter members by email substring
            </span>
            <input
              name="member_q"
              defaultValue={memberQ}
              placeholder="example@spacefield.co"
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonGhostClass}>
            Filter
          </button>
        </form>

        {candidateMembers.length === 0 ? (
          <EmptyHint>
            {memberQ
              ? `No member matches “${memberQ}”.`
              : "No members yet."}
          </EmptyHint>
        ) : (
          <div className="space-y-2">
            {candidateMembers.map((m) => {
              const u = authMap.get(m.user_id);
              const p = profiles.get(m.user_id);
              const isOwner = m.role === "owner" || m.user_id === ownerId;
              if (isOwner) return null;
              const name =
                p?.full_name ||
                p?.username ||
                u?.email ||
                m.user_id.slice(0, 8);
              return (
                <form
                  key={m.user_id}
                  action={transferWorkspaceOwnership}
                  className="grid items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 sm:grid-cols-[1fr_auto]"
                >
                  <input
                    type="hidden"
                    name="workspace_id"
                    value={workspaceId}
                  />
                  <input
                    type="hidden"
                    name="new_owner_id"
                    value={m.user_id}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">{name}</div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {u?.email ?? m.user_id}
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md border border-app px-2.5 py-1 text-xs text-secondary transition-colors hover:border-amber-400 hover:text-amber-400"
                  >
                    Transfer to this user
                  </button>
                </form>
              );
            })}
          </div>
        )}
      </SectionCard>
    </>
  );
}

/* ═══════════════════════ TAB: Tier & Storage ═══════════════════════ */

async function TierStorageTab({
  workspaceId,
  ownerId,
  ownerSub,
  tiers,
  totalBytes,
  totalFilesCount,
}: {
  workspaceId: string;
  ownerId: string;
  ownerSub: Subscription | null;
  tiers: Tier[];
  totalBytes: number;
  totalFilesCount: number;
}) {
  const effectiveTier = ownerSub?.tier_id ?? "free";
  const tierRow = tiers.find((t) => t.tier_id === effectiveTier);
  const capMb = tierRow?.max_storage_per_workspace_mb ?? 100;
  const capBytes = capMb * 1024 * 1024;
  const pct = capBytes > 0 ? Math.min(100, Math.round((totalBytes / capBytes) * 100)) : 0;

  return (
    <>
      <SectionCard
        title="Effective tier"
        hint="Tier is owned by the workspace's owner subscription. Setting it here updates the owner's record (no per-workspace tier override table exists yet)."
      >
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Owner</dt>
          <dd className="font-mono text-xs tabular-nums text-secondary">
            {ownerId}
          </dd>
          <dt className="text-muted">Tier</dt>
          <dd className="text-app">{effectiveTier}</dd>
          <dt className="text-muted">Status</dt>
          <dd className="text-app">{ownerSub?.status ?? "—"}</dd>
          <dt className="text-muted">Started</dt>
          <dd className="font-mono text-xs tabular-nums text-secondary">
            {formatDateTime(ownerSub?.started_at)}
          </dd>
          <dt className="text-muted">Expires</dt>
          <dd className="font-mono text-xs tabular-nums text-secondary">
            {formatDateTime(ownerSub?.expires_at)}
          </dd>
        </dl>

        <form
          action={setWorkspaceTierOverride}
          className="mt-4 flex items-center gap-2"
        >
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="owner_id" value={ownerId} />
          <select
            name="tier_id"
            defaultValue={effectiveTier}
            className={`${inputClass} h-9 max-w-[14rem]`}
          >
            {(tiers.length ? tiers.map((t) => t.tier_id) : (TIER_IDS as readonly string[])).map(
              (tierId) => (
                <option key={tierId} value={tierId}>
                  {tiers.find((t) => t.tier_id === tierId)?.name ?? tierId} ({tierId})
                </option>
              )
            )}
          </select>
          <button type="submit" className={buttonClass}>
            Override tier
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Storage"
        hint={`Used / cap. Cap is the owner-tier ceiling (${capMb} MB on ${effectiveTier}). Values aren't enforced at write-time today — the cap is informational here.`}
      >
        <div className="flex flex-wrap items-baseline gap-3 font-mono tabular-nums">
          <div className="text-2xl text-app">{formatBytes(totalBytes)}</div>
          <div className="text-xs text-muted">
            of {formatBytes(capBytes)} ({pct}%)
          </div>
          <div className="text-xs text-muted">·</div>
          <div className="text-xs text-muted">
            {totalFilesCount.toLocaleString()} files
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-app">
          <div
            className="h-full bg-tool-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Storage addons aren't a real DB concept yet — there's no
          per-workspace storage row to grant against. To raise the cap
          for this workspace, override the owner's tier above (or land a
          dedicated storage table in a future migration and wire up
          this UI to it).
        </p>
      </SectionCard>
    </>
  );
}

/* ═══════════════════════ TAB: Apps & Features ═══════════════════════ */

async function AppsFeaturesTab({
  workspaceId,
  appQ,
  featureQ,
}: {
  workspaceId: string;
  appQ: string;
  featureQ: string;
}) {
  const admin = createAdminClient();

  const [grantsRes, appsRes, overridesRes, flagsRes] = await Promise.all([
    admin
      .from("workspace_tool_grants")
      .select("workspace_id, slug, granted, granted_by, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    admin
      .from("app_registry")
      .select(
        "id, domain, title, description, category, icon, published, access_mode, access_tiers, allowlist_user_ids, sort_order, metadata, created_at, updated_at, updated_by"
      )
      .order("title", { ascending: true })
      .limit(2000),
    admin
      .from("workspace_feature_overrides")
      .select("workspace_id, flag_key, enabled, reason, set_by, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    admin
      .from("feature_flags")
      .select("*")
      .order("key", { ascending: true })
      .limit(500),
  ]);

  const grants = (grantsRes.data ?? []) as ToolGrantRow[];
  const apps = (appsRes.data ?? []) as AppRegistryRow[];
  const overrides = (overridesRes.data ?? []) as WorkspaceFeatureOverride[];
  const flags = (flagsRes.data ?? []) as FeatureFlagRow[];

  const appsBySlug = new Map(apps.map((a) => [a.id, a]));
  const grantedSlugs = new Set(grants.map((g) => g.slug));
  const overriddenKeys = new Set(overrides.map((o) => o.flag_key));

  const filteredApps = appQ
    ? apps.filter((a) => {
        const needle = appQ.toLowerCase();
        return (
          a.id.toLowerCase().includes(needle) ||
          a.title.toLowerCase().includes(needle) ||
          (a.category ?? "").toLowerCase().includes(needle)
        );
      })
    : apps;

  const filteredFlags = featureQ
    ? flags.filter((f) => {
        const needle = featureQ.toLowerCase();
        return (
          f.key.toLowerCase().includes(needle) ||
          (f.title ?? "").toLowerCase().includes(needle)
        );
      })
    : flags;

  return (
    <>
      <SectionCard
        title={`Workspace tool grants (${grants.length})`}
        hint="Per-app overrides for this workspace. Allow lets the workspace install/use the app even when its tier wouldn't normally permit; Block keeps it out even when the tier does."
      >
        {grants.length === 0 ? (
          <EmptyHint>No per-workspace tool grants. Tier baseline applies.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {grants.map((g) => {
              const app = appsBySlug.get(g.slug);
              return (
                <div
                  key={g.slug}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {app?.title ?? g.slug}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {g.slug}
                    </div>
                    <div className="text-[11px] text-muted">
                      Set {formatDateTime(g.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        g.granted
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {g.granted ? "Allowed" : "Blocked"}
                    </span>
                    <Link
                      href={`/admin/apps/${encodeURIComponent(g.slug)}`}
                      className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                    >
                      Open app
                    </Link>
                    <form action={clearWorkspaceToolGrant}>
                      <input
                        type="hidden"
                        name="workspace_id"
                        value={workspaceId}
                      />
                      <input type="hidden" name="slug" value={g.slug} />
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
            })}
          </div>
        )}

        {/* Add new grant */}
        <div className="mt-5 rounded-lg border border-dashed border-app bg-app p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            Add an override
          </h3>
          <form
            action={`/admin/workspaces/${workspaceId}`}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="tab" value="apps" />
            <label className="block text-xs flex-1 min-w-[12rem]">
              <span className="mb-1 block text-faint">Filter apps</span>
              <input
                name="app_q"
                defaultValue={appQ}
                placeholder="search by title, slug, or category"
                className={inputClass}
              />
            </label>
            <button type="submit" className={buttonGhostClass}>
              Filter
            </button>
            {appQ && (
              <Link
                href={`/admin/workspaces/${workspaceId}?tab=apps`}
                className="text-[11px] text-muted underline"
              >
                Clear
              </Link>
            )}
          </form>

          <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
            {filteredApps.length === 0 ? (
              <div className="text-xs text-muted">
                {appQ ? `No app matches “${appQ}”.` : "No apps registered."}
              </div>
            ) : (
              filteredApps.map((a) => {
                const already = grantedSlugs.has(a.id);
                return (
                  <form
                    key={a.id}
                    action={setWorkspaceToolGrant}
                    className="grid items-center gap-2 rounded-md border border-app bg-app-elevated px-3 py-2 sm:grid-cols-[1fr_120px_auto]"
                  >
                    <input
                      type="hidden"
                      name="workspace_id"
                      value={workspaceId}
                    />
                    <input type="hidden" name="slug" value={a.id} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-app">
                        {a.title}
                        {already && (
                          <span className="ml-2 text-[10px] text-faint">
                            (override exists)
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[10px] text-faint">
                        {a.id} · {a.domain}
                      </div>
                    </div>
                    <select
                      name="granted"
                      defaultValue="true"
                      className={`${inputClass} h-8 text-xs`}
                    >
                      <option value="true">Allow</option>
                      <option value="false">Block</option>
                    </select>
                    <button type="submit" className={buttonGhostClass}>
                      Save
                    </button>
                  </form>
                );
              })
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={`Feature overrides (${overrides.length})`}
        hint="Per-workspace explicit override for a feature flag. Wins over the global rollout."
      >
        {overrides.length === 0 ? (
          <EmptyHint>No feature overrides for this workspace.</EmptyHint>
        ) : (
          <div className="space-y-2">
            {overrides.map((o) => {
              const flag = flags.find((f) => f.key === o.flag_key);
              return (
                <div
                  key={o.flag_key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {flag?.title || o.flag_key}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                      {o.flag_key}
                    </div>
                    <div className="text-[11px] text-muted">
                      {o.reason ? (
                        <span className="text-secondary">“{o.reason}”</span>
                      ) : (
                        <span className="text-faint">no reason</span>
                      )}
                      <span className="mx-1">·</span>
                      Set {formatDateTime(o.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        o.enabled
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-rose-500/15 text-rose-500"
                      }`}
                    >
                      {o.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <form action={removeWorkspaceFeatureOverride}>
                      <input
                        type="hidden"
                        name="workspace_id"
                        value={workspaceId}
                      />
                      <input type="hidden" name="flag_key" value={o.flag_key} />
                      <button
                        type="submit"
                        className="rounded-md border border-app px-2 py-1 text-[11px] text-muted transition-colors hover:text-app"
                      >
                        Clear
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-lg border border-dashed border-app bg-app p-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
            Set an override
          </h3>
          <form
            action={`/admin/workspaces/${workspaceId}`}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="tab" value="apps" />
            <label className="block text-xs flex-1 min-w-[12rem]">
              <span className="mb-1 block text-faint">Filter flags</span>
              <input
                name="feature_q"
                defaultValue={featureQ}
                placeholder="search by key or title"
                className={inputClass}
              />
            </label>
            <button type="submit" className={buttonGhostClass}>
              Filter
            </button>
            {featureQ && (
              <Link
                href={`/admin/workspaces/${workspaceId}?tab=apps`}
                className="text-[11px] text-muted underline"
              >
                Clear
              </Link>
            )}
          </form>

          <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto pr-1">
            {filteredFlags.length === 0 ? (
              <div className="text-xs text-muted">
                {featureQ
                  ? `No flag matches “${featureQ}”.`
                  : "No feature flags registered."}
              </div>
            ) : (
              filteredFlags.map((f) => {
                const already = overriddenKeys.has(f.key);
                return (
                  <form
                    key={f.key}
                    action={addWorkspaceFeatureOverride}
                    className="grid items-center gap-2 rounded-md border border-app bg-app-elevated px-3 py-2 sm:grid-cols-[1fr_120px_minmax(0,1fr)_auto]"
                  >
                    <input
                      type="hidden"
                      name="workspace_id"
                      value={workspaceId}
                    />
                    <input type="hidden" name="flag_key" value={f.key} />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-app">
                        {f.title || f.key}
                        {already && (
                          <span className="ml-2 text-[10px] text-faint">
                            (override exists)
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[10px] text-faint">
                        {f.key}
                      </div>
                    </div>
                    <select
                      name="enabled"
                      defaultValue="true"
                      className={`${inputClass} h-8 text-xs`}
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                    <input
                      name="reason"
                      placeholder="Reason (optional)"
                      className={`${inputClass} h-8 text-xs`}
                    />
                    <button type="submit" className={buttonGhostClass}>
                      Save
                    </button>
                  </form>
                );
              })
            )}
          </div>
        </div>
      </SectionCard>
    </>
  );
}

/* ═══════════════════════ TAB: Domains ═══════════════════════ */

async function DomainsTab({ workspaceId }: { workspaceId: string }) {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("workspace_custom_domains")
    .select(
      "id, workspace_id, domain, cname_target, txt_token, txt_verified_at, cname_verified_at, added_to_vercel_at, status, scope, created_by, created_at, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  const domains = (rows ?? []) as WorkspaceCustomDomainRow[];

  return (
    <SectionCard
      title={`Custom domains (${domains.length})`}
      hint="Add or remove via /admin/domains. Click any row to manage CNAME / TXT verification + Vercel attachment."
    >
      {domains.length === 0 ? (
        <EmptyHint>No custom domains pointed at this workspace.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <Link
              key={d.id}
              href={`/admin/domains/${d.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2 transition-colors hover:border-tool-accent"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-app">{d.domain}</div>
                <div className="truncate font-mono text-[11px] text-faint tabular-nums">
                  scope: {d.scope} · CNAME → {d.cname_target}
                </div>
                <div className="text-[11px] text-muted">
                  Added {formatDateTime(d.created_at)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChipClass(d.status)}`}
                >
                  {d.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function statusChipClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-500";
    case "failed":
    case "disabled":
      return "bg-rose-500/15 text-rose-500";
    case "pending":
      return "bg-amber-500/15 text-amber-500";
    default:
      return "bg-app-elevated text-secondary border border-app";
  }
}

/* ═══════════════════════ TAB: Agents ═══════════════════════ */

async function AgentsTab({ workspaceId }: { workspaceId: string }) {
  const admin = createAdminClient();
  const [personaRes, permsRes] = await Promise.all([
    admin
      .from("agent_personas")
      .select(
        "workspace_id, bot_name, persona_description, voice_tone, custom_greeting, updated_at"
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    admin
      .from("agent_permissions")
      .select("workspace_id, skill_id, mode, updated_at")
      .eq("workspace_id", workspaceId),
  ]);

  const persona = (personaRes.data as AgentPersona | null) ?? null;
  const perms = (permsRes.data ?? []) as AgentPermissionRow[];
  const permBySkill = new Map(perms.map((p) => [p.skill_id, p]));

  return (
    <>
      <SectionCard
        title="Agent persona"
        hint="Per-workspace tone + greeting. Tools and skills are not affected by this — only voice."
      >
        <form action={updateWorkspacePersona} className="grid gap-4">
          <input type="hidden" name="workspace_id" value={workspaceId} />

          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Bot name</span>
              <input
                name="bot_name"
                defaultValue={persona?.bot_name ?? "Spacefield Assistant"}
                className={inputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Voice tone</span>
              <select
                name="voice_tone"
                defaultValue={persona?.voice_tone ?? "friendly"}
                className={inputClass}
              >
                {VOICE_TONES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Persona description</span>
            <textarea
              name="persona_description"
              defaultValue={persona?.persona_description ?? ""}
              rows={4}
              placeholder="Add team context the assistant should always remember (industry, jargon, tone preferences, etc.)"
              className={`${inputClass} resize-y`}
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Custom greeting</span>
            <textarea
              name="custom_greeting"
              defaultValue={persona?.custom_greeting ?? ""}
              rows={2}
              placeholder="Used at the start of new chats. Leave blank for the default."
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="flex items-center justify-end">
            <button type="submit" className={buttonClass}>
              Save persona
            </button>
          </div>
        </form>
        {persona && (
          <p className="mt-3 text-[11px] text-muted">
            Last updated {formatDateTime(persona.updated_at)}.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Skill permissions"
        hint="Override the default per-skill access mode. Leave 'default' to fall back to the runtime defaults (read-only → allow; writes → confirm on team workspaces, allow on personal)."
      >
        <div className="overflow-x-auto rounded-lg border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Skill</th>
                <th className="px-3 py-2 text-left font-normal">Description</th>
                <th className="px-3 py-2 text-left font-normal">Override</th>
                <th className="px-3 py-2 text-right font-normal">Action</th>
              </tr>
            </thead>
            <tbody>
              {ALL_SKILL_IDS.map((s) => {
                const cur = permBySkill.get(s.id);
                const value: PermissionMode | "default" =
                  cur?.mode ?? "default";
                return (
                  <tr
                    key={s.id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="text-app">{s.label}</div>
                      <div className="font-mono text-[10px] text-faint">
                        {s.id}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-secondary">
                      {s.description}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <form
                        action={setWorkspaceAgentPermission}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="workspace_id"
                          value={workspaceId}
                        />
                        <input
                          type="hidden"
                          name="skill_id"
                          value={s.id}
                        />
                        <select
                          name="mode"
                          defaultValue={value}
                          className={`${inputClass} h-8 max-w-[10rem] text-xs`}
                        >
                          <option value="default">default</option>
                          {PERMISSION_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-right align-top text-[11px] text-muted">
                      {cur
                        ? `set ${formatDateTime(cur.updated_at)}`
                        : <span className="text-faint">no override</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

/* ═══════════════════════ TAB: Activity ═══════════════════════ */

async function ActivityTab({ workspaceId }: { workspaceId: string }) {
  const admin = createAdminClient();
  // We use TWO sources:
  //  1. admin_audit_log — admin-side actions (target_type='workspaces' + target_id, OR
  //     metadata.workspace_id matches). The `metadata->>workspace_id` filter
  //     is a simple JSONB path comparison — fast enough at the volumes
  //     a workspace ever touches.
  //  2. workspace_activity — in-product events (members joined, settings
  //     changed, etc.) that the UI logs directly.
  const [adminLogRes, idMetadataRes, wsActivityRes] = await Promise.all([
    admin
      .from("admin_audit_log")
      .select(
        "id, actor_id, actor_email, action, target_type, target_id, before, after, ip, user_agent, metadata, created_at"
      )
      .eq("target_type", "workspaces")
      .eq("target_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("admin_audit_log")
      .select(
        "id, actor_id, actor_email, action, target_type, target_id, before, after, ip, user_agent, metadata, created_at"
      )
      .eq("metadata->>workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("workspace_activity")
      .select("id, workspace_id, actor_id, kind, payload, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Dedupe admin log rows (a row can match both target_id and metadata
  // searches at once).
  const adminRows = new Map<string, AdminAuditLogRow>();
  for (const r of (adminLogRes.data ?? []) as AdminAuditLogRow[]) {
    adminRows.set(r.id, r);
  }
  for (const r of (idMetadataRes.data ?? []) as AdminAuditLogRow[]) {
    adminRows.set(r.id, r);
  }
  const adminEntries = Array.from(adminRows.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
  const wsEntries = (wsActivityRes.data ?? []) as WorkspaceActivityRow[];

  return (
    <>
      <SectionCard
        title={`Admin actions (${adminEntries.length})`}
        hint="admin_audit_log rows where this workspace is either the target or referenced in metadata."
      >
        {adminEntries.length === 0 ? (
          <EmptyHint>No admin actions recorded for this workspace.</EmptyHint>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-app">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <th className="px-3 py-2 text-left font-normal">When</th>
                  <th className="px-3 py-2 text-left font-normal">Actor</th>
                  <th className="px-3 py-2 text-left font-normal">Action</th>
                  <th className="px-3 py-2 text-left font-normal">Target</th>
                </tr>
              </thead>
              <tbody>
                {adminEntries.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-app">
                      <div className="truncate" title={r.actor_email ?? ""}>
                        {r.actor_email ?? <span className="text-faint">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-medium text-secondary">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      {r.target_type ? (
                        <>
                          {r.target_type}
                          {r.target_id && (
                            <span className="ml-1 font-mono text-[10px] text-faint">
                              {r.target_id.length > 24
                                ? `${r.target_id.slice(0, 24)}…`
                                : r.target_id}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`In-product activity (${wsEntries.length})`}
        hint="workspace_activity log: member changes, role flips, settings updates, etc."
      >
        {wsEntries.length === 0 ? (
          <EmptyHint>No in-product activity yet.</EmptyHint>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-app">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  <th className="px-3 py-2 text-left font-normal">When</th>
                  <th className="px-3 py-2 text-left font-normal">Actor</th>
                  <th className="px-3 py-2 text-left font-normal">Kind</th>
                  <th className="px-3 py-2 text-left font-normal">Payload</th>
                </tr>
              </thead>
              <tbody>
                {wsEntries.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-faint">
                      {r.actor_id ? r.actor_id.slice(0, 8) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-app">{r.kind}</td>
                    <td className="px-3 py-2 text-xs text-secondary">
                      <code className="block max-w-md truncate font-mono text-[10px] tabular-nums">
                        {payloadToString(r.payload)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function payloadToString(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    const s = JSON.stringify(value);
    return s === "{}" ? "—" : s;
  } catch {
    return String(value);
  }
}
