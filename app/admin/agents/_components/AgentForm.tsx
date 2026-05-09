"use client";

import { useMemo, useState } from "react";

import {
  AGENT_MODELS,
  TIER_IDS,
  WORKSPACE_ROLES,
  type AgentAccessMode,
  type AgentKind,
  type AgentStatus,
  type AiAgentRow,
} from "../../_types";
import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

/**
 * Shared editor used by both `/admin/agents/new` and `/admin/agents/[id]`.
 *
 * Client-component so we can:
 *   - conditionally show access_tiers/access_roles based on access_mode
 *   - filter the allowed_tools list with a search box
 *   - keep the form posting to a real server-action via the action prop
 *
 * Defaults are passed in from the server. The hidden `id` field is set
 * from `mode` + `agent.id`. For the `create` mode the `id` is a real
 * editable input; for `edit` it's hidden.
 */
export type AgentFormMode = "create" | "edit";

export type AgentToolOption = {
  slug: string;
  title: string;
  domain: string;
  category: string;
};

export type AgentFormProps = {
  mode: AgentFormMode;
  action: (formData: FormData) => void;
  agent?: AiAgentRow | null;
  skillIds: string[];
  toolOptions: AgentToolOption[];
};

const DEFAULT_AGENT: Pick<
  AiAgentRow,
  | "display_name"
  | "description"
  | "kind"
  | "model"
  | "fast_model"
  | "system_prompt"
  | "greeting"
  | "temperature"
  | "max_tokens"
  | "status"
  | "access_mode"
  | "access_tiers"
  | "access_roles"
  | "allowlist_user_ids"
  | "allowed_skills"
  | "allowed_tools"
  | "icon"
  | "sort_order"
> = {
  display_name: "",
  description: "",
  kind: "tool-sidekick",
  model: "claude-opus-4-7",
  fast_model: "claude-haiku-4-5-20251001",
  system_prompt: "",
  greeting: "",
  temperature: 1.0,
  max_tokens: 4096,
  status: "draft",
  access_mode: "all",
  access_tiers: [],
  access_roles: [],
  allowlist_user_ids: [],
  allowed_skills: [],
  allowed_tools: [],
  icon: null,
  sort_order: 0,
};

const KIND_OPTIONS: { value: AgentKind; label: string; help: string }[] = [
  {
    value: "tool-sidekick",
    label: "Tool sidekick",
    help: "Bound to a specific app/tool",
  },
  { value: "chat", label: "Chat", help: "General-purpose conversation" },
  {
    value: "system",
    label: "System",
    help: "Background/internal — not picker-visible",
  },
];

const STATUS_OPTIONS: { value: AgentStatus; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "disabled", label: "Disabled" },
];

const ACCESS_OPTIONS: {
  value: AgentAccessMode;
  label: string;
  help: string;
}[] = [
  { value: "all", label: "All authenticated users", help: "Default" },
  {
    value: "tier",
    label: "By subscription tier",
    help: "Pick the tiers below",
  },
  {
    value: "workspace_role",
    label: "By workspace role",
    help: "Pick the roles below",
  },
  {
    value: "allowlist",
    label: "Allowlist (user UUIDs)",
    help: "One UUID per line",
  },
  { value: "admin_only", label: "Admins only", help: "Hidden from end users" },
];

