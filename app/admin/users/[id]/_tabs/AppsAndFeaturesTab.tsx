import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../../_lib";
import {
  addUserAppGrant,
  addUserFeatureOverride,
  removeUserAppGrant,
  removeUserFeatureOverride,
} from "../../_actions";

type AppRow = {
  id: string;
  title: string;
  domain: string;
  category: string;
};

type AppGrantRow = {
  user_id: string;
  slug: string;
  granted: boolean;
  granted_by: string | null;
  reason: string | null;
  created_at: string;
};

type FeatureFlagRow = {
  key: string;
  title: string;
  description: string;
};

type UserFeatureOverrideRow = {
  user_id: string;
  flag_key: string;
  enabled: boolean;
  reason: string | null;
  set_by: string | null;
  created_at: string;
};

export default async function AppsAndFeaturesTab({
  userId,
  appsQuery,
}: {
  userId: string;
  appsQuery: string;
}) {
  const admin = createAdminClient();

  const [appsRes, grantsRes, flagsRes, overridesRes] = await Promise.all([
    admin
      .from("app_registry")
      .select("id, title, domain, category")
      .order("title", { ascending: true })
      .limit(1000),
    admin
      .from("user_app_grants")
      .select("user_id, slug, granted, granted_by, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("feature_flags")
      .select("key, title, description")
      .order("key", { ascending: true })
      .limit(500),
    admin
      .from("user_feature_overrides")
      .select("user_id, flag_key, enabled, reason, set_by, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const apps = (appsRes.data ?? []) as AppRow[];
  const grants = (grantsRes.data ?? []) as AppGrantRow[];
  const flags = (flagsRes.data ?? []) as FeatureFlagRow[];
  const overrides = (overridesRes.data ?? []) as UserFeatureOverrideRow[];

  // Resolve "set_by"/"granted_by" emails for the audit display.
  const actorIds = Array.from(
    new Set(
      [
        ...grants.map((g) => g.granted_by),
        ...overrides.map((o) => o.set_by),
      ].filter((v): v is string => Boolean(v))
    )
  );
  const actorMap = await fetchAuthUsersByIds(actorIds);

  const appsByKey = new Map(apps.map((a) => [a.id, a] as const));
  const flagsByKey = new Map(flags.map((f) => [f.key, f] as const));

  // Filter apps for the picker.
  const grantedSlugs = new Set(grants.map((g) => g.slug));
  const filterNeedle = appsQuery.toLowerCase();
  const filteredApps = filterNeedle
    ? apps.filter(
        (a) =>
          !grantedSlugs.has(a.id) &&
          (a.id.toLowerCase().includes(filterNeedle) ||
            a.title.toLowerCase().includes(filterNeedle))
      )
    : apps.filter((a) => !grantedSlugs.has(a.id));

  const overrideKeys = new Set(overrides.map((o) => o.flag_key));
  const remainingFlags = flags.filter((f) => !overrideKeys.has(f.key));

  return (
    <div className="space-y-5">
      {/* App grants */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">App grants</h2>
            <p className="mt-1 text-xs text-muted">
              Per-user app access overrides — wins over both tier baseline AND
              any workspace override.
            </p>
          </div>
          <span className="text-[11px] text-muted">{grants.length} active</span>
        </div>

        {/* Add grant */}
        <form
          action={`/admin/users/${userId}`}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value="apps" />
          <label className="block text-xs flex-1 min-w-[16rem]">
            <span className="mb-1 block text-faint">
              Filter ungranted apps
            </span>
            <input
              name="apps_q"
              defaultValue={appsQuery}
              placeholder="search by id or title"
              className={inputClass}
            />
          </label>
          <button type="submit" className={buttonGhostClass}>
            Filter
          </button>
          {appsQuery && (
            <Link
              href={`/admin/users/${userId}?tab=apps`}
              className="text-[11px] text-muted underline"
            >
              Clear
            </Link>
          )}
        </form>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_minmax(0,1fr)_auto]">
          <form
            action={addUserAppGrant}
            className="contents"
          >
            <input type="hidden" name="user_id" value={userId} />
            <select
              name="slug"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Pick an app…
              </option>
              {filteredApps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.id})
                </option>
              ))}
            </select>
            <select name="granted" defaultValue="true" className={inputClass}>
              <option value="true">Allow</option>
              <option value="false">Block</option>
            </select>
            <input
              name="reason"
              placeholder="Reason (optional)"
              className={inputClass}
            />
            <button type="submit" className={buttonGhostClass}>
              Add grant
            </button>
          </form>
        </div>

        <div className="mt-4 space-y-2">
          {grants.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              No per-user app grants. Access is governed by tier and workspace
              overrides only.
            </div>
          ) : (
            grants.map((g) => {
              const app = appsByKey.get(g.slug);
              const grantedBy = g.granted_by
                ? actorMap.get(g.granted_by)?.email ??
                  g.granted_by.slice(0, 8)
                : "—";
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
                      {g.reason ? (
                        <span className="text-secondary">“{g.reason}”</span>
                      ) : (
                        <span className="text-faint">no reason</span>
                      )}
                      <span className="mx-1">·</span>
                      Set {formatDateTime(g.created_at)} · by {grantedBy}
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
                    <form action={removeUserAppGrant}>
                      <input type="hidden" name="user_id" value={userId} />
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
            })
          )}
        </div>
      </section>

      {/* Feature overrides */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-app">
              Feature flag overrides
            </h2>
            <p className="mt-1 text-xs text-muted">
              Per-user explicit on/off for a feature flag. Wins over the
              global rollout strategy.
            </p>
          </div>
          <span className="text-[11px] text-muted">
            {overrides.length} active
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_minmax(0,1fr)_auto]">
          <form action={addUserFeatureOverride} className="contents">
            <input type="hidden" name="user_id" value={userId} />
            <select
              name="flag_key"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="" disabled>
                Pick a flag…
              </option>
              {remainingFlags.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.title || f.key} ({f.key})
                </option>
              ))}
            </select>
            <select name="enabled" defaultValue="true" className={inputClass}>
              <option value="true">Force on</option>
              <option value="false">Force off</option>
            </select>
            <input
              name="reason"
              placeholder="Reason (optional)"
              className={inputClass}
            />
            <button type="submit" className={buttonGhostClass}>
              Add override
            </button>
          </form>
        </div>

        <div className="mt-4 space-y-2">
          {overrides.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
              No per-user feature overrides.
            </div>
          ) : (
            overrides.map((o) => {
              const f = flagsByKey.get(o.flag_key);
              const setBy = o.set_by
                ? actorMap.get(o.set_by)?.email ?? o.set_by.slice(0, 8)
                : "—";
              return (
                <div
                  key={o.flag_key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-app px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-app">
                      {f?.title || o.flag_key}
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
                      Set {formatDateTime(o.created_at)} · by {setBy}
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
                      {o.enabled ? "On" : "Off"}
                    </span>
                    <form action={removeUserFeatureOverride}>
                      <input type="hidden" name="user_id" value={userId} />
                      <input
                        type="hidden"
                        name="flag_key"
                        value={o.flag_key}
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
    </div>
  );
}
