import Link from "next/link";

import { PushForm } from "../_PushForm";

export const dynamic = "force-dynamic";

export default function AdminPushNewPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/push"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All campaigns
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New push campaign</h1>
        <p className="mt-0.5 text-xs text-muted">
          Save as draft, schedule, or open the row to send manually.
        </p>
      </div>
      <PushForm mode="create" campaign={null} />
    </div>
  );
}
