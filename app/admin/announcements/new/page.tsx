import Link from "next/link";

import { AnnouncementForm } from "../_AnnouncementForm";

export const dynamic = "force-dynamic";

export default function AdminAnnouncementNewPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/announcements"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All announcements
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New announcement</h1>
        <p className="mt-0.5 text-xs text-muted">
          Leave Published-at blank to save as a draft.
        </p>
      </div>
      <AnnouncementForm mode="create" announcement={null} />
    </div>
  );
}
