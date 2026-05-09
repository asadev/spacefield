import Link from "next/link";

import { createRule } from "../_actions";
import RuleForm from "../RuleForm";

export const dynamic = "force-dynamic";

export default async function NewRateLimitRulePage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/rate-limits"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Rate limits
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New rate-limit rule</h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick a scope, set a limit and window, save.
        </p>
      </div>

      <RuleForm rule={null} action={createRule} submitLabel="Create rule" />
    </div>
  );
}
