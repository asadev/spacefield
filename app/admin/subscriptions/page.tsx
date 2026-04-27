import Link from "next/link";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
  tierBadgeClass,
} from "../_lib";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const STATUS_OPTIONS = ["", "active", "trialing", "past_due", "canceled"];

type SubRow = {
  user_id: string;
  tier_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
};

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const tier = sp.tier ?? "";
  const status = sp.status ?? "";

  const admin = createAdminClient();

  const tiersRes = await admin
    .from("subscription_tiers")
    .select("tier_id, name")
    .order("sort_order", { ascending: true });
  const tiers =
    (tiersRes.data ?? []) as Array<{ tier_id: string; name: string }>;

  let q = admin
    .from("subscriptions")
    .select("user_id, tier_id, status, started_at, expires_at")
    .order("started_at", { ascending: false })
    .limit(PER_PAGE);
  if (tier) q = q.eq("tier_id", tier);
  if (status) q = q.eq("status", status);

  const { data: subData } = await q;
  const subs = (subData ?? []) as SubRow[];

  const ids = subs.map((s) => s.user_id);
  const [authMap, profilesRes] = await Promise.all([
    fetchAuthUsersByIds(ids),
    ids.length
      ? admin
          .from("profiles")
          .select("user_id, full_name, username")
          .in("user_id", ids)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ]);
  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.user_id, p])
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Subscriptions
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">All subscriptions</h1>
      </div>

      <form
        action="/admin/subscriptions"
        className="flex flex-wrap items-center gap-2"
      >
        <label className="text-xs text-muted">Tier</label>
        <select name="tier" defaultValue={tier} className={`${inputClass} h-9 w-40`}>
          <option value="">All</option>
          {tiers.map((t) => (
            <option key={t.tier_id} value={t.tier_id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="ml-2 text-xs text-muted">Status</label>
        <select
          name="status"
          defaultValue={status}
          className={`${inputClass} h-9 w-40`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || "All"}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-app bg-app-elevated px-3 text-sm text-app transition-colors hover:border-tool-accent"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-app bg-app-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              <th className="px-3 py-2 text-left font-normal">User</th>
              <th className="px-3 py-2 text-left font-normal">Email</th>
              <th className="px-3 py-2 text-left font-normal">Tier</th>
              <th className="px-3 py-2 text-left font-normal">Status</th>
              <th className="px-3 py-2 text-left font-normal">Started</th>
              <th className="px-3 py-2 text-left font-normal">Expires</th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-faint">
                  No subscriptions match.
                </td>
              </tr>
            ) : (
              subs.map((s) => {
                const u = authMap.get(s.user_id);
                const p = profiles.get(s.user_id);
                const name =
                  p?.full_name || p?.username || u?.email || s.user_id.slice(0, 8);
                return (
                  <tr
                    key={s.user_id}
                    className="border-b border-app last:border-b-0 hover:bg-app/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${s.user_id}`}
                        className="font-medium text-app hover:text-tool-accent"
                      >
                        {name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {u?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tierBadgeClass(s.tier_id)}`}
                      >
                        {s.tier_id}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-secondary">{s.status}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(s.started_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(s.expires_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-faint">
        Showing up to {PER_PAGE} most recent subscriptions.
      </p>
      {/* PER_PAGE intentionally small: each row triggers an
        auth.admin.getUserById round-trip for the email column. */}
    </div>
  );
}
