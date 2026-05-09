import type { AgentToolOverrideRow } from "../../_types";
import { clearToolOverride, setToolOverride } from "../_actions";

/**
 * Server component. Renders a side-by-side table of every source-defined
 * tool for a code skill alongside its current global override (if any).
 * Each row submits its own form to setToolOverride / clearToolOverride
 * so admins can tweak description/read-only/confirmation without
 * editing source.
 *
 * Custom skills already have a full editor (ToolEditor.tsx) so this
 * panel is only meaningful for kind='code' skills — the parent page
 * decides whether to render us.
 */

type SourceTool = {
  name: string;
  description: string;
  read_only: boolean;
  required_role?: string;
};

export type ToolOverridesPanelProps = {
  skillId: string;
  /** Tools as defined in the TS source — read-only references. */
  sourceTools: SourceTool[];
  /** Override rows currently applied for this skill at the global scope. */
  overrides: AgentToolOverrideRow[];
};

export default function ToolOverridesPanel({
  skillId,
  sourceTools,
  overrides,
}: ToolOverridesPanelProps) {
  const overrideByName = new Map(overrides.map((o) => [o.tool_name, o]));

  if (sourceTools.length === 0) {
    return (
      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <header>
          <h2 className="text-sm font-semibold text-app">Tool overrides</h2>
          <p className="mt-0.5 text-xs text-muted">
            No tools are defined in the source registry for this skill.
            Either it&apos;s not statically wired (in which case the
            runtime treats it as custom), or the registry returned an
            empty list.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      <header>
        <h2 className="text-sm font-semibold text-app">
          Tool overrides{" "}
          <span className="ml-1 text-[11px] font-normal text-muted">
            ({sourceTools.length} source · {overrides.length} overridden)
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Code skills are locked to their source for tool implementation,
          but you can override the description, mark a tool read-only at
          runtime, or force user confirmation. Per-agent overrides win
          over these globals.
        </p>
      </header>

      <div className="space-y-3">
        {sourceTools.map((t) => {
          const ov = overrideByName.get(t.name) ?? null;
          return (
            <ToolOverrideRow
              key={t.name}
              skillId={skillId}
              tool={t}
              override={ov}
            />
          );
        })}
      </div>
    </section>
  );
}

function ToolOverrideRow({
  skillId,
  tool,
  override,
}: {
  skillId: string;
  tool: SourceTool;
  override: AgentToolOverrideRow | null;
}) {
  const effectiveDescription =
    override?.override_description ?? tool.description;
  const effectiveReadOnly =
    override?.read_only_override ?? tool.read_only;
  const effectiveConfirms =
    override?.requires_confirmation_override ?? false;

  const hasOverride =
    !!override &&
    (override.override_description != null ||
      override.read_only_override != null ||
      override.requires_confirmation_override != null ||
      override.enabled === false);

  return (
    <details
      className={`rounded-lg border ${
        hasOverride
          ? "border-tool-accent/40 bg-tool-accent-soft/40"
          : "border-app bg-app"
      }`}
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-xs text-app">
            {tool.name}
          </code>
          {effectiveReadOnly && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
              read-only
            </span>
          )}
          {effectiveConfirms && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              confirms
            </span>
          )}
          {hasOverride && (
            <span className="rounded-full bg-tool-accent/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
              overridden
            </span>
          )}
          {tool.required_role && (
            <span className="rounded-full bg-app-elevated px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-secondary">
              role: {tool.required_role}
            </span>
          )}
        </div>
        <span className="text-[11px] text-faint">expand</span>
      </summary>

      <div className="space-y-3 border-t border-app px-3 py-3">
        <div className="grid gap-3 md:grid-cols-2">
          {/* Source side */}
          <div className="rounded-lg border border-app bg-app p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              From source
            </div>
            <dl className="mt-2 space-y-1.5 text-xs">
              <Row label="description">
                <span className="text-secondary">
                  {tool.description || (
                    <span className="text-faint">(none)</span>
                  )}
                </span>
              </Row>
              <Row label="read_only">
                <code className="font-mono text-app">
                  {String(tool.read_only)}
                </code>
              </Row>
              <Row label="required_role">
                <code className="font-mono text-secondary">
                  {tool.required_role ?? "member"}
                </code>
              </Row>
            </dl>
          </div>

          {/* Override side */}
          <div className="rounded-lg border border-tool-accent/40 bg-tool-accent-soft p-3">
            <div className="text-[10px] uppercase tracking-wider text-tool-accent">
              Global override (effective at runtime)
            </div>
            <dl className="mt-2 space-y-1.5 text-xs">
              <Row label="description">
                {override?.override_description ? (
                  <span className="text-app">
                    {override.override_description}
                  </span>
                ) : (
                  <span className="text-faint">unset → {tool.description}</span>
                )}
              </Row>
              <Row label="read_only_override">
                {override?.read_only_override == null ? (
                  <span className="text-faint">unset</span>
                ) : (
                  <code className="font-mono text-app">
                    {String(override.read_only_override)}
                  </code>
                )}
              </Row>
              <Row label="requires_confirmation_override">
                {override?.requires_confirmation_override == null ? (
                  <span className="text-faint">unset</span>
                ) : (
                  <code className="font-mono text-app">
                    {String(override.requires_confirmation_override)}
                  </code>
                )}
              </Row>
              <Row label="enabled">
                <code className="font-mono text-app">
                  {String(override?.enabled ?? true)}
                </code>
              </Row>
            </dl>
          </div>
        </div>

        {/* Edit form */}
        <form
          action={setToolOverride}
          className="space-y-3 rounded-lg border border-app bg-app p-3"
        >
          <input type="hidden" name="skill_id" value={skillId} />
          <input type="hidden" name="tool_name" value={tool.name} />
          <div className="text-[10px] uppercase tracking-wider text-muted">
            Edit override
          </div>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Override description (blank = inherit source)
            </span>
            <textarea
              name="override_description"
              rows={2}
              defaultValue={override?.override_description ?? ""}
              placeholder={tool.description}
              className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] uppercase tracking-wider text-muted">
                read_only_override
              </span>
              <select
                name="read_only_override"
                defaultValue={
                  override?.read_only_override == null
                    ? ""
                    : String(override.read_only_override)
                }
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
              >
                <option value="">inherit ({String(tool.read_only)})</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] uppercase tracking-wider text-muted">
                requires_confirmation_override
              </span>
              <select
                name="requires_confirmation_override"
                defaultValue={
                  override?.requires_confirmation_override == null
                    ? ""
                    : String(override.requires_confirmation_override)
                }
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
              >
                <option value="">inherit (false)</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-[11px] uppercase tracking-wider text-muted">
                enabled
              </span>
              <select
                name="enabled"
                defaultValue={String(override?.enabled ?? true)}
                className="w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent"
              >
                <option value="true">true (default)</option>
                <option value="false">false (hide tool from runtime)</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {hasOverride && (
              <button
                type="submit"
                formAction={clearToolOverride}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
              >
                Clear override
              </button>
            )}
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              Save override
            </button>
          </div>
        </form>

        {/* Effective preview */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-emerald-500">
            What the runtime actually uses
          </div>
          <dl className="mt-2 space-y-1.5">
            <Row label="description">
              <span className="text-app">{effectiveDescription}</span>
            </Row>
            <Row label="read_only">
              <code className="font-mono text-app">
                {String(effectiveReadOnly)}
              </code>
            </Row>
            <Row label="confirms">
              <code className="font-mono text-app">
                {String(effectiveConfirms)}
              </code>
            </Row>
          </dl>
        </div>
      </div>
    </details>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-44 shrink-0 text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
