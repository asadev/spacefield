"use client";

import { useMemo, useState } from "react";

import type { EffectiveTool } from "../_data";
import {
  buttonClass,
  buttonGhostClass,
  inputClass,
} from "./_styles";

/**
 * Per-agent tool-override editor. Lists every (skill, tool) pair the
 * agent has access to and lets the admin override the description,
 * read-only flag, requires-confirmation flag, and enabled flag.
 *
 * Each row is its own `<form action={setAgentToolOverride}>`. The
 * "Clear override" button posts to `clearAgentToolOverride`. After
 * either action the page revalidates server-side, so the user gets a
 * fresh effective tool list without manual reload.
 *
 * The "Add override" form at the top lets the admin attach an override
 * by skill_id + tool_name even if it isn't in the auto-listed pairs
 * (handy for tools that haven't been registered in `tools_json` yet).
 */
export type ToolOverrideEditorProps = {
  agentId: string;
  tools: EffectiveTool[];
  setAction: (formData: FormData) => void;
  clearAction: (formData: FormData) => void;
};

type TriBool = "" | "true" | "false";

function triValue(b: boolean | null | undefined): TriBool {
  if (b === true) return "true";
  if (b === false) return "false";
  return "";
}

export default function ToolOverrideEditor({
  agentId,
  tools,
  setAction,
  clearAction,
}: ToolOverrideEditorProps) {
  const [filter, setFilter] = useState("");
  const [showOnlyOverridden, setShowOnlyOverridden] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return tools.filter((t) => {
      if (showOnlyOverridden && !t.has_override) return false;
      if (!q) return true;
      return (
        t.tool_name.toLowerCase().includes(q) ||
        t.skill_id.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [filter, showOnlyOverridden, tools]);

  const overriddenCount = tools.filter((t) => t.has_override).length;

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by skill, tool, or description"
          className={`${inputClass} h-9 max-w-md`}
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs text-secondary transition-colors hover:border-tool-accent">
          <input
            type="checkbox"
            checked={showOnlyOverridden}
            onChange={(e) => setShowOnlyOverridden(e.target.checked)}
            className="accent-[var(--tool-accent,#7c3aed)]"
          />
          Show only overridden ({overriddenCount})
        </label>
      </div>

      {/* Add a fresh override (skill_id + tool_name not in auto-list) */}
      <details className="rounded-lg border border-app bg-app">
        <summary className="cursor-pointer px-3 py-2 text-xs text-app hover:text-tool-accent">
          + Add override for an arbitrary (skill, tool) pair
        </summary>
        <div className="border-t border-app p-3">
          <form
            action={setAction}
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="agent_id" value={agentId} />
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Skill ID
              </span>
              <input
                name="skill_id"
                placeholder="crm-contacts"
                required
                pattern="[a-z0-9][a-z0-9_-]*"
                className={`${inputClass} h-9 font-mono text-xs`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Tool name
              </span>
              <input
                name="tool_name"
                placeholder="contacts_create"
                required
                pattern="[a-zA-Z0-9_][a-zA-Z0-9_.-]*"
                className={`${inputClass} h-9 font-mono text-xs`}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={buttonClass}>
                Add override
              </button>
            </div>
            <p className="col-span-full text-[11px] text-faint">
              The override row is created with default values (no
              description override, both flags inherit from the skill).
              Once added, edit it in the list below.
            </p>
          </form>
        </div>
      </details>

      {/* Tool rows */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
          {tools.length === 0
            ? "No tools resolved. Attach skills above first."
            : "No tools match the current filter."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li
              key={`${t.skill_id}::${t.tool_name}`}
              className={`overflow-hidden rounded-lg border ${
                t.has_override
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-app bg-app"
              }`}
            >
              <ToolOverrideRow
                agentId={agentId}
                tool={t}
                setAction={setAction}
                clearAction={clearAction}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolOverrideRow({
  agentId,
  tool,
  setAction,
  clearAction,
}: {
  agentId: string;
  tool: EffectiveTool;
  setAction: (formData: FormData) => void;
  clearAction: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Header line — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-app-elevated"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <code className="font-mono text-xs text-app">{tool.tool_name}</code>
          <span className="text-faint">·</span>
          <code className="font-mono text-[11px] text-muted">
            {tool.skill_id}
          </code>
          {tool.has_override && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
              override
            </span>
          )}
          {!tool.enabled && (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-500">
              disabled
            </span>
          )}
        </div>
        <span className="text-faint">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-app bg-app-elevated/40 px-3 py-3">
          {/* Source values for reference */}
          <dl className="grid grid-cols-1 gap-1 rounded-md border border-app bg-app p-2 text-[11px] sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <dt className="uppercase tracking-wide text-faint">Source</dt>
              <dd className="text-secondary">
                {tool.has_override
                  ? "skill default + override"
                  : "skill default"}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="uppercase tracking-wide text-faint">Effective</dt>
              <dd className="text-secondary">
                read-only={String(tool.read_only)} · confirm=
                {String(tool.requires_confirmation)} · enabled=
                {String(tool.enabled)}
              </dd>
            </div>
          </dl>

          {/* Set/upsert form */}
          <form action={setAction} className="space-y-2">
            <input type="hidden" name="agent_id" value={agentId} />
            <input type="hidden" name="skill_id" value={tool.skill_id} />
            <input type="hidden" name="tool_name" value={tool.tool_name} />

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Override description (blank = inherit)
              </span>
              <textarea
                name="override_description"
                rows={2}
                defaultValue={tool.override?.override_description ?? ""}
                placeholder={tool.description}
                className={`${inputClass} font-mono text-xs`}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Read-only override
                </span>
                <select
                  name="read_only_override"
                  defaultValue={triValue(tool.override?.read_only_override)}
                  className={`${inputClass} h-9`}
                >
                  <option value="">Inherit from skill</option>
                  <option value="true">Force read-only</option>
                  <option value="false">Force read-write</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Requires-confirmation override
                </span>
                <select
                  name="requires_confirmation_override"
                  defaultValue={triValue(
                    tool.override?.requires_confirmation_override
                  )}
                  className={`${inputClass} h-9`}
                >
                  <option value="">Inherit from skill</option>
                  <option value="true">Force confirm</option>
                  <option value="false">Force no-confirm</option>
                </select>
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-secondary">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={tool.enabled}
                value="true"
                className="accent-[var(--tool-accent,#7c3aed)]"
              />
              Enabled (uncheck to disable this tool for this agent)
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" className={buttonClass}>
                {tool.has_override ? "Save override" : "Create override"}
              </button>
              {tool.has_override && (
                <ClearButton
                  agentId={agentId}
                  skillId={tool.skill_id}
                  toolName={tool.tool_name}
                  action={clearAction}
                />
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function ClearButton({
  agentId,
  skillId,
  toolName,
  action,
}: {
  agentId: string;
  skillId: string;
  toolName: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="agent_id" value={agentId} />
      <input type="hidden" name="skill_id" value={skillId} />
      <input type="hidden" name="tool_name" value={toolName} />
      <button type="submit" className={buttonGhostClass}>
        Clear override
      </button>
    </form>
  );
}
