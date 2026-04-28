"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * TemplatePicker — Settings → Template tab.
 *
 * 2-column grid of template cards. Each card shows: name, description,
 * a "Current" badge if applied, an "Auto-applied for: …" line if the
 * template auto-matches one of the registered profession ids, and an
 * Apply button. Apply opens a confirm modal that explains the overlay
 * semantics (additive — never deletes user data) before firing the
 * apply API.
 *
 * Errors surface inline below the grid so the user sees them without
 * leaving the picker. Loading state shows a faint placeholder bar.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspaces/client";
import type { CrmTemplate } from "../_templates/types";
import { useCrmTemplate } from "./useCrmTemplate";

const MAX_PROF_PREVIEW = 4;

interface ConfirmState {
  template: CrmTemplate;
}

export default function TemplatePicker() {
  const { current: workspace } = useWorkspace();
  const wsId = workspace.kind === "team" ? workspace.id : "";
  const { current, setCurrent, applying, available, hydrated } =
    useCrmTemplate(wsId);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sortedTemplates = useMemo(() => {
    // "Current" first, then registry order.
    return [...available].sort((a, b) => {
      if (a.id === current && b.id !== current) return -1;
      if (b.id === current && a.id !== current) return 1;
      return 0;
    });
  }, [available, current]);

  const onApply = async (id: string) => {
    setErr(null);
    try {
      await setCurrent(id);
      setConfirm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to apply template");
    }
  };

  if (!wsId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-app p-6">
        <div className="w-full max-w-md rounded-xl border border-app bg-app-elevated p-6">
          <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.template
          </div>
          <h2 className="mt-2 text-lg font-semibold text-app">Workspace required</h2>
          <p className="mt-2 text-sm text-secondary">
            Select a team workspace to apply or switch CRM templates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-app">
      <header className="border-b border-app bg-app-elevated px-5 py-4">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.template
        </div>
        <h2 className="mt-1 text-base font-semibold text-app">
          Industry templates
        </h2>
        <p className="mt-1 text-xs text-secondary">
          Templates pre-configure pipelines, custom fields, and tags. Applying a
          template adds to your workspace; it never deletes anything you&apos;ve
          already created.
        </p>
      </header>

      {!hydrated && (
        <div className="px-5 py-4 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
          loading…
        </div>
      )}

      {err && (
        <div
          role="alert"
          className="mx-5 mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-500"
        >
          {err}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3 p-5 md:grid-cols-2">
        {sortedTemplates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            isCurrent={tpl.id === current}
            onApply={() => setConfirm({ template: tpl })}
            disabled={applying}
          />
        ))}
      </div>

      {confirm && (
        <ConfirmModal
          template={confirm.template}
          isCurrent={confirm.template.id === current}
          applying={applying}
          onCancel={() => setConfirm(null)}
          onConfirm={() => onApply(confirm.template.id)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isCurrent,
  onApply,
  disabled,
}: {
  template: CrmTemplate;
  isCurrent: boolean;
  onApply: () => void;
  disabled: boolean;
}) {
  const profPreview = template.matchProfessions.slice(0, MAX_PROF_PREVIEW);
  const profMore = template.matchProfessions.length - profPreview.length;

  return (
    <div
      className={`flex h-full flex-col rounded-xl border p-4 transition-colors ${
        isCurrent
          ? "border-tool-accent bg-tool-accent-soft"
          : "border-app bg-app-elevated"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-app">{template.name}</h3>
          <p className="mt-1 text-xs leading-relaxed text-secondary">
            {template.description}
          </p>
        </div>
        {isCurrent && (
          <span className="shrink-0 rounded-full border border-tool-accent bg-app-elevated px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
            Current
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-[0.65rem]">
        <Stat label="Pipelines" value={template.pipelines.length} />
        <Stat label="Fields" value={template.customFields.length} />
        <Stat label="Tags" value={template.tags.length} />
      </dl>

      {profPreview.length > 0 && (
        <div className="mt-3 text-[0.65rem] text-muted">
          <span className="text-faint">Auto-applied for:</span>{" "}
          <span className="text-secondary">
            {profPreview.join(", ")}
            {profMore > 0 ? ` +${profMore}` : ""}
          </span>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className={`rounded-md px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity ${
            isCurrent
              ? "border border-app bg-app-elevated text-secondary hover:text-app"
              : "bg-tool-accent hover:opacity-90"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          style={!isCurrent ? { color: "var(--bg)" } : undefined}
        >
          {isCurrent ? "Re-apply" : "Apply"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-app bg-app px-2 py-1.5">
      <dt className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-app">{value}</dd>
    </div>
  );
}

function ConfirmModal({
  template,
  isCurrent,
  applying,
  onCancel,
  onConfirm,
}: {
  template: CrmTemplate;
  isCurrent: boolean;
  applying: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Confirm template apply"
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-app bg-app-elevated p-5 shadow-2xl">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          crm.template.apply
        </div>
        <h3 className="mt-1 text-base font-semibold text-app">
          {isCurrent ? "Re-apply" : "Apply"} the {template.name} template?
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          Applying the {template.name} template will add its pipelines, custom
          fields, and tags to this workspace. It won&apos;t delete anything
          you&apos;ve already created.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={applying}
            className="rounded-md border border-app bg-app px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary hover:text-app"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={applying}
            className="rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--bg)" }}
          >
            {applying ? "Applying…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
