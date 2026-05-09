import Link from "next/link";

import { createIntegration } from "../_actions";
import IntegrationForm from "../_IntegrationForm";

export const dynamic = "force-dynamic";

export default function NewIntegrationPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/integrations"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Integrations
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          New integration
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Add a third-party catalog row. The runtime reads{" "}
          <code className="rounded bg-app px-1 text-[11px]">enabled = true</code>{" "}
          rows; the marketing UI also displays{" "}
          <code className="rounded bg-app px-1 text-[11px]">status = available</code>{" "}
          / <code className="rounded bg-app px-1 text-[11px]">beta</code>.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <IntegrationForm mode="create" action={createIntegration} />
      </section>
    </div>
  );
}
