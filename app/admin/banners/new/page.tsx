import Link from "next/link";

import { BannerForm } from "../_BannerForm";

export const dynamic = "force-dynamic";

export default function AdminBannerNewPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/banners"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All banners
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New banner</h1>
        <p className="mt-0.5 text-xs text-muted">
          Schedule a top-of-page notice. Audience + window are evaluated each
          render.
        </p>
      </div>
      <BannerForm mode="create" banner={null} />
    </div>
  );
}
