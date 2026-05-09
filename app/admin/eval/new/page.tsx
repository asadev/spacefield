import Link from "next/link";

import { createSuite } from "../_actions";
import SuiteForm from "../_SuiteForm";
import { TARGET_KINDS, fetchTargetOptions } from "../_helpers";

import type { EvalTargetKind } from "../../_types";

export const dynamic = "force-dynamic";

type SearchParams = {
  target_kind?: string;
};

export default async function NewSuitePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const selectedKind: EvalTargetKind = (TARGET_KINDS as readonly string[]).includes(
    sp.target_kind ?? ""
  )
    ? (sp.target_kind as EvalTargetKind)
    : "agent";

  const targets = await fetchTargetOptions();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/eval"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Eval suites
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New eval suite</h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick the target kind first — switching it re-renders the
          target dropdown below it.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <SuiteForm
          mode="create"
          action={createSuite}
          targets={targets}
          selectedKind={selectedKind}
        />
      </section>

      <p className="text-[11px] text-faint">
        Tip: to switch the target kind, change the dropdown and click the
        button below — it&apos;ll re-fetch the candidate target list.
      </p>
      <form
        method="get"
        action="/admin/eval/new"
        className="flex items-center gap-2"
      >
        <select
          name="target_kind"
          defaultValue={selectedKind}
          className="rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app"
        >
          {TARGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
        >
          Re-list targets
        </button>
      </form>
    </div>
  );
}
