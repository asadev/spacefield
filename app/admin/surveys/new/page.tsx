import Link from "next/link";

import { SurveyForm } from "../_SurveyForm";

export const dynamic = "force-dynamic";

export default function AdminSurveyNewPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/surveys"
          className="text-[11px] uppercase tracking-[0.18em] text-muted hover:text-app"
        >
          ← All surveys
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New survey</h1>
        <p className="mt-0.5 text-xs text-muted">
          Save as draft to iterate; switch to Live when ready to collect.
        </p>
      </div>
      <SurveyForm mode="create" survey={null} />
    </div>
  );
}
