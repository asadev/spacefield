"use client";

import { useMemo, useState } from "react";

import {
  WORKSPACE_ROLES,
  type AiSkillRow,
  type SkillKind,
  type SkillStatus,
  type SkillToolDef,
  type WorkspaceRole,
} from "../../_types";
import ToolEditor from "./ToolEditor";
import { buttonClass, inputClass } from "./_styles";

/**
 * Shared editor used by both `/admin/skills/new` and `/admin/skills/[id]`.
 *
 * For `kind='code'` skills the tools list is read-only context — the
 * actual handlers live in TS at `handler_module`. For `kind='custom'`
 * skills the admin can add/edit/remove individual tools and the runtime
 * dispatches each tool to its `handler_target` (RPC name or HTTP URL).
 *
 * The tools_json field is serialized through a hidden input on submit;
 * the visible tools UI mutates a local React state.
 */

export type SkillFormMode = "create" | "edit";

export type SkillFormProps = {
  mode: SkillFormMode;
  action: (formData: FormData) => void;
  skill?: AiSkillRow | null;
  /** Locked when editing a code skill — admins cannot create code skills here. */
  forceKind?: SkillKind;
};

const DEFAULT_SKILL: Pick<
  AiSkillRow,
  | "id"
  | "kind"
  | "display_name"
  | "description"
  | "system_fragment"
  | "status"
  | "handler_module"
  | "tools_json"
  | "allowed_workspace_roles"
  | "requires_confirmation_default"
  | "category"
  | "icon"
  | "sort_order"
> = {
  id: "",
  kind: "custom",
  display_name: "",
  description: "",
  system_fragment: "",
  status: "draft",
  handler_module: null,
  tools_json: [],
  allowed_workspace_roles: ["owner", "admin", "member"],
  requires_confirmation_default: false,
  category: "general",
  icon: null,
  sort_order: 0,
};

const STATUS_OPTIONS: { value: SkillStatus; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "disabled", label: "Disabled" },
];

const COMMON_CATEGORIES = [
  "workspace",
  "crm",
  "files",
  "boards",
  "apps",
  "meta",
  "marketing",
  "billing",
  "general",
];

