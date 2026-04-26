import { createAdminClient } from "@/lib/supabase/admin";

import TierForm, { type Tier } from "./_TierForm";

export const dynamic = "force-dynamic";

export default async function AdminTiersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscription_tiers")
    .select(
      "tier_id, name, price_cents_monthly, price_cents_yearly, max_owned_workspaces, max_storage_per_workspace_mb, max_members_per_workspace, features, is_public, sort_order"
    )
    .order("sort_order", { ascending: true });

  const tiers = (data ?? []) as Tier[];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Tiers
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">
          Subscription tiers
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Edit prices, quotas, and feature flags. Changes take effect
          immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {tiers.length === 0 && (
          <div className="rounded-xl border border-app bg-app-elevated p-5 text-sm text-faint">
            No tiers configured.
          </div>
        )}
        {tiers.map((t) => (
          <TierForm key={t.tier_id} tier={t} />
        ))}
      </div>
    </div>
  );
}
