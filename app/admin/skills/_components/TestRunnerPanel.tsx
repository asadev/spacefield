import type { AiSkillRow } from "../../_types";
import { runSkillTest } from "../_actions";

/**
 * Server component. Renders a small form that lets admins simulate a
 * tool dispatch — the action validates the JSON input, resolves the
 * tool definition, and stashes the result in skill.metadata.last_test
 * so it shows up here on the next render. Doesn't fully invoke the
 * runtime (the production runtime needs a real user-scoped Supabase
 * client and an authenticated user). What it does cover is everything
 * the admin can verify without firing live writes: tool exists, schema
 * matches, dispatch target is correct, payload is shaped right.
 */

export type TestRunnerPanelProps = {
  skill: AiSkillRow;
  /** Tool names the admin can pick from. Code or custom — both work. */
  toolNames: string[];
};

type LastTest = {
  at?: string;
  by?: string;
  resolved?: boolean;
  source?: "code" | "custom" | null;
  description?: string | null;
  read_only?: boolean | null;
  requires_confirmation?: boolean | null;
  parsed_input?: unknown;
  parse_error?: string | null;
  dispatch?: unknown;
};

function readLastTest(skill: AiSkillRow): LastTest | null {
  const meta = skill.metadata ?? {};
  const lt = (meta as Record<string, unknown>).last_test;
  if (!lt || typeof lt !== "object" || Array.isArray(lt)) return null;
  return lt as LastTest;
}

export default function TestRunnerPanel({
  skill,
  toolNames,
}: TestRunnerPanelProps) {
  const lastTest = readLastTest(skill);

  return (
    <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      <header>
        <h2 className="text-sm font-semibold text-app">Test runner</h2>
        <p className="mt-0.5 text-xs text-muted">
          Pick a tool and paste a JSON input to verify the dispatch
          plumbing. The runner validates the JSON shape and resolves the
          handler — RPC name, HTTP URL, or code module — then writes the
          result to the skill&apos;s metadata so you can see it below. It
          does <em>not</em> execute live writes against your workspace.
        </p>
      </header>

      <form
        action={runSkillTest}
        className="grid gap-3 rounded-lg border border-app bg-app p-3"
      >
        <input type="hidden" name="skill_id" value={skill.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Tool
            </span>
            {toolNames.length === 0 ? (
              <input
                type="text"
                name="tool_name"
                placeholder="snake_case_tool_name"
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-sm text-app outline-none transition-colors focus:border-tool-accent"
              />
            ) : (
              <select
                name="tool_name"
                defaultValue={toolNames[0]}
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
              >
                {toolNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </label>
          <div className="hidden md:block" />
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            Input (JSON object)
          </span>
          <textarea
            name="input_json"
            rows={6}
            spellCheck={false}
            placeholder='{ "limit": 5 }'
            className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[11px] leading-relaxed text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint"
          />
          <span className="text-[11px] text-faint">
            Empty input is allowed for tools whose schema accepts no
            properties.
          </span>
        </label>

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Run test
          </button>
        </div>
      </form>

      {lastTest && (
        <div className="space-y-2 rounded-lg border border-app bg-app p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Last test result
            </div>
            <div className="text-[11px] text-faint">
              {lastTest.at
                ? new Date(lastTest.at).toISOString().replace("T", " ").slice(0, 19)
                : "—"}
            </div>
          </div>
          <dl className="space-y-1 text-xs">
            <Detail label="resolved">
              <code className="font-mono text-app">
                {String(lastTest.resolved ?? false)}
              </code>
            </Detail>
            <Detail label="source">
              <code className="font-mono text-app">
                {lastTest.source ?? "—"}
              </code>
            </Detail>
            {lastTest.parse_error && (
              <Detail label="parse_error">
                <span className="text-rose-500">{lastTest.parse_error}</span>
              </Detail>
            )}
            <Detail label="description">
              <span className="text-secondary">
                {lastTest.description ?? <span className="text-faint">—</span>}
              </span>
            </Detail>
            <Detail label="dispatch">
              <pre className="max-h-48 overflow-auto rounded bg-app-elevated p-2 font-mono text-[11px] text-app">
                {JSON.stringify(lastTest.dispatch ?? null, null, 2)}
              </pre>
            </Detail>
            <Detail label="parsed_input">
              <pre className="max-h-48 overflow-auto rounded bg-app-elevated p-2 font-mono text-[11px] text-app">
                {JSON.stringify(lastTest.parsed_input ?? null, null, 2)}
              </pre>
            </Detail>
          </dl>
        </div>
      )}
    </section>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-32 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
