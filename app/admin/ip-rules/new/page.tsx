import Link from "next/link";

import { createRule } from "../_actions";
import IpRuleForm from "../RuleForm";

export const dynamic = "force-dynamic";

export default async function NewIpRulePage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/ip-rules"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← IP rules
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New IP rule</h1>
        <p className="mt-0.5 text-xs text-muted">
          Allow or block by IPv4 / CIDR.
        </p>
      </div>

      <IpRuleForm rule={null} action={createRule} submitLabel="Create rule" />
    </div>
  );
}