export default function SkillForm({
  mode,
  action,
  skill,
  forceKind,
}: SkillFormProps) {
  const initial = skill ?? DEFAULT_SKILL;
  const isCodeSkill =
    (forceKind ?? initial.kind) === "code" && mode === "edit";

  const [allowedRoles, setAllowedRoles] = useState<WorkspaceRole[]>(
    Array.isArray(initial.allowed_workspace_roles)
      ? [...initial.allowed_workspace_roles]
      : ["owner", "admin", "member"]
  );
  const [tools, setTools] = useState<SkillToolDef[]>(
    Array.isArray(initial.tools_json) ? [...initial.tools_json] : []
  );

  const roleSet = useMemo(() => new Set(allowedRoles), [allowedRoles]);

  const toggleRole = (role: WorkspaceRole) => {
    setAllowedRoles(
      allowedRoles.includes(role)
        ? allowedRoles.filter((r) => r !== role)
        : [...allowedRoles, role]
    );
  };

  const slugInputClass =
    inputClass + " font-mono text-xs disabled:opacity-60";

  return (
    <form action={action} className="space-y-6">
      {mode === "edit" && skill && (
        <input type="hidden" name="id" value={skill.id} />
      )}

      {/* Locked kind sent for create+custom; edit posts whatever the row already is. */}
      {mode === "create" && (
        <input type="hidden" name="kind" value={forceKind ?? "custom"} />
      )}

      {/* Tools_json serialized — hidden field always present. */}
      <input
        type="hidden"
        name="tools_json"
        value={JSON.stringify(tools)}
      />

      {/* ── Identity ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Identity</h2>
          <p className="mt-0.5 text-xs text-muted">
            How the skill appears to admins and the agent runtime.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {mode === "create" ? (
            <Field label="ID (slug)" required>
              <input
                name="id"
                placeholder="my.skill"
                required
                pattern="[a-z0-9][a-z0-9._-]*"
                title="lowercase letters, digits, dots, underscores, hyphens"
                className={slugInputClass}
              />
              <Hint>
                Lowercase letters, digits, dots, underscores, hyphens.
                Cannot be changed.
              </Hint>
            </Field>
          ) : (
            <Field label="ID (slug)">
              <input
                value={skill?.id ?? ""}
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

          <Field label="Category">
            <input
              name="category"
              defaultValue={initial.category}
              list="skill-category-options"
              className={inputClass}
            />
            <datalist id="skill-category-options">
              {COMMON_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Hint>Used to group skills in the picker.</Hint>
          </Field>

          <Field label="Sort order">
            <input
              type="number"
              name="sort_order"
              defaultValue={initial.sort_order}
              className={inputClass}
            />
            <Hint>Lower comes first.</Hint>
          </Field>

          <Field label="Icon (emoji or path)">
            <input
              name="icon"
              defaultValue={initial.icon ?? ""}
              placeholder="e.g. 🛠 or /icons/skill.svg"
              className={inputClass}
            />
          </Field>

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
        </div>

        <Field label="Description">
          <textarea
            name="description"
            rows={2}
            defaultValue={initial.description}
            placeholder="Short blurb shown to admins and in skill catalog."
            className={inputClass}
          />
        </Field>
      </section>

      {/* ── Prompt fragment ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">System fragment</h2>
          <p className="mt-0.5 text-xs text-muted">
            Appended to the executor/orchestrator system prompt when this
            skill is in scope. Tell the model what it can and can&apos;t do
            with these tools.
          </p>
        </header>
        <Field label="System fragment (model-facing)">
          <textarea
            name="system_fragment"
            rows={8}
            defaultValue={initial.system_fragment}
            placeholder="You can manage X. Use list_x before mutate_x."
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
          <Hint>
            Keep it imperative and short. The runtime concatenates fragments
            from every active skill.
          </Hint>
        </Field>
      </section>

      {/* ── Access ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Access & safety</h2>
          <p className="mt-0.5 text-xs text-muted">
            Per-skill role gate and confirmation defaults. Per-tool
            <code className="mx-1 font-mono">required_role</code> still
            applies on top of these for individual tools.
          </p>
        </header>

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
                    name="allowed_workspace_roles"
                    value={r}
                    checked={checked}
                    onChange={() => toggleRole(r)}
                    className="accent-[var(--tool-accent,#7c3aed)]"
                  />
                  <span className="capitalize">{r}</span>
                </label>
              );
            })}
          </div>
          <Hint>
            Must include at least one role for the skill to be reachable.
          </Hint>
        </Field>

        <Field label="Confirmation">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-app">
            <input
              type="checkbox"
              name="requires_confirmation_default"
              defaultChecked={initial.requires_confirmation_default}
              className="accent-[var(--tool-accent,#7c3aed)]"
            />
            <span>
              Require user confirmation before any tool in this skill runs.
            </span>
          </label>
          <Hint>
            Per-tool <code className="font-mono">requires_confirmation</code>
            {" "}
            still wins when set; this is the default fallback.
          </Hint>
        </Field>
      </section>

      {/* ── Handler module (code skills only) ─────────────────────────── */}
      {isCodeSkill && (
        <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
          <header>
            <h2 className="text-sm font-semibold text-app">Handler module</h2>
            <p className="mt-0.5 text-xs text-muted">
              Path to the TypeScript module exporting this skill&apos;s
              definition. Read-only — code-defined skills are wired in via
              the runtime imports, not the admin panel.
            </p>
          </header>
          <Field label="Module path">
            <input
              value={initial.handler_module ?? ""}
              readOnly
              disabled
              className={slugInputClass}
            />
          </Field>
        </section>
      )}

      {/* ── Tools ─────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">
            Tools{" "}
            <span className="ml-1 text-[11px] font-normal text-muted">
              ({tools.length})
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {isCodeSkill
              ? "Code skill — tool list is fixed in the source module. Shown here for context only."
              : "Custom skill — define each tool the agent can call. Each tool dispatches to an RPC or HTTP URL with the validated input."}
          </p>
        </header>

        <ToolEditor
          tools={tools}
          onChange={setTools}
          readOnly={isCodeSkill}
        />
      </section>

      <div className="sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t border-app bg-app/80 px-2 py-3 backdrop-blur">
        <button type="submit" className={buttonClass}>
          {mode === "create" ? "Create skill" : "Save changes"}
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
