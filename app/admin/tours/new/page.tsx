import Link from "next/link";

import { createTour } from "../_actions";
import TourForm from "../_components/TourForm";

export const dynamic = "force-dynamic";

/**
 * Create a new product_tours row. The form ships with a placeholder
 * `steps` array so the JSON shape is obvious; you can edit / replace it
 * before saving.
 */
export default function AdminTourNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tours"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← All tours
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New product tour</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: status=draft, trigger=manual. After saving you&apos;ll
          land on the tour editor.
        </p>
      </div>

      <TourForm mode="create" action={createTour} />
    </div>
  );
}
