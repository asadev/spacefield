"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Lead Capture Form Builder — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Receives NativeAppProps from the workspace Window. No ToolShell, AuthGate,
   PageHeader, back-links, ToolRecommendations, Suspense, or bespoke macOS
   chrome. Width-driven layout: the 3-rail builder canvas (palette · canvas
   · export) collapses to a single column below 900px. All field-builder
   logic, presets, conditional logic, multi-step preview, HTML/JSON export,
   localStorage hydration, and conversion-estimate heuristic preserved
   verbatim from page.tsx.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import { FORM_PRESETS, type PresetField } from "./presets";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

type FieldType = "text" | "email" | "phone" | "select" | "checkbox" | "textarea";

interface FormField {
  id: string;
  type: FieldType;
  label: string;
  name: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  showIf?: { name: string; equals: string };
  step?: number;
}

interface FormDef {
  id: string;
  name: string;
  fields: FormField[];
  submitLabel: string;
  action: string;
  multiStep?: boolean;
  tracking?: boolean;
}

const LS_KEY = "solutions:lead-capture-form-builder:v2";
const LEGACY_LS_KEY = "solutions:lead-capture-form-builder:v1";
const MODE_LS_KEY = "solutions:lead-capture-form-builder:mode:v1";
const uid = () => Math.random().toString(36).slice(2, 9);

const FIELD_TYPES: FieldType[] = [
  "text",
  "email",
  "phone",
  "select",
  "checkbox",
  "textarea",
];

const FIELD_TYPE_GLYPH: Record<FieldType, string> = {
  text: "Aa",
  email: "@",
  phone: "Tel",
  select: "▾",
  checkbox: "☑",
  textarea: "¶",
};

