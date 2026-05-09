import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  buttonClass,
  buttonGhostClass,
  fetchAuthUsersByIds,
  formatDateTime,
  inputClass,
} from "../../_lib";
import { deleteRule, updateRule } from "../_actions";
import {
  ACTION_CHIP_COLORS,
  ACTION_LABELS,
  ACTIONS,
  APPLIES_TO,
  APPLIES_TO_CHIP_COLORS,
  APPLIES_TO_LABELS,
  QUEUE_STATUS_CHIP_COLORS,
  RULE_KIND_CHIP_COLORS,
  RULE_KIND_HINTS,
  RULE_KIND_LABELS,
  RULE_KINDS,
  severityStars,
  severityToneClass,
  type ModerationRuleKind,
} from "../_helpers";

import type {
  ModerationQueueRow,
  ModerationRuleRow,
} from "../../_types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rule_kind?: string }>;
};

export default async function AdminModerationRuleDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const admin = createAdminClient();

  const [ruleRes, hitsRes] = await Promise.all([
    admin.from("moderation_rules").select("*").eq("id", id).maybeSingle(),
    admin
      .from("moderation_queue")
      .select("*")
      .eq("rule_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const rule = ruleRes.data as ModerationRuleRow | null;
  if (!rule) notFound();

  const hits = (hitsRes.data ?? []) as ModerationQueueRow[];
  const userIds = Array.from(
    new Set(hits.map((h) => h.user_id).filter((u): u is string => Boolean(u)))
  );
  const userMap = await fetchAuthUsersByIds(userIds);

  // Allow previewing a different rule_kind for help-copy purposes;
  // we still save the kind that's submitted by the form.
  const previewKind = (RULE_KINDS as readonly string[]).includes(
    sp.rule_kind ?? ""
  )
    ? (sp.rule_kind as ModerationRuleKind)
    : rule.rule_kind;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/moderation"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Moderation rules
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-base font-semibold text-app">
            {rule.pattern}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              RULE_KIND_CHIP_COLORS[rule.rule_kind]
            }`}
          >
            {RULE_KIND_LABELS[rule.rule_kind]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              ACTION_CHIP_COLORS[rule.action]
            }`}
          >
            {ACTION_LABELS[rule.action]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              APPLIES_TO_CHIP_COLORS[rule.applies_to]
            }`}
          >
            {APPLIES_TO_LABELS[rule.applies_to]}
          </span>
          <span
            className={`font-mono text-xs ${severityToneClass(rule.severity)}`}
          >
            {severityStars(rule.severity)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              rule.enabled
                ? "bg-emerald-500/15 text-emerald-500"
                : "bg-app text-faint border border-app"
            }`}
          >
            {rule.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          <span className="rounded-md border border-app bg-app px-2 py-1">
            created {formatDateTime(rule.created_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            updated {formatDateTime(rule.updated_at)}
          </span>
          <span className="rounded-md border border-app bg-app px-2 py-1">
            queue hits {hits.length}
          </span>
        </div>
      </div>

      {/* Editor */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Edit rule</h2>

        <form
          method="get"
          action={`/admin/moderation/${id}`}
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <select
            name="rule_kind"
            defaultValue={previewKind}
            className={inputClass}
          >
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RULE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Preview kind
          </button>
        </form>
        <div className="mt-1 text-[11px] text-faint">
          {RULE_KIND_HINTS[previewKind]}
        </div>

        <form action={updateRule} className="mt-5 space-y-4">
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="rule_kind" value={previewKind} />

          <Field label="Pattern" hint={RULE_KIND_HINTS[previewKind]}>
            {previewKind === "threshold" || previewKind === "regex" ? (
              <textarea
                name="pattern"
                required
                rows={4}
                spellCheck={false}
                defaultValue={rule.pattern}
                className={`${inputClass} font-mono text-xs`}
              />
            ) : (
              <input
                type={previewKind === "length" ? "number" : "text"}
                name="pattern"
                required
                spellCheck={false}
                defaultValue={rule.pattern}
                className={`${inputClass} font-mono text-xs`}
              />
            )}
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Action">
              <select
                name="action"
                defaultValue={rule.action}
                className={inputClass}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Applies to">
              <select
                name="applies_to"
                defaultValue={rule.applies_to}
                className={inputClass}
              >
                {APPLIES_TO.map((a) => (
                  <option key={a} value={a}>
                    {APPLIES_TO_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Severity (1–5)">
              <input
                type="number"
                name="severity"
                min={1}
                max={5}
                step={1}
                defaultValue={rule.severity}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Enabled">
            <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={rule.enabled}
                className="h-4 w-4 rounded border-app accent-tool-accent"
              />
              <span>Active</span>
            </label>
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Save changes
            </button>
            <Link href="/admin/moderation" className={buttonGhostClass}>
              Back to rules
            </Link>
          </div>
        </form>
      </section>

      {/* Recent queue hits for this rule */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">
          Recent matches ({hits.length})
        </h2>
        <p className="mt-1 text-xs text-muted">
          Items that matched this rule and went into{" "}
          <code className="font-mono">moderation_queue</code>. Limited to 50.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-app bg-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                <th className="px-3 py-2 text-left font-normal">When</th>
                <th className="px-3 py-2 text-left font-normal">Source</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">User</th>
                <th className="px-3 py-2 text-left font-normal">Excerpt</th>
              </tr>
            </thead>
            <tbody>
              {hits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-faint">
                    No matches yet.
                  </td>
                </tr>
              ) : (
                hits.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-app last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums text-secondary">
                      {formatDateTime(h.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-secondary">
                      {h.source}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          QUEUE_STATUS_CHIP_COLORS[h.status]
                        }`}
                      >
                        {h.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-secondary">
                      {h.user_id
                        ? userMap.get(h.user_id)?.email ?? h.user_id.slice(0, 8)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 max-w-md truncate text-app">
                      {h.content || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Link
            href={`/admin/moderation/queue?rule_id=${rule.id}`}
            className={buttonGhostClass}
          >
            Open in queue
          </Link>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h2 className="text-sm font-semibold text-rose-500">Danger zone</h2>
        <p className="mt-1 text-xs text-rose-500/80">
          Permanently delete this rule. Existing queue rows are preserved
          but will lose their rule reference (FK is{" "}
          <code className="font-mono">on delete set null</code>).
        </p>
        <form action={deleteRule} className="mt-3">
          <input type="hidden" name="id" value={rule.id} />
          <button
            type="submit"
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20"
          >
            Delete rule
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
