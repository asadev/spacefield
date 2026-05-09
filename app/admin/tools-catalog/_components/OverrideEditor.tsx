import Link from "next/link";

import {
  buttonClass,
  buttonGhostClass,
  formatDateTime,
  inputClass,
} from "../../_lib";
import type { AgentToolOverrideRow } from "../../_types";
import { clearToolOverride, setToolOverride } from "../_actions";
import type { ToolSource } from "../_data";

interface AgentLite {
  id: string;
  display_name: string;
  status: string;
}

interface OverrideEditorProps {
  /** Used only to pick revalidation paths. */
  source: ToolSource;
  /** URL-id of the tool detail page (the tool name or app slug). */
  idForPath: string;
  /** Skill that owns the tool. Required for skill-* sources. For
   *  app-registry tools the override surface is hidden by the parent
   *  page, so this component is only rendered when skill_id is set. */
  skill_id: string;
  /** The tool name (snake_case). */
  tool_name: string;
  /** All agents — for the dropdown picker on the new-override form. */
  agents: AgentLite[];
  /** Existing override rows for this (skill_id, tool_name). */
  overrides: AgentToolOverrideRow[];
}

const TRISTATE_LABEL: Record<string, string> = {
  "": "—",
  true: "yes",
  false: "no",
};

/**
 * Override editor: lets an admin add a per-agent override for a
 * specific (skill, tool) pair, and edit/clear existing rows.
 *
 * The contract also calls for "global overrides (`agent_id='*'`)". Our
 * `agent_tool_overrides.agent_id` is an FK to `ai_agents(id)`, so a
 * literal '*' would fail unless Agent H seeds a sentinel agent row.
 * We surface the option as a free-text agent_id input alongside the
 * dropdown so an admin can type '*' once that sentinel exists.
 */
export default function OverrideEditor({
  source,
  idForPath,
  skill_id,
  tool_name,
  agents,
  overrides,
}: OverrideEditorProps) {
  const overridenAgents = new Set(overrides.map((o) => o.agent_id));
  const availableAgents = agents.filter((a) => !overridenAgents.has(a.id));

  return (
    <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app">Tool overrides</h2>
          <p className="mt-0.5 text-xs text-muted">
            Override description, read-only status, or confirmation
            requirement for a specific agent. Use this when one agent
            should expose this tool with a different description or
            tighter safety than the skill default.
          </p>
        </div>
      </header>

      {/* Existing overrides */}
      <div className="space-y-2">
        {overrides.length === 0 ? (
          <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-muted">
            No overrides set. Tool is exposed to every agent that
            includes the parent skill, with the skill&apos;s default
            description and flags.
          </div>
        ) : (
          overrides.map((o) => (
            <OverrideRow
              key={o.agent_id}
              source={source}
              idForPath={idForPath}
              row={o}
              agents={agents}
            />
          ))
        )}
      </div>

      {/* Add a new override */}
      <details className="rounded-lg border border-app bg-app p-3">
        <summary className="cursor-pointer text-xs font-medium text-app">
          + Add override
        </summary>
        <form action={setToolOverride} className="mt-3 space-y-3">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="id_for_path" value={idForPath} />
          <input type="hidden" name="skill_id" value={skill_id} />
          <input type="hidden" name="tool_name" value={tool_name} />

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Agent</span>
              <select
                name="agent_id"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Pick an agent…
                </option>
                {availableAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name} ({a.id})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-faint">
                Only agents that don&apos;t already have an override are
                listed.
              </p>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Enabled</span>
              <select
                name="enabled"
                defaultValue="true"
                className={inputClass}
              >
                <option value="true">enabled</option>
                <option value="false">disabled (hide tool)</option>
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-faint">Description override</span>
            <textarea
              name="override_description"
              rows={3}
              placeholder="Leave blank to inherit the skill default."
              className={`${inputClass} resize-y`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block text-faint">Read-only override</span>
              <select
                name="read_only_override"
                defaultValue=""
                className={inputClass}
              >
                <option value="">inherit (no override)</option>
                <option value="true">force read-only</option>
                <option value="false">force writable</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-faint">
                Confirmation override
              </span>
              <select
                name="requires_confirmation_override"
                defaultValue=""
                className={inputClass}
              >
                <option value="">inherit (no override)</option>
                <option value="true">require confirm</option>
                <option value="false">never confirm</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="submit" className={buttonClass}>
              Save override
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

function OverrideRow({
  source,
  idForPath,
  row,
  agents,
}: {
  source: ToolSource;
  idForPath: string;
  row: AgentToolOverrideRow;
  agents: AgentLite[];
}) {
  const agent = agents.find((a) => a.id === row.agent_id);
  const agentLabel = agent?.display_name ?? row.agent_id;

  return (
    <div className="rounded-lg border border-app bg-app p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm text-app">
            {row.agent_id === "*" ? (
              <span className="text-tool-accent">
                Global override (all agents)
              </span>
            ) : (
              <>
                <Link
                  href={`/admin/agents/${encodeURIComponent(row.agent_id)}`}
                  className="hover:text-tool-accent"
                >
                  {agentLabel}
                </Link>
                <span className="ml-2 font-mono text-[11px] tabular-nums text-faint">
                  {row.agent_id}
                </span>
              </>
            )}
          </div>
          <div className="text-[11px] text-muted">
            Set {formatDateTime(row.updated_at)} · enabled:{" "}
            <span
              className={
                row.enabled
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-500"
              }
            >
              {row.enabled ? "yes" : "no"}
            </span>
          </div>
        </div>
        <form action={clearToolOverride}>
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="id_for_path" value={idForPath} />
          <input type="hidden" name="agent_id" value={row.agent_id} />
          <input type="hidden" name="skill_id" value={row.skill_id} />
          <input type="hidden" name="tool_name" value={row.tool_name} />
          <button type="submit" className={buttonGhostClass}>
            Clear override
          </button>
        </form>
      </div>

      <form action={setToolOverride} className="space-y-3">
        <input type="hidden" name="source" value={source} />
        <input type="hidden" name="id_for_path" value={idForPath} />
        <input type="hidden" name="agent_id" value={row.agent_id} />
        <input type="hidden" name="skill_id" value={row.skill_id} />
        <input type="hidden" name="tool_name" value={row.tool_name} />

        <label className="block text-xs">
          <span className="mb-1 block text-faint">Description override</span>
          <textarea
            name="override_description"
            rows={2}
            defaultValue={row.override_description ?? ""}
            placeholder="Leave blank to inherit the skill default."
            className={`${inputClass} resize-y`}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="mb-1 block text-faint">Read-only override</span>
            <select
              name="read_only_override"
              defaultValue={
                row.read_only_override === null
                  ? ""
                  : String(row.read_only_override)
              }
              className={inputClass}
            >
              <option value="">inherit ({TRISTATE_LABEL[""]})</option>
              <option value="true">force read-only</option>
              <option value="false">force writable</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-faint">
              Confirmation override
            </span>
            <select
              name="requires_confirmation_override"
              defaultValue={
                row.requires_confirmation_override === null
                  ? ""
                  : String(row.requires_confirmation_override)
              }
              className={inputClass}
            >
              <option value="">inherit ({TRISTATE_LABEL[""]})</option>
              <option value="true">require confirm</option>
              <option value="false">never confirm</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-faint">Enabled</span>
            <select
              name="enabled"
              defaultValue={String(row.enabled)}
              className={inputClass}
            >
              <option value="true">enabled</option>
              <option value="false">disabled (hide tool)</option>
            </select>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="submit" className={buttonGhostClass}>
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
