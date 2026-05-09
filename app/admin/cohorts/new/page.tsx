import Link from "next/link";

import { buttonGhostClass } from "../../_lib";
import { createCohort } from "../_actions";
import CohortForm from "../_components/CohortForm";

export const dynamic = "force-dynamic";

export default function NewCohortPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/cohorts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Cohorts
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New cohort</h1>
        <p className="mt-0.5 text-xs text-muted">
          Define a segment in JSON. Membership is computed lazily — click
          Recompute on the per-cohort page after saving.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <CohortForm
          cohort={null}
          action={createCohort}
          submitLabel="Create cohort"
        />
      </section>

      <div>
        <Link href="/admin/cohorts" className={buttonGhostClass}>
          Back to cohorts
        </Link>
      </div>
    </div>
  );
}
