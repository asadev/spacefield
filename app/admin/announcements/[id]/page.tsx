import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../_lib";
import type { AnnouncementRow } from "../../_types";
import { AnnouncementForm } from "../_AnnouncementForm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminAnnouncementDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const announcement = (data as AnnouncementRow | null) ?? null;
  if (!announcement) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/announcements"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All announcements
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          Edit announcement
        </h1>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-faint">
          {announcement.id}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Created {formatDateTime(announcement.created_at)} · last updated{" "}
          {formatDateTime(announcement.updated_at)}
        </p>
      </div>
      <AnnouncementForm mode="edit" announcement={announcement} />
    </div>
  );
}
