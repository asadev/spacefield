import Link from "next/link";

import { createFlow } from "../_actions";
import FlowForm from "../_components/FlowForm";

export const dynamic = "force-dynamic";

/**
 * Create a new onboarding_flows row. Steps cannot be added on this page —
 * after creation, the editor at `/admin/onboarding/[id]` opens with the
 * step list ready for input.
 */
export default function AdminOnboardingNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/onboarding"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← All flows
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          New onboarding flow
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: status=draft, trigger=first_login, audience=all, no
          steps. After saving you&apos;ll land on the flow editor where you
          can add steps.
        </p>
      </div>

      <FlowForm mode="create" action={createFlow} />
    </div>
  );
}