export default function AgentForm({
  mode,
  action,
  agent,
  skillIds,
  toolOptions,
}: AgentFormProps) {
  const initial = agent ?? DEFAULT_AGENT;

  const [accessMode, setAccessMode] = useState<AgentAccessMode>(
    initial.access_mode
  );
  const [toolFilter, setToolFilter] = useState("");
  const [accessTiers, setAccessTiers] = useState<string[]>(
    Array.isArray(initial.access_tiers) ? [...initial.access_tiers] : []
  );
  const [accessRoles, setAccessRoles] = useState<string[]>(
    Array.isArray(initial.access_roles) ? [...initial.access_roles] : []
  );
  const [allowedSkills, setAllowedSkills] = useState<string[]>(
    Array.isArray(initial.allowed_skills) ? [...initial.allowed_skills] : []
  );
  const [allowedTools, setAllowedTools] = useState<string[]>(
    Array.isArray(initial.allowed_tools) ? [...initial.allowed_tools] : []
  );

  // Stable `Set` for fast lookups when rendering the tool list.
  const skillSet = useMemo(() => new Set(allowedSkills), [allowedSkills]);
  const toolSet = useMemo(() => new Set(allowedTools), [allowedTools]);
  const tierSet = useMemo(() => new Set(accessTiers), [accessTiers]);
  const roleSet = useMemo(() => new Set(accessRoles), [accessRoles]);

  const filteredTools = useMemo(() => {
    const q = toolFilter.trim().toLowerCase();
    if (!q) return toolOptions;
    return toolOptions.filter(
      (t) =>
        t.slug.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
  }, [toolFilter, toolOptions]);

  const toggle = (
    arr: string[],
    setter: (v: string[]) => void,
    value: string
  ) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const slugInputClass =
    inputClass + " font-mono text-xs disabled:opacity-60";

  return (
    <form action={action} className="space-y-6">
      {/* hidden id (for edit) or visible id input (for create) */}
      {mode === "edit" && agent && (
        <input type="hidden" name="id" value={agent.id} />
      )}

      {/* ── Identity ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Identity</h2>
          <p className="mt-0.5 text-xs text-muted">
            How users see and refer to this agent.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {mode === "create" ? (
            <Field label="ID (slug)" required>
              <input
                name="id"
                placeholder="my-agent"
                required
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                title="lowercase letters, digits, hyphens"
                className={slugInputClass}
              />
              <Hint>Lowercase letters, digits, hyphens. Cannot be changed.</Hint>
            </Field>
          ) : (
            <Field label="ID (slug)">
              <input
                value={agent?.id ?? ""}
                readOnly
                disabled
                className={slugInputClass}
              />
              <Hint>Immutable after creation.</Hint>
            </Field>
          )}

          <Field label="Display name" required>
            <input
              name="display_name"
              required
              defaultValue={initial.display_name}
              className={inputClass}
            />
          </Field>

          <Field label="Icon (emoji or path)" className="md:col-span-1">
            <input
              name="icon"
              defaultValue={initial.icon ?? ""}
              placeholder="e.g. 🤖 or /icons/agent.svg"
              className={inputClass}
            />
          </Field>

          <Field label="Sort order">
            <input
              type="number"
              name="sort_order"
              defaultValue={initial.sort_order}
              className={inputClass}
            />
            <Hint>Lower numbers come first in the picker.</Hint>
          </Field>
        </div>

        <Field label="Description">
          <textarea
            name="description"
            rows={2}
            defaultValue={initial.description}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          {KIND_OPTIONS.map((k) => (
            <label
              key={k.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                initial.kind === k.value
                  ? "border-tool-accent bg-tool-accent-soft"
                  : "border-app bg-app hover:border-tool-accent"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  defaultChecked={initial.kind === k.value}
                  className="accent-[var(--tool-accent,#7c3aed)]"
                />
                <span className="text-sm font-medium text-app">{k.label}</span>
              </span>
              <span className="text-[11px] text-muted">{k.help}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── Models ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Models</h2>
          <p className="mt-0.5 text-xs text-muted">
            Primary handles complex turns. Fast handles tight loops and
            classification.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary model">
            <select
              name="model"
              defaultValue={initial.model}
              className={inputClass}
            >
              {AGENT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.tier}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fast model">
            <select
              name="fast_model"
              defaultValue={initial.fast_model}
              className={inputClass}
            >
              {AGENT_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.tier}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Temperature">
            <input
              type="number"
              name="temperature"
              min={0}
              max={2}
              step={0.1}
              defaultValue={initial.temperature}
              className={inputClass}
            />
            <Hint>0 = deterministic, 2 = wild.</Hint>
          </Field>
          <Field label="Max tokens">
            <input
              type="number"
              name="max_tokens"
              min={1}
              max={200000}
              step={1}
              defaultValue={initial.max_tokens}
              className={inputClass}
            />
            <Hint>Cap on the model's response length.</Hint>
          </Field>
        </div>
      </section>

      {/* ── Prompt ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Prompt</h2>
          <p className="mt-0.5 text-xs text-muted">
            System prompt is prepended on every turn. Greeting is shown once
            when a user opens the agent.
          </p>
        </header>

        <Field label="System prompt">
          <textarea
            name="system_prompt"
            rows={10}
            defaultValue={initial.system_prompt}
            className={`${inputClass} font-mono text-xs`}
          />
        </Field>

        <Field label="Greeting">
          <textarea
            name="greeting"
            rows={3}
            defaultValue={initial.greeting}
            className={inputClass}
          />
        </Field>
      </section>

      {/* ── Capabilities ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Capabilities</h2>
          <p className="mt-0.5 text-xs text-muted">
            Skills are the tool families this agent can call. Tools (apps)
            below filter what the agent can act on.
          </p>
        </header>

        <Field label={`Allowed skills (${allowedSkills.length} selected)`}>
          {skillIds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
              No skill registry found. Edit
              <code className="mx-1 rounded bg-app-elevated px-1">
                lib/agent/skills/index.ts
              </code>
              to add skills.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {skillIds.map((id) => {
                const checked = skillSet.has(id);
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                      checked
                        ? "border-tool-accent bg-tool-accent-soft text-app"
                        : "border-app bg-app text-secondary hover:border-tool-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="allowed_skills"
                      value={id}
                      checked={checked}
                      onChange={() =>
                        toggle(allowedSkills, setAllowedSkills, id)
                      }
                      className="accent-[var(--tool-accent,#7c3aed)]"
                    />
                    <code className="font-mono text-xs">{id}</code>
                  </label>
                );
              })}
            </div>
          )}
        </Field>

        <Field label={`Allowed tools (${allowedTools.length} selected)`}>
          <div className="mb-2 flex items-center gap-2">
            <input
              type="search"
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Filter by slug, title, or category"
              className={`${inputClass} h-9`}
            />
            <button
              type="button"
              onClick={() => setAllowedTools([])}
              className={buttonGhostClass}
            >
              Clear
            </button>
          </div>
          {toolOptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
              No tools registered in <code>app_registry</code>.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-app bg-app">
              {filteredTools.length === 0 ? (
                <div className="p-3 text-xs text-faint">
                  No matches for &ldquo;{toolFilter}&rdquo;.
                </div>
              ) : (
                <ul className="divide-y divide-app">
                  {filteredTools.map((t) => {
                    const checked = toolSet.has(t.slug);
                    return (
                      <li key={t.slug}>
                        <label
                          className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                            checked ? "bg-tool-accent-soft" : "hover:bg-app-elevated"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              name="allowed_tools"
                              value={t.slug}
                              checked={checked}
                              onChange={() =>
                                toggle(allowedTools, setAllowedTools, t.slug)
                              }
                              className="accent-[var(--tool-accent,#7c3aed)]"
                            />
                            <span className="min-w-0 truncate text-app">
                              {t.title}
                            </span>
                            <code className="truncate font-mono text-[11px] text-muted">
                              {t.slug}
                            </code>
                          </span>
                          <span className="shrink-0 text-[11px] text-faint">
                            {t.domain}
                            {t.category ? ` · ${t.category}` : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Field>
      </section>

      {/* ── Status & Access ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Status & access</h2>
          <p className="mt-0.5 text-xs text-muted">
            Drafts are admin-visible only. Live agents check the access rules
            below for end users.
          </p>
        </header>

        <Field label="Status">
          <select
            name="status"
            defaultValue={initial.status}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Access mode">
          <select
            name="access_mode"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value as AgentAccessMode)}
            className={inputClass}
          >
            {ACCESS_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <Hint>
            {ACCESS_OPTIONS.find((a) => a.value === accessMode)?.help}
          </Hint>
        </Field>

        {accessMode === "tier" && (
          <Field label="Allowed tiers">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIER_IDS.map((t) => {
                const checked = tierSet.has(t);
                return (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                      checked
                        ? "border-tool-accent bg-tool-accent-soft text-app"
                        : "border-app bg-app text-secondary hover:border-tool-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="access_tiers"
                      value={t}
                      checked={checked}
                      onChange={() => toggle(accessTiers, setAccessTiers, t)}
                      className="accent-[var(--tool-accent,#7c3aed)]"
                    />
                    <span className="capitalize">{t}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        {accessMode === "workspace_role" && (
          <Field label="Allowed workspace roles">
            <div className="grid grid-cols-3 gap-2">
              {WORKSPACE_ROLES.map((r) => {
                const checked = roleSet.has(r);
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                      checked
                        ? "border-tool-accent bg-tool-accent-soft text-app"
                        : "border-app bg-app text-secondary hover:border-tool-accent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="access_roles"
                      value={r}
                      checked={checked}
                      onChange={() => toggle(accessRoles, setAccessRoles, r)}
                      className="accent-[var(--tool-accent,#7c3aed)]"
                    />
                    <span className="capitalize">{r}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        <Field label="Allowlist user IDs">
          <textarea
            name="allowlist_user_ids"
            rows={4}
            defaultValue={(initial.allowlist_user_ids ?? []).join("\n")}
            placeholder="One UUID per line"
            className={`${inputClass} font-mono text-xs`}
          />
          <Hint>
            Used when access_mode = allowlist. Also acts as a per-user override
            in some flows.
          </Hint>
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t border-app bg-app/80 px-2 py-3 backdrop-blur">
        <button type="submit" className={buttonClass}>
          {mode === "create" ? "Create agent" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-muted">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-faint">{children}</span>;
}