function defaultForm(): FormDef {
  return {
    id: uid(),
    name: "Lead form",
    submitLabel: "Request info",
    action: "https://your-endpoint.example.com/leads",
    multiStep: false,
    tracking: false,
    fields: [
      { id: uid(), type: "text", label: "Full name", name: "name", required: true, placeholder: "Jane Doe" },
      { id: uid(), type: "email", label: "Work email", name: "email", required: true, placeholder: "you@company.com" },
      {
        id: uid(),
        type: "select",
        label: "Company size",
        name: "company_size",
        required: false,
        options: ["1-10", "11-50", "51-200", "200+"],
      },
      {
        id: uid(),
        type: "textarea",
        label: "What are you trying to solve?",
        name: "message",
        required: false,
      },
    ],
  };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fromPreset(key: string): FormDef | null {
  const p = FORM_PRESETS.find((x) => x.key === key);
  if (!p) return null;
  return {
    id: uid(),
    name: p.name,
    action: p.action,
    submitLabel: p.submitLabel,
    multiStep: !!p.multiStep,
    tracking: false,
    fields: p.fields.map((f: PresetField) => ({
      id: uid(),
      type: f.type,
      label: f.label,
      name: f.name,
      required: f.required,
      placeholder: f.placeholder,
      options: f.options,
      showIf: f.showIf,
      step: f.step,
    })),
  };
}

function toHtml(form: FormDef): string {
  const parts = [
    `<form action="${form.action}" method="POST" class="lead-form">`,
  ];
  if (form.tracking) {
    parts.push(
      `  <!-- Event tracking: fires on submit. Replace with your analytics call. -->`
    );
  }
  form.fields.forEach((f) => {
    const req = f.required ? " required" : "";
    const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : "";
    const cond = f.showIf
      ? ` data-show-if="${f.showIf.name}" data-show-if-value="${f.showIf.equals}"`
      : "";
    const stepAttr = f.step ? ` data-step="${f.step}"` : "";
    parts.push(`  <label${cond}${stepAttr}>\n    <span>${f.label}</span>`);
    if (f.type === "textarea") {
      parts.push(`    <textarea name="${f.name}"${req}${ph}></textarea>`);
    } else if (f.type === "select") {
      parts.push(`    <select name="${f.name}"${req}>`);
      parts.push(`      <option value="">Choose…</option>`);
      (f.options || []).forEach((o) => {
        parts.push(`      <option value="${o}">${o}</option>`);
      });
      parts.push(`    </select>`);
    } else if (f.type === "checkbox") {
      parts.push(`    <input type="checkbox" name="${f.name}"${req} />`);
    } else {
      const t =
        f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
      parts.push(`    <input type="${t}" name="${f.name}"${req}${ph} />`);
    }
    parts.push(`  </label>`);
  });
  parts.push(
    `  <button type="submit">${form.submitLabel}</button>\n</form>`
  );
  if (form.tracking) {
    parts.push(
      ``,
      `<script>`,
      `  // Drop-in tracking snippet — replace window.analytics.track with your tool.`,
      `  document.querySelector('.lead-form')?.addEventListener('submit', (e) => {`,
      `    const data = Object.fromEntries(new FormData(e.currentTarget));`,
      `    try {`,
      `      window.analytics?.track?.('Lead form submitted', {`,
      `        form_name: ${JSON.stringify(form.name)},`,
      `        action: ${JSON.stringify(form.action)},`,
      `        fields: Object.keys(data),`,
      `      });`,
      `    } catch {}`,
      `  });`,
      `  // Conditional logic: hide fields whose data-show-if doesn't match.`,
      `  const form = document.querySelector('.lead-form');`,
      `  const updateConditional = () => {`,
      `    const current = Object.fromEntries(new FormData(form));`,
      `    form.querySelectorAll('[data-show-if]').forEach((el) => {`,
      `      const key = el.getAttribute('data-show-if');`,
      `      const val = el.getAttribute('data-show-if-value');`,
      `      el.style.display = (current[key] === val) ? '' : 'none';`,
      `    });`,
      `  };`,
      `  form?.addEventListener('change', updateConditional);`,
      `  updateConditional();`,
      `</script>`
    );
  }
  return parts.join("\n");
}

function toSchema(form: FormDef): string {
  return JSON.stringify(
    {
      name: form.name,
      action: form.action,
      submitLabel: form.submitLabel,
      multiStep: form.multiStep,
      tracking: form.tracking,
      fields: form.fields.map((f) => ({
        type: f.type,
        label: f.label,
        name: f.name,
        required: f.required,
        placeholder: f.placeholder,
        options: f.options,
        showIf: f.showIf,
        step: f.step,
      })),
    },
    null,
    2
  );
}

type TabKey = "build" | "preview" | "embed";

export default function LeadCaptureFormBuilderApp(props: NativeAppProps) {
  const { width } = props;

  // Width-driven breakpoint — 3-rail builder canvas collapses to single
  // column below 900px. Top stat strip drops to 2-column below 640px.
  const isWide = width >= 900;
  const isCompact = width < 640;

  const [form, setForm] = useState<FormDef>(defaultForm());
  const [exportMode, setExportMode] = useState<"html" | "json">("html");
  const [mode, setMode] = useState<TabKey>("build");
  const [hydrated, setHydrated] = useState(false);
  const [previewStep, setPreviewStep] = useState(1);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(LS_KEY) || localStorage.getItem(LEGACY_LS_KEY);
      if (raw) setForm({ ...defaultForm(), ...(JSON.parse(raw) as FormDef) });
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "build" || m === "preview" || m === "embed") setMode(m as TabKey);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(form));
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [form, mode, hydrated]);

  const addField = (type: FieldType) => {
    const label = type[0].toUpperCase() + type.slice(1);
    const f: FormField = {
      id: uid(),
      type,
      label,
      name: slugify(label),
      required: false,
      options: type === "select" ? ["Option 1", "Option 2"] : undefined,
    };
    setForm((s) => ({ ...s, fields: [...s.fields, f] }));
  };

  const updateField = (id: string, patch: Partial<FormField>) =>
    setForm((s) => ({
      ...s,
      fields: s.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const removeField = (id: string) =>
    setForm((s) => ({ ...s, fields: s.fields.filter((f) => f.id !== id) }));

  const move = (id: string, dir: -1 | 1) => {
    setForm((s) => {
      const idx = s.fields.findIndex((f) => f.id === id);
      if (idx < 0) return s;
      const to = idx + dir;
      if (to < 0 || to >= s.fields.length) return s;
      const next = s.fields.slice();
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return { ...s, fields: next };
    });
  };

  const loadPreset = (key: string) => {
    const next = fromPreset(key);
    if (next) {
      setForm(next);
      setPreviewStep(1);
      setPreviewAnswers({});
    }
  };

  const output = useMemo(
    () => (exportMode === "html" ? toHtml(form) : toSchema(form)),
    [form, exportMode]
  );

  const copy = () => {
    navigator.clipboard?.writeText(output);
  };

  const visibleFieldsForStep = useMemo(() => {
    return form.fields.filter((f) => {
      if (form.multiStep) {
        const step = f.step || 1;
        if (step !== previewStep) return false;
      }
      if (f.showIf) {
        const v = previewAnswers[f.showIf.name];
        if (v !== f.showIf.equals) return false;
      }
      return true;
    });
  }, [form, previewStep, previewAnswers]);

  const totalSteps = form.multiStep
    ? Math.max(1, ...form.fields.map((f) => f.step || 1))
    : 1;

  const fieldNames = useMemo(
    () => form.fields.map((f) => f.name),
    [form.fields]
  );

  const requiredCount = form.fields.filter((f) => f.required).length;
  const conversionEstimate = Math.max(
    4,
    Math.min(38, Math.round(34 - requiredCount * 3 - (form.multiStep ? -2 : 0)))
  );

  const highlightedHtml = useMemo(() => {
    if (exportMode !== "html") return null;
    return output;
  }, [output, exportMode]);

  // 3-rail grid template — full grid above 900px, single column below.
  const builderGridStyle: React.CSSProperties = isWide
    ? { display: "grid", gap: "1.5rem", gridTemplateColumns: "220px 1fr 320px" }
    : { display: "grid", gap: "1.5rem", gridTemplateColumns: "1fr" };

  const statGridCols = isCompact ? 2 : 5;

  return (
    <div
      data-tool-theme="marketing"
      data-tool="lead-capture-form-builder"
      className="h-full w-full overflow-auto bg-app text-app"
    >
      <div className={isCompact ? "px-3 py-4" : "px-5 py-5"}>
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              form
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {form.fields.length}f · {requiredCount}req
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              forms.lead-capture
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(form.name || "untitled").toLowerCase().replace(/\s+/g, "-")}.form
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {hydrated ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Lead capture · Form builder canvas
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {form.multiStep ? `${totalSteps}-step` : "single page"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    tracking {form.tracking ? "on" : "off"}
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {exportMode.toUpperCase()} export
                  </span>
                </div>

                <div className="mt-3">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Untitled form"
                    className={`w-full bg-transparent font-semibold tracking-tight text-app placeholder:text-faint outline-none ${
                      isCompact ? "text-xl" : "text-2xl md:text-3xl"
                    }`}
                  />
                </div>
              </div>

              {/* conversion dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${conversionEstimate * 2.5}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {conversionEstimate}%
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Est. CVR
                  </div>
                  <div className="text-sm font-semibold text-app">
                    ~{conversionEstimate}% / friction {requiredCount}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "build", label: "Build" },
                  { k: "preview", label: "Preview" },
                  { k: "embed", label: "Embed" },
                ] as { k: TabKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              onChange={(e) => {
                if (e.target.value) loadPreset(e.target.value);
                e.target.value = "";
              }}
              className="rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary outline-none transition-colors hover:border-tool-accent"
              defaultValue=""
            >
              <option value="" disabled>
                Load template…
              </option>
              {FORM_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                  {p.source ? ` — ${p.source}` : ""}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={copy}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy snippet
              </button>
            </div>
          </div>
        </section>

        <div
          className="mb-6 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${statGridCols}, minmax(0, 1fr))` }}
        >
          <Stat label="Fields" value={String(form.fields.length)} accent />
          <Stat label="Required" value={String(requiredCount)} />
          <Stat label="Steps" value={form.multiStep ? String(totalSteps) : "1"} />
          <Stat
            label="Conditional"
            value={String(form.fields.filter((f) => f.showIf).length)}
          />
          <Stat label="Output" value={exportMode.toUpperCase()} />
        </div>

        {mode === "preview" && (
          <ToolCard title="Live preview" subtitle="What visitors see">
            <div className="rounded-xl border border-app bg-app-elevated p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-tool-accent" />
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    {form.name || "Lead form"}
                  </div>
                </div>
                {form.multiStep && (
                  <div className="flex items-center gap-2 text-xs text-secondary">
                    <button
                      disabled={previewStep <= 1}
                      onClick={() => setPreviewStep((s) => s - 1)}
                      className="rounded-lg border border-app bg-app-elevated px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                    >
                      ←
                    </button>
                    <span className="font-mono">
                      Step {previewStep} of {totalSteps}
                    </span>
                    <button
                      disabled={previewStep >= totalSteps}
                      onClick={() => setPreviewStep((s) => s + 1)}
                      className="rounded-lg border border-app bg-app-elevated px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                {visibleFieldsForStep.length === 0 && (
                  <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                    No visible fields for this step.
                  </div>
                )}
                {visibleFieldsForStep.map((f) => (
                  <div key={f.id}>
                    <label className="block text-sm text-secondary">
                      <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                        {f.label}
                        {f.required && (
                          <span className="text-tool-accent"> *</span>
                        )}
                      </span>
                      {f.type === "textarea" ? (
                        <textarea
                          className={inputCls("min-h-[70px]")}
                          placeholder={f.placeholder}
                          value={previewAnswers[f.name] || ""}
                          onChange={(e) =>
                            setPreviewAnswers((a) => ({
                              ...a,
                              [f.name]: e.target.value,
                            }))
                          }
                        />
                      ) : f.type === "select" ? (
                        <select
                          className={inputCls()}
                          value={previewAnswers[f.name] || ""}
                          onChange={(e) =>
                            setPreviewAnswers((a) => ({
                              ...a,
                              [f.name]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Choose…</option>
                          {(f.options || []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : f.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={previewAnswers[f.name] === "on"}
                          onChange={(e) =>
                            setPreviewAnswers((a) => ({
                              ...a,
                              [f.name]: e.target.checked ? "on" : "",
                            }))
                          }
                          className="accent-[var(--tool-accent)]"
                        />
                      ) : (
                        <input
                          type={
                            f.type === "email"
                              ? "email"
                              : f.type === "phone"
                              ? "tel"
                              : "text"
                          }
                          className={inputCls()}
                          placeholder={f.placeholder}
                          value={previewAnswers[f.name] || ""}
                          onChange={(e) =>
                            setPreviewAnswers((a) => ({
                              ...a,
                              [f.name]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  </div>
                ))}
                {(!form.multiStep || previewStep === totalSteps) && (
                  <button
                    type="submit"
                    className="rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
                    style={{ color: "var(--bg)" }}
                  >
                    {form.submitLabel}
                  </button>
                )}
              </form>
            </div>
          </ToolCard>
        )}

        {mode === "embed" && (
          <ToolCard
            title="Export"
            subtitle={exportMode === "html" ? "HTML embed" : "JSON schema"}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
                <button
                  onClick={() => setExportMode("html")}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    exportMode === "html"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  HTML
                </button>
                <button
                  onClick={() => setExportMode("json")}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    exportMode === "json"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  JSON
                </button>
              </div>

              <button
                onClick={copy}
                className="ml-auto rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy snippet
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-2 text-center">
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                  Est. CVR
                </div>
                <div className="font-mono text-lg font-semibold text-tool-accent">
                  ~{conversionEstimate}%
                </div>
              </div>
              <div className="rounded-lg border border-app bg-app p-2 text-center">
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-muted">
                  Friction
                </div>
                <div className="font-mono text-lg font-semibold text-app">
                  {requiredCount}
                </div>
              </div>
            </div>

            {exportMode === "html" ? (
              <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                <div className="flex items-center gap-2 border-b border-app px-3 py-1.5">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    $ embed.html
                  </span>
                  <span className="font-mono text-[0.55rem] text-muted">
                    paste into any page
                  </span>
                </div>
                <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                  <code className="text-tool-accent">{highlightedHtml}</code>
                </pre>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                <div className="flex items-center gap-2 border-b border-app px-3 py-1.5">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    $ schema.json
                  </span>
                  <span className="font-mono text-[0.55rem] text-muted">
                    for storage / API
                  </span>
                </div>
                <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                  {output}
                </pre>
              </div>
            )}

            <div className="mt-3 font-mono text-[0.55rem] leading-relaxed text-muted">
              Heuristic: each required field trims est. completion ~3pp; multi-step
              recovers ~2pp. Replace with your real funnel data.
            </div>
          </ToolCard>
        )}

        {mode === "build" && (
          <>
            <ToolCard title="10 form templates" subtitle="Industry-ready">
              <div className="flex flex-wrap gap-2">
                {FORM_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => loadPreset(p.key)}
                    title={`${p.description} — Source: ${p.source}`}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:bg-tool-accent-soft hover:text-tool-accent"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="mt-2 font-mono text-[0.55rem] text-muted">
                Sources: HubSpot Form Benchmarks 2024, Unbounce Conversion Benchmark
                Report, Zoom/Zendesk/Eventbrite public benchmarks.
              </div>
            </ToolCard>

            {/* 3-rail builder canvas (width-driven): palette · drop zone · properties */}
            <div className="mt-6" style={builderGridStyle}>
              {/* LEFT RAIL — field-type palette */}
              <ToolCard title="Field palette" subtitle="Click to add">
                <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                  Add to form
                </div>
                <div className="flex flex-col gap-2">
                  {FIELD_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => addField(t)}
                      className="group flex items-center gap-3 rounded-lg border border-app bg-app-elevated px-3 py-2.5 text-left transition-colors hover:border-tool-accent hover:bg-tool-accent-soft"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-app bg-app font-mono text-sm text-tool-accent group-hover:border-tool-accent">
                        {FIELD_TYPE_GLYPH[t]}
                      </span>
                      <span className="flex flex-col">
                        <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-secondary group-hover:text-tool-accent">
                          {t}
                        </span>
                        <span className="font-mono text-[0.58rem] text-muted">
                          + append
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-lg border border-app bg-app-elevated p-3">
                  <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Form settings
                  </div>
                  <div className="space-y-2">
                    <Field label="Form name">
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Submit label">
                      <input
                        value={form.submitLabel}
                        onChange={(e) =>
                          setForm({ ...form, submitLabel: e.target.value })
                        }
                        className={inputCls()}
                      />
                    </Field>
                    <Field label="Action URL">
                      <input
                        value={form.action}
                        onChange={(e) => setForm({ ...form, action: e.target.value })}
                        className={inputCls("font-mono text-xs")}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-xs text-secondary">
                      <input
                        type="checkbox"
                        checked={!!form.multiStep}
                        onChange={(e) =>
                          setForm({ ...form, multiStep: e.target.checked })
                        }
                        className="accent-[var(--tool-accent)]"
                      />
                      Multi-step form
                    </label>
                    <label className="flex items-center gap-2 text-xs text-secondary">
                      <input
                        type="checkbox"
                        checked={!!form.tracking}
                        onChange={(e) =>
                          setForm({ ...form, tracking: e.target.checked })
                        }
                        className="accent-[var(--tool-accent)]"
                      />
                      Embed tracking snippet
                    </label>
                  </div>
                </div>
              </ToolCard>

              {/* MIDDLE — form canvas (live preview + editor) */}
              <div className="space-y-6">
                <ToolCard title="Live preview" subtitle="What visitors see">
                  <div className="rounded-xl border border-app bg-app-elevated p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-tool-accent" />
                        <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                          {form.name || "Lead form"}
                        </div>
                      </div>
                      {form.multiStep && (
                        <div className="flex items-center gap-2 text-xs text-secondary">
                          <button
                            disabled={previewStep <= 1}
                            onClick={() => setPreviewStep((s) => s - 1)}
                            className="rounded-lg border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                          >
                            ←
                          </button>
                          <span className="font-mono">
                            Step {previewStep} of {totalSteps}
                          </span>
                          <button
                            disabled={previewStep >= totalSteps}
                            onClick={() => setPreviewStep((s) => s + 1)}
                            className="rounded-lg border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={(e) => e.preventDefault()}
                      className="space-y-3"
                    >
                      {visibleFieldsForStep.map((f) => (
                        <div key={f.id}>
                          <label className="block text-sm text-secondary">
                            <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                              {f.label}
                              {f.required && (
                                <span className="text-tool-accent"> *</span>
                              )}
                            </span>
                            {f.type === "textarea" ? (
                              <textarea
                                className={inputCls("min-h-[70px]")}
                                placeholder={f.placeholder}
                                value={previewAnswers[f.name] || ""}
                                onChange={(e) =>
                                  setPreviewAnswers((a) => ({
                                    ...a,
                                    [f.name]: e.target.value,
                                  }))
                                }
                              />
                            ) : f.type === "select" ? (
                              <select
                                className={inputCls()}
                                value={previewAnswers[f.name] || ""}
                                onChange={(e) =>
                                  setPreviewAnswers((a) => ({
                                    ...a,
                                    [f.name]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Choose…</option>
                                {(f.options || []).map((o) => (
                                  <option key={o}>{o}</option>
                                ))}
                              </select>
                            ) : f.type === "checkbox" ? (
                              <input
                                type="checkbox"
                                checked={previewAnswers[f.name] === "on"}
                                onChange={(e) =>
                                  setPreviewAnswers((a) => ({
                                    ...a,
                                    [f.name]: e.target.checked ? "on" : "",
                                  }))
                                }
                                className="accent-[var(--tool-accent)]"
                              />
                            ) : (
                              <input
                                type={
                                  f.type === "email"
                                    ? "email"
                                    : f.type === "phone"
                                    ? "tel"
                                    : "text"
                                }
                                className={inputCls()}
                                placeholder={f.placeholder}
                                value={previewAnswers[f.name] || ""}
                                onChange={(e) =>
                                  setPreviewAnswers((a) => ({
                                    ...a,
                                    [f.name]: e.target.value,
                                  }))
                                }
                              />
                            )}
                          </label>
                        </div>
                      ))}
                      {(!form.multiStep || previewStep === totalSteps) && (
                        <button
                          type="submit"
                          className="rounded-lg bg-tool-accent px-4 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
                          style={{ color: "var(--bg)" }}
                        >
                          {form.submitLabel}
                        </button>
                      )}
                    </form>
                  </div>
                </ToolCard>

                <ToolCard title="Form canvas" subtitle="Reorder · configure">
                  <div className="space-y-3">
                    {form.fields.length === 0 && (
                      <div className="rounded-lg border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                        Empty canvas. Add fields from the palette
                        {isWide ? " on the left." : " above."}
                      </div>
                    )}
                    {form.fields.map((f, idx) => (
                      <div
                        key={f.id}
                        className="group rounded-xl border border-app bg-app-elevated p-3 transition-colors hover:border-tool-accent"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {/* Drag/reorder handle column */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => move(f.id, -1)}
                              disabled={idx === 0}
                              title="Move up"
                              className="flex h-5 w-5 items-center justify-center rounded border border-app font-mono text-[0.55rem] text-muted hover:border-tool-accent hover:text-tool-accent disabled:opacity-30"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => move(f.id, 1)}
                              disabled={idx === form.fields.length - 1}
                              title="Move down"
                              className="flex h-5 w-5 items-center justify-center rounded border border-app font-mono text-[0.55rem] text-muted hover:border-tool-accent hover:text-tool-accent disabled:opacity-30"
                            >
                              ↓
                            </button>
                          </div>
                          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-tool-accent bg-tool-accent-soft font-mono text-xs text-tool-accent">
                            {FIELD_TYPE_GLYPH[f.type]}
                          </span>
                          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-tool-accent">
                            {f.type}
                          </span>
                          {f.required && (
                            <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-secondary">
                              required
                            </span>
                          )}
                          {f.showIf && (
                            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-amber-500">
                              if {f.showIf.name}={f.showIf.equals}
                            </span>
                          )}
                          {form.multiStep && (
                            <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-secondary">
                              step {f.step || 1}
                            </span>
                          )}
                          <button
                            onClick={() => removeField(f.id)}
                            className="ml-auto rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          <input
                            placeholder="Label"
                            value={f.label}
                            onChange={(e) =>
                              updateField(f.id, { label: e.target.value })
                            }
                            className={inputCls()}
                          />
                          <input
                            placeholder="Name (for form data)"
                            value={f.name}
                            onChange={(e) =>
                              updateField(f.id, { name: slugify(e.target.value) })
                            }
                            className={inputCls("font-mono text-xs")}
                          />
                          {(f.type === "text" ||
                            f.type === "email" ||
                            f.type === "phone" ||
                            f.type === "textarea") && (
                            <input
                              placeholder="Placeholder"
                              value={f.placeholder || ""}
                              onChange={(e) =>
                                updateField(f.id, { placeholder: e.target.value })
                              }
                              className={inputCls()}
                            />
                          )}
                          {f.type === "select" && (
                            <input
                              placeholder="Options (comma separated)"
                              value={(f.options || []).join(", ")}
                              onChange={(e) =>
                                updateField(f.id, {
                                  options: e.target.value
                                    .split(",")
                                    .map((o) => o.trim())
                                    .filter(Boolean),
                                })
                              }
                              className={inputCls()}
                            />
                          )}
                          <label className="flex items-center gap-2 text-sm text-secondary">
                            <input
                              type="checkbox"
                              checked={f.required}
                              onChange={(e) =>
                                updateField(f.id, { required: e.target.checked })
                              }
                              className="accent-[var(--tool-accent)]"
                            />
                            Required
                          </label>
                          {form.multiStep && (
                            <label className="flex items-center gap-2 text-sm text-secondary">
                              <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-muted">
                                Step
                              </span>
                              <input
                                type="number"
                                min={1}
                                value={f.step || 1}
                                onChange={(e) =>
                                  updateField(f.id, {
                                    step: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-16 rounded-lg border border-app bg-app px-2 py-1 text-sm text-app"
                              />
                            </label>
                          )}
                        </div>
                        {/* Conditional-logic editor */}
                        <div className="mt-2 rounded-lg border border-app bg-app p-2 text-xs">
                          <div className="mb-1 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                            Conditional: show only if…
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={f.showIf?.name || ""}
                              onChange={(e) => {
                                if (!e.target.value) {
                                  const { showIf, ...rest } = f;
                                  void showIf;
                                  setForm((s) => ({
                                    ...s,
                                    fields: s.fields.map((x) =>
                                      x.id === f.id ? rest : x
                                    ),
                                  }));
                                } else {
                                  updateField(f.id, {
                                    showIf: {
                                      name: e.target.value,
                                      equals: f.showIf?.equals || "",
                                    },
                                  });
                                }
                              }}
                              className="rounded-lg border border-app bg-app-elevated px-2 py-1 text-xs text-app"
                            >
                              <option value="">— always —</option>
                              {fieldNames
                                .filter((n) => n !== f.name)
                                .map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                            </select>
                            {f.showIf && (
                              <>
                                <span className="text-muted">equals</span>
                                <input
                                  value={f.showIf.equals}
                                  onChange={(e) =>
                                    updateField(f.id, {
                                      showIf: { ...f.showIf!, equals: e.target.value },
                                    })
                                  }
                                  className="flex-1 rounded-lg border border-app bg-app-elevated px-2 py-1 text-xs text-app"
                                  placeholder="value"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ToolCard>
              </div>

              {/* RIGHT RAIL — properties / export */}
              <ToolCard
                title="Export"
                subtitle={exportMode === "html" ? "HTML embed" : "JSON schema"}
              >
                <div className="mb-4 inline-flex w-full overflow-hidden rounded-lg border border-app bg-app-elevated">
                  <button
                    onClick={() => setExportMode("html")}
                    className={`flex-1 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                      exportMode === "html"
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    HTML
                  </button>
                  <button
                    onClick={() => setExportMode("json")}
                    className={`flex-1 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] transition-colors ${
                      exportMode === "json"
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    JSON
                  </button>
                </div>

                <button
                  onClick={copy}
                  className="mb-3 w-full rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Copy snippet
                </button>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-tool-accent bg-tool-accent-soft p-2 text-center">
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                      Est. CVR
                    </div>
                    <div className="font-mono text-lg font-semibold text-tool-accent">
                      ~{conversionEstimate}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-app bg-app p-2 text-center">
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-muted">
                      Friction
                    </div>
                    <div className="font-mono text-lg font-semibold text-app">
                      {requiredCount}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                  <div className="flex items-center gap-2 border-b border-app px-2.5 py-1">
                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      $ {exportMode === "html" ? "embed.html" : "schema.json"}
                    </span>
                    <span className="font-mono text-[0.55rem] text-muted">
                      {exportMode === "html" ? "paste anywhere" : "for storage"}
                    </span>
                  </div>
                  <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                    {exportMode === "html" ? (
                      <code className="text-tool-accent">{output}</code>
                    ) : (
                      output
                    )}
                  </pre>
                </div>

                <div className="mt-3 font-mono text-[0.55rem] leading-relaxed text-muted">
                  Heuristic: each required field trims est. completion ~3pp; multi-step
                  recovers ~2pp. Replace with your real funnel data.
                </div>
              </ToolCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
