import Link from "next/link";

import { buttonGhostClass } from "../../_lib";
import { createFunnel } from "../_actions";
import FunnelForm from "../_components/FunnelForm";

export const dynamic = "force-dynamic";

export default function NewFunnelPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/funnels"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Funnels
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New funnel</h1>
        <p className="mt-0.5 text-xs text-muted">
          Define an ordered list of steps to measure conversion against.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <FunnelForm
          funnel={null}
          action={createFunnel}
          submitLabel="Create funnel"
        />
      </section>

      <div>
        <Link href="/admin/funnels" className={buttonGhostClass}>
          Back to funnels
        </Link>
      </div>
    </div>
  );
}
