import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { buttonGhostClass, formatDateTime } from "../../_lib";
import { deleteRule, updateRule } from "../_actions";
import IpRuleForm from "../RuleForm";

import type { IpRuleRow } from "../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditIpRulePage({ params }: PageProps) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ip_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const rule = (data as IpRuleRow | null) ?? null;
  if (!rule) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/ip-rules"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← IP rules
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">Edit IP rule</h1>
        <p className="mt-0.5 font-mono text-[11px] text-muted">{rule.id}</p>
      </div>

      <IpRuleForm rule={rule} action={updateRule} submitLabel="Save changes" />

      <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-rose-500">Delete rule</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Removes the row entirely. Audit log keeps a copy.
          </p>
        </div>
        <form action={deleteRule}>
          <input type="hidden" name="id" value={rule.id} />
          <button
            type="submit"
            className={`${buttonGhostClass} border-rose-500/30 text-rose-500 hover:border-rose-500`}
          >
            Delete this rule
          </button>
        </form>
      </section>

      <div className="text-[11px] text-muted">
        Created{" "}
        <span className="font-mono">{formatDateTime(rule.created_at)}</span>
        {" · "}
        Updated{" "}
        <span className="font-mono">{formatDateTime(rule.updated_at)}</span>
      </div>
    </div>
  );
}
