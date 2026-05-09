import { setUserTier } from "../../../_actions";
import { buttonClass, formatDateTime, inputClass } from "../../../_lib";
import { createAdminClient } from "@/lib/supabase/admin";

type SubscriptionRow = {
  user_id: string;
  tier_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  paddle_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type Tier = {
  tier_id: string;
  name: string;
  price_cents_monthly: number;
};

export default async function SubscriptionTab({
  userId,
}: {
  userId: string;
  authEmail: string | null;
}) {
  const admin = createAdminClient();
  const [subRes, tiersRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select(
        "user_id, tier_id, status, started_at, expires_at, paddle_customer_id, paddle_subscription_id, paddle_status, metadata, created_at, updated_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("subscription_tiers")
      .select("tier_id, name, price_cents_monthly")
      .order("sort_order", { ascending: true }),
  ]);

  const sub = subRes.data as SubscriptionRow | null;
  const tiers = (tiersRes.data ?? []) as Tier[];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Current subscription */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Current subscription</h2>
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

          <dt className="text-muted">Updated</dt>
          <dd className="font-mono text-xs tabular-nums text-secondary">
            {formatDateTime(sub?.updated_at)}
          </dd>
        </dl>

        <form action={setUserTier} className="mt-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="user_id" value={userId} />
          <select
            name="tier_id"
            defaultValue={sub?.tier_id ?? "free"}
            className={`${inputClass} h-9 max-w-[14rem]`}
          >
            {tiers.map((t) => (
              <option key={t.tier_id} value={t.tier_id}>
                {t.name} ({t.tier_id})
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass}>
            Change tier
          </button>
        </form>
      </section>

      {/* Paddle metadata */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Paddle billing</h2>
        <p className="mt-1 text-xs text-muted">
          Linked customer/subscription IDs from the Paddle webhook
          integration. If empty, this user has never paid.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">Customer ID</dt>
          <dd className="break-all font-mono text-[11px] tabular-nums text-secondary">
            {sub?.paddle_customer_id ?? "—"}
          </dd>

          <dt className="text-muted">Subscription ID</dt>
          <dd className="break-all font-mono text-[11px] tabular-nums text-secondary">
            {sub?.paddle_subscription_id ?? "—"}
          </dd>

          <dt className="text-muted">Paddle status</dt>
          <dd className="text-app">{sub?.paddle_status ?? "—"}</dd>
        </dl>

        {sub?.metadata && Object.keys(sub.metadata).length > 0 && (
          <details className="mt-4 rounded-lg border border-app bg-app p-3 text-xs">
            <summary className="cursor-pointer text-muted">
              Subscription metadata JSON
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] tabular-nums text-app">
              {JSON.stringify(sub.metadata, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </div>
  );
}
