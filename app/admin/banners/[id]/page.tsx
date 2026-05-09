import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { SiteBannerRow } from "../../_types";
import { BannerForm } from "../_BannerForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminBannerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("site_banners")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const banner = (data as SiteBannerRow | null) ?? null;
  if (!banner) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/banners"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All banners
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">Edit banner</h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
          {banner.id}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Created {formatDateTime(banner.created_at)} · last updated{" "}
          {formatDateTime(banner.updated_at)}
        </p>
      </div>
      <BannerForm mode="edit" banner={banner} />
    </div>
  );
}
