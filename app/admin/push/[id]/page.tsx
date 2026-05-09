import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { PushCampaignRow } from "../../_types";
import { PushForm } from "../_PushForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminPushDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const campaign = (data as PushCampaignRow | null) ?? null;
  if (!campaign) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/push"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All campaigns
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Campaign · {campaign.title}
        </h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
          {campaign.id}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Created {formatDateTime(campaign.created_at)} · last updated{" "}
          {formatDateTime(campaign.updated_at)} · status {campaign.status}
        </p>
      </div>

      {(campaign.status === "sending" || campaign.status === "sent") && (
        <div className="rounded-xl border border-app bg-app-elevated p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Delivery
          </div>
          <div className="mt-1 grid gap-3 sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint">
                Targets
              </div>
              <div className="font-mono text-lg tabular-nums text-app">
                {campaign.total_targets.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint">
                Sent
              </div>
              <div className="font-mono text-lg tabular-nums text-emerald-500 dark:text-emerald-400">
                {campaign.total_sent.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-faint">
                Failed
              </div>
              <div className="font-mono text-lg tabular-nums text-rose-500">
                {campaign.total_failed.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      <PushForm mode="edit" campaign={campaign} />
    </div>
  );
}
