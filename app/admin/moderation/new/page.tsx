import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../../_lib";
import { createRule } from "../_actions";
import {
  ACTION_LABELS,
  ACTIONS,
  APPLIES_TO,
  APPLIES_TO_LABELS,
  RULE_KIND_HINTS,
  RULE_KIND_LABELS,
  RULE_KINDS,
  type ModerationRuleKind,
} from "../_helpers";

export const dynamic = "force-dynamic";

type SearchParams = {
  rule_kind?: string;
};

export default async function NewModerationRulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const kind = (RULE_KINDS as readonly string[]).includes(sp.rule_kind ?? "")
    ? (sp.rule_kind as ModerationRuleKind)
    : "banned_word";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/moderation"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Moderation rules
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New rule</h1>
        <p className="mt-0.5 text-xs text-muted">
          Pick a rule kind, write the pattern and choose an action. Rule
          evaluation is performed by the runtime moderator at write-time
          for each source.
        </p>
      </div>

      {/* Rule-kind picker (GET, no save) — re-renders the hint copy */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Rule kind</h2>
        <form
          method="get"
          action="/admin/moderation/new"
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <select name="rule_kind" defaultValue={kind} className={inputClass}>
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RULE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonGhostClass}>
            Switch kind
          </button>
        </form>
        <div className="mt-2 text-[11px] text-faint">
          {RULE_KIND_HINTS[kind]}
        </div>
      </section>

      {/* Save form */}
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <h2 className="text-sm font-semibold text-app">Details</h2>

        <form action={createRule} className="mt-4 space-y-4">
          <input type="hidden" name="rule_kind" value={kind} />

          <Field
            label="Pattern"
            hint={RULE_KIND_HINTS[kind]}
          >
            {kind === "threshold" || kind === "regex" ? (
              <textarea
                name="pattern"
                required
                rows={4}
                spellCheck={false}
                placeholder={
                  kind === "threshold"
                    ? '{"field":"toxicity","min":0.8}'
                    : "(?i)\\bspam\\w*"
                }
                className={`${inputClass} font-mono text-xs`}
              />
            ) : (
              <input
                type={kind === "length" ? "number" : "text"}
                name="pattern"
                required
                spellCheck={false}
                placeholder={
                  kind === "banned_word"
                    ? "e.g. fuckface"
                    : kind === "length"
                      ? "e.g. 4096"
                      : ""
                }
                className={`${inputClass} font-mono text-xs`}
              />
            )}
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Action">
              <select name="action" defaultValue="flag" className={inputClass}>
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
                defaultValue="any"
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
                defaultValue={3}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Enabled">
            <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="h-4 w-4 rounded border-app accent-tool-accent"
              />
              <span>Active immediately</span>
            </label>
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" className={buttonClass}>
              Create rule
            </button>
            <Link href="/admin/moderation" className={buttonGhostClass}>
              Cancel
            </Link>
          </div>
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
