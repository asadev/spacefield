import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { CouponRow } from "../../_types";
import { deleteCoupon, redeemCoupon, updateCoupon } from "../_actions";
import CouponForm from "../_components/CouponForm";
import {
  COUPON_KIND_LABELS,
  couponKindChipClass,
  couponSchedule,
  couponScheduleChipClass,
  formatCouponValue,
} from "../_helpers";

export const dynamic = "force-dynamic";

const REDEMPTIONS_LIMIT = 100;

type RedemptionRow = {
  id: string;
  coupon_code: string | null;
  user_id: string | null;
  workspace_id: string | null;
  redeemed_at: string;
  metadata: Record<string, unknown> | null;
};

type WorkspaceLite = {
  id: string;
  name: string | null;
};

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function CouponDetailPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).toUpperCase();

  const admin = createAdminClient();
  const { data: couponData } = await admin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  const coupon = (couponData as CouponRow | null) ?? null;
  if (!coupon) notFound();

  // Recent redemptions — joined to email + workspace name client-side
  const { data: redData } = await admin
    .from("coupon_redemptions")
    .select("*")
    .eq("coupon_code", code)
    .order("redeemed_at", { ascending: false })
    .limit(REDEMPTIONS_LIMIT);
  const redemptions = (redData ?? []) as RedemptionRow[];

  const userIds = Array.from(
    new Set(redemptions.map((r) => r.user_id).filter(Boolean))
  ) as string[];
  const workspaceIds = Array.from(
    new Set(redemptions.map((r) => r.workspace_id).filter(Boolean))
  ) as string[];

  const [emailMap, wsRes] = await Promise.all([
    fetchAuthUsersByIds(userIds),
    workspaceIds.length
      ? admin.from("workspaces").select("id, name").in("id", workspaceIds)
      : Promise.resolve({ data: [] as WorkspaceLite[], error: null }),
  ]);

  const wsMap = new Map<string, string>();
  for (const w of (wsRes.data ?? []) as WorkspaceLite[]) {
    wsMap.set(w.id, w.name ?? w.id.slice(0, 8));
  }

  const schedule = couponSchedule(
    coupon.enabled,
    coupon.starts_at,
    coupon.ends_at
  );

  const usagePct =
    coupon.max_redemptions && coupon.max_redemptions > 0
      ? Math.min(
          100,
          Math.round((coupon.redemption_count / coupon.max_redemptions) * 100)
        )
      : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/coupons"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Coupons
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-app">
            {coupon.code}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${couponKindChipClass(
              coupon.kind
            )}`}
          >
            {COUPON_KIND_LABELS[coupon.kind]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${couponScheduleChipClass(
              schedule.tone
            )}`}
          >
            {schedule.label}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(coupon.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(coupon.created_at)}
          </span>
        </div>
      </div>

      {/* At-a-glance cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Value" value={formatCouponValue(coupon.kind, coupon.value)} mono />
        <Card
          label="Redemptions"
          value={
            coupon.max_redemptions
              ? `${coupon.redemption_count.toLocaleString()} / ${coupon.max_redemptions.toLocaleString()}`
              : coupon.redemption_count.toLocaleString()
          }
          tone="violet"
          mono
        />
        <Card
          label="Per-user limit"
          value={coupon.per_user_limit?.toLocaleString() ?? "∞"}
          mono
        />
        <Card
          label="Tier scope"
          value={
            coupon.applies_to_tiers.length === 0
              ? "any"
              : coupon.applies_to_tiers.join(", ")
          }
        />
      </div>

      {usagePct !== null && (
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
            Usage
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-app">
            <div
              className="h-full rounded-full bg-tool-accent"
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-muted tabular-nums">
            {usagePct}% used
          </div>
        </div>
      )}

      {/* Edit form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit coupon</h2>
        <p className="mt-0.5 text-xs text-muted">
          Code is the primary key — it can&apos;t be renamed. Delete &amp;
          recreate to change.
        </p>
        <div className="mt-4">
          <CouponForm
            coupon={coupon}
            action={updateCoupon}
            submitLabel="Save changes"
          />
        </div>
      </section>

      {/* Manual admin redemption */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Manual redemption</h2>
        <p className="mt-0.5 text-xs text-muted">
          Issue this coupon to a specific user (and optionally workspace).
          Logged in audit as <code className="font-mono">coupon.redeem</code>.
          The runtime billing flow handles end-user redemptions; this is the
          override path.
        </p>
        <form
          action={redeemCoupon}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <input type="hidden" name="code" value={coupon.code} />
          <input
            type="text"
            name="user_id"
            required
            placeholder="User UUID"
            className={`${inputClass} font-mono text-xs`}
          />
          <input
            type="text"
            name="workspace_id"
            placeholder="Workspace UUID (optional)"
            className={`${inputClass} font-mono text-xs`}
          />
          <input
            type="text"
            name="note"
            placeholder="Note (optional)"
            className={inputClass}
          />
          <button type="submit" className={buttonClass}>
            Redeem
          </button>
        </form>
      </section>

      {/* Redemption history */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Redemption history</h2>
        <p className="mt-0.5 text-xs text-muted">
          Most recent {REDEMPTIONS_LIMIT.toLocaleString()} redemptions.
          Joined to user email and workspace name.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">Redeemed at</th>
                <th className="px-3 py-2 text-left font-normal">User email</th>
                <th className="px-3 py-2 text-left font-normal">Workspace</th>
                <th className="px-3 py-2 text-left font-normal">Manual</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-8 text-center text-faint"
                  >
                    No redemptions yet.
                  </td>
                </tr>
              ) : (
                redemptions.map((r) => {
                  const email = r.user_id
                    ? emailMap.get(r.user_id)?.email ?? null
                    : null;
                  const wsName = r.workspace_id
                    ? wsMap.get(r.workspace_id) ?? r.workspace_id.slice(0, 8)
                    : null;
                  const manual =
                    r.metadata && (r.metadata as Record<string, unknown>).manual === true;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-app last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                        {formatDateTime(r.redeemed_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-app">
                        {r.user_id ? (
                          <Link
                            href={`/admin/users/${r.user_id}`}
                            className="hover:text-tool-accent"
                          >
                            {email ?? r.user_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-secondary">
                        {r.workspace_id ? (
                          <Link
                            href={`/admin/workspaces/${r.workspace_id}`}
                            className="hover:text-tool-accent"
                          >
                            {wsName}
                          </Link>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {manual ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                            manual
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this coupon and cascade-delete its redemptions.
        </p>
        <form action={deleteCoupon} className="mt-3">
          <input type="hidden" name="code" value={coupon.code} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete {coupon.code}
          </button>
        </form>
      </section>

      <div>
        <Link href="/admin/coupons" className={buttonGhostClass}>
          Back to coupons
        </Link>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "violet";
  mono?: boolean;
}) {
  const toneCls = tone === "violet" ? "text-tool-accent" : "text-app";
  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        {label}
      </div>
      <div
        className={`mt-1 truncate font-semibold tabular-nums ${toneCls} ${
          mono ? "font-mono text-base" : "text-2xl"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
