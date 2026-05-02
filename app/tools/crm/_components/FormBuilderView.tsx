"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * FormBuilderView — drag-add lead-capture form designer.
 *
 * Folded in from app/solutions/tools/lead-capture-form-builder/page.tsx.
 * Marketing chrome stripped; renders inline. Persistence is workspace_data
 * (`lead-forms` namespace) when a team is selected; localStorage otherwise.
 *
 * Tabs: Build (palette + canvas + properties) · Preview · Embed (HTML / JSON).
 * 10 industry-ready presets via FORM_PRESETS. Conditional logic, multi-step,
 * tracking snippet support.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";
import MintShareButton from "@/app/_share/_components/MintShareButton";
import {
  FORM_PRESETS,
  type PresetField,
} from "../_data/form-presets";

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
const NAMESPACE = "lead-forms";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

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
      {
        id: uid(),
        type: "text",
        label: "Full name",
        name: "name",
        required: true,
        placeholder: "Jane Doe",
      },
      {
        id: uid(),
        type: "email",
        label: "Work email",
        name: "email",
        required: true,
        placeholder: "you@company.com",
      },
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
  parts.push(`  <button type="submit">${form.submitLabel}</button>\n</form>`);
  if (form.tracking) {
    parts.push(
      ``,
      `<script>`,
      `  document.querySelector('.lead-form')?.addEventListener('submit', (e) => {`,
      `    const data = Object.fromEntries(new FormData(e.currentTarget));`,
      `    try { window.analytics?.track?.('Lead form submitted', { form_name: ${JSON.stringify(form.name)}, fields: Object.keys(data) }); } catch {}`,
      `  });`,
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

function inputCls(extra = "") {
  return `w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none ${extra}`.trim();
}

type TabKey = "build" | "preview" | "embed";

interface Props {
  workspaceId: string;
  workspaceLabel: string;
  width: number;
}

export default function FormBuilderView({
  workspaceId,
  workspaceLabel,
  width,
}: Props) {
  const { current, loading: wsLoading } = useWorkspace();
  const [form, setForm] = useState<FormDef>(defaultForm());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [exportMode, setExportMode] = useState<"html" | "json">("html");
  const [mode, setMode] = useState<TabKey>("build");
  const [previewStep, setPreviewStep] = useState(1);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>(
    {}
  );

  const compact = width < 720;

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    (async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<FormDef>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setForm(data && Array.isArray(data.fields) ? data : defaultForm());
      } else {
        try {
          const raw =
            localStorage.getItem(LS_KEY) ||
            localStorage.getItem(LEGACY_LS_KEY);
          if (raw) {
            setForm({ ...defaultForm(), ...(JSON.parse(raw) as FormDef) });
          } else {
            setForm(defaultForm());
          }
        } catch {
          setForm(defaultForm());
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(
          current.id,
          NAMESPACE,
          DATA_KEY,
          form
        );
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(form));
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {
          /* ignore */
        }
      }
      timer = null;
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [form, hydrated, current]);

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
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(output);
    }
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

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <div>
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-tool-accent">
            crm.forms
          </div>
          <h2 className="text-sm font-semibold text-app">Lead capture forms</h2>
        </div>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {form.fields.length} fields · {requiredCount} req
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-secondary">
          {form.multiStep ? `${totalSteps}-step` : "single page"}
        </span>
        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-tool-accent">
          ~{conversionEstimate}% est. CVR
        </span>
        <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
          {syncing
            ? "saving…"
            : syncedAt
            ? `saved ${syncedAt}`
            : hydrated
            ? "ready"
            : "loading…"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="inline-flex overflow-hidden rounded-md border border-app bg-app">
            {(
              [
                { k: "build", label: "Build" },
                { k: "preview", label: "Preview" },
                { k: "embed", label: "Embed" },
              ] as { k: TabKey; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setMode(t.k)}
                className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
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
            className="rounded-md border border-app bg-app-elevated px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary hover:border-tool-accent focus:outline-none"
            defaultValue=""
          >
            <option value="" disabled>
              Load template…
            </option>
            {FORM_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            Copy snippet
          </button>
        </div>
      </header>

      <div className="border-b border-app bg-app-elevated px-3 py-2">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Untitled form"
          className="w-full bg-transparent text-lg font-semibold tracking-tight text-app placeholder:text-faint outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {mode === "preview" && (
          <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                Live preview · {form.name || "Lead form"}
              </div>
              {form.multiStep && (
                <div className="flex items-center gap-2 font-mono text-[0.6rem] text-secondary">
                  <button
                    type="button"
                    disabled={previewStep <= 1}
                    onClick={() => setPreviewStep((s) => s - 1)}
                    className="rounded-md border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                  >
                    ←
                  </button>
                  <span>
                    Step {previewStep} of {totalSteps}
                  </span>
                  <button
                    type="button"
                    disabled={previewStep >= totalSteps}
                    onClick={() => setPreviewStep((s) => s + 1)}
                    className="rounded-md border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
            <PreviewForm
              fields={visibleFieldsForStep}
              answers={previewAnswers}
              setAnswers={setPreviewAnswers}
              submitLabel={form.submitLabel}
              showSubmit={!form.multiStep || previewStep === totalSteps}
            />
          </section>
        )}

        {mode === "embed" && (
          <div className="space-y-3">
            <section className="rounded-md border border-app bg-app-elevated p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    Publish as public link
                  </div>
                  <div className="mt-0.5 text-xs text-secondary">
                    Mint a toshare.net URL to send to leads — no embed needed.
                  </div>
                </div>
                <span className="rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                  {form.fields.length === 0 ? "add fields first" : "ready"}
                </span>
              </div>
              <MintShareButton
                type="form"
                sourceTool="crm-form-builder"
                workspaceId={current.kind === "team" ? current.id : undefined}
                disabled={form.fields.length === 0}
                label="Publish form link"
                payload={() => ({
                  title: form.name || "Untitled form",
                  fields: form.fields.map((f) => ({
                    id: f.id,
                    label: f.label,
                    type: f.type === "phone" ? "phone" : f.type,
                    required: f.required,
                    placeholder: f.placeholder,
                    options: f.options,
                  })),
                  submitLabel: form.submitLabel || "Submit",
                })}
              />
            </section>
            <section className="rounded-md border border-app bg-app-elevated p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-app bg-app">
                <button
                  type="button"
                  onClick={() => setExportMode("html")}
                  className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    exportMode === "html"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode("json")}
                  className={`px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    exportMode === "json"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  JSON
                </button>
              </div>
              <button
                type="button"
                onClick={copy}
                className="ml-auto rounded-md bg-tool-accent px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy snippet
              </button>
            </div>
            <div className="overflow-hidden rounded-md border border-app bg-app">
              <div className="flex items-center gap-2 border-b border-app px-2.5 py-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  $ {exportMode === "html" ? "embed.html" : "schema.json"}
                </span>
                <span className="font-mono text-[0.55rem] text-faint">
                  {exportMode === "html" ? "paste into any page" : "for storage / API"}
                </span>
              </div>
              <pre className="max-h-[420px] overflow-auto p-3 font-mono text-xs leading-relaxed text-app">
                {output}
              </pre>
            </div>
            <div className="mt-2 font-mono text-[0.55rem] leading-relaxed text-faint">
              Heuristic: each required field trims est. completion ~3pp;
              multi-step recovers ~2pp.
            </div>
            </section>
          </div>
        )}

        {mode === "build" && (
          <div
            className={`grid gap-3 ${
              compact ? "grid-cols-1" : "xl:grid-cols-[220px_1fr_320px]"
            }`}
          >
            {/* LEFT — palette + form settings */}
            <aside className="rounded-md border border-app bg-app-elevated p-3">
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                Field palette
              </div>
              <div className="flex flex-col gap-1.5">
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addField(t)}
                    className="group flex items-center gap-2 rounded-md border border-app bg-app px-2.5 py-2 text-left hover:border-tool-accent hover:bg-tool-accent-soft"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-app bg-app font-mono text-xs text-tool-accent">
                      {FIELD_TYPE_GLYPH[t]}
                    </span>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary group-hover:text-tool-accent">
                      {t}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-app bg-app p-2.5">
                <div className="mb-1.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Form settings
                </div>
                <div className="space-y-1.5">
                  <input
                    placeholder="Form name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls()}
                  />
                  <input
                    placeholder="Submit label"
                    value={form.submitLabel}
                    onChange={(e) =>
                      setForm({ ...form, submitLabel: e.target.value })
                    }
                    className={inputCls()}
                  />
                  <input
                    placeholder="Action URL"
                    value={form.action}
                    onChange={(e) =>
                      setForm({ ...form, action: e.target.value })
                    }
                    className={inputCls("font-mono text-xs")}
                  />
                  <label className="flex items-center gap-2 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={!!form.multiStep}
                      onChange={(e) =>
                        setForm({ ...form, multiStep: e.target.checked })
                      }
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
                    />
                    Embed tracking snippet
                  </label>
                </div>
              </div>
            </aside>

            {/* MIDDLE — preview + canvas */}
            <div className="space-y-3">
              <section className="rounded-md border border-app bg-app-elevated p-3">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Live preview
                </div>
                <PreviewForm
                  fields={visibleFieldsForStep}
                  answers={previewAnswers}
                  setAnswers={setPreviewAnswers}
                  submitLabel={form.submitLabel}
                  showSubmit={!form.multiStep || previewStep === totalSteps}
                />
                {form.multiStep && (
                  <div className="mt-2 flex items-center gap-2 font-mono text-[0.55rem] text-secondary">
                    <button
                      type="button"
                      disabled={previewStep <= 1}
                      onClick={() => setPreviewStep((s) => s - 1)}
                      className="rounded-md border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                    >
                      ←
                    </button>
                    <span>
                      Step {previewStep} of {totalSteps}
                    </span>
                    <button
                      type="button"
                      disabled={previewStep >= totalSteps}
                      onClick={() => setPreviewStep((s) => s + 1)}
                      className="rounded-md border border-app bg-app px-2 py-0.5 hover:border-tool-accent disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-md border border-app bg-app-elevated p-3">
                <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  Form canvas — reorder · configure
                </div>
                <div className="space-y-2">
                  {form.fields.length === 0 && (
                    <div className="rounded-md border border-dashed border-app bg-app p-6 text-center text-xs text-muted">
                      Empty canvas. Add fields from the palette on the left.
                    </div>
                  )}
                  {form.fields.map((f, idx) => (
                    <div
                      key={f.id}
                      className="rounded-md border border-app bg-app p-2.5"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => move(f.id, -1)}
                            disabled={idx === 0}
                            className="flex h-5 w-5 items-center justify-center rounded border border-app font-mono text-[0.55rem] text-faint hover:border-tool-accent hover:text-tool-accent disabled:opacity-30"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => move(f.id, 1)}
                            disabled={idx === form.fields.length - 1}
                            className="flex h-5 w-5 items-center justify-center rounded border border-app font-mono text-[0.55rem] text-faint hover:border-tool-accent hover:text-tool-accent disabled:opacity-30"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-tool-accent bg-tool-accent-soft font-mono text-xs text-tool-accent">
                          {FIELD_TYPE_GLYPH[f.type]}
                        </span>
                        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                          {f.type}
                        </span>
                        {f.required && (
                          <span className="rounded-md border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-secondary">
                            required
                          </span>
                        )}
                        {f.showIf && (
                          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-amber-500">
                            if {f.showIf.name}={f.showIf.equals}
                          </span>
                        )}
                        {form.multiStep && (
                          <span className="rounded-md border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.1em] text-secondary">
                            step {f.step || 1}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeField(f.id)}
                          className="ml-auto rounded-md border border-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint hover:border-rose-500/40 hover:text-rose-500"
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
                          placeholder="Name (form data)"
                          value={f.name}
                          onChange={(e) =>
                            updateField(f.id, {
                              name: slugify(e.target.value),
                            })
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
                              updateField(f.id, {
                                placeholder: e.target.value,
                              })
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
                              updateField(f.id, {
                                required: e.target.checked,
                              })
                            }
                          />
                          Required
                        </label>
                        {form.multiStep && (
                          <label className="flex items-center gap-2 text-xs text-secondary">
                            <span className="font-mono text-[0.55rem] uppercase tracking-[0.15em] text-faint">
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
                              className="w-16 rounded-md border border-app bg-app-elevated px-2 py-1 text-sm text-app"
                            />
                          </label>
                        )}
                      </div>
                      <div className="mt-2 rounded-md border border-app bg-app-elevated p-2 text-xs">
                        <div className="mb-1 font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                          Conditional: show only if…
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={f.showIf?.name || ""}
                            onChange={(e) => {
                              if (!e.target.value) {
                                setForm((s) => ({
                                  ...s,
                                  fields: s.fields.map((x) => {
                                    if (x.id !== f.id) return x;
                                    const { showIf: _showIf, ...rest } = x;
                                    void _showIf;
                                    return rest;
                                  }),
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
                            className="rounded-md border border-app bg-app px-2 py-1 text-xs text-app"
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
                              <span className="text-faint">equals</span>
                              <input
                                value={f.showIf.equals}
                                onChange={(e) =>
                                  updateField(f.id, {
                                    showIf: {
                                      ...f.showIf!,
                                      equals: e.target.value,
                                    },
                                  })
                                }
                                className="flex-1 rounded-md border border-app bg-app px-2 py-1 text-xs text-app"
                                placeholder="value"
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT — properties / quick export */}
            <aside className="rounded-md border border-app bg-app-elevated p-3">
              <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                Quick export
              </div>
              <div className="mb-2 inline-flex w-full overflow-hidden rounded-md border border-app bg-app">
                <button
                  type="button"
                  onClick={() => setExportMode("html")}
                  className={`flex-1 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] transition-colors ${
                    exportMode === "html"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setExportMode("json")}
                  className={`flex-1 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.15em] transition-colors ${
                    exportMode === "json"
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  JSON
                </button>
              </div>
              <button
                type="button"
                onClick={copy}
                className="mb-2 w-full rounded-md bg-tool-accent px-2.5 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Copy snippet
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-tool-accent bg-tool-accent-soft p-1.5 text-center">
                  <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-tool-accent">
                    Est. CVR
                  </div>
                  <div className="font-mono text-base font-semibold text-tool-accent">
                    ~{conversionEstimate}%
                  </div>
                </div>
                <div className="rounded-md border border-app bg-app p-1.5 text-center">
                  <div className="font-mono text-[0.5rem] uppercase tracking-[0.15em] text-faint">
                    Friction
                  </div>
                  <div className="font-mono text-base font-semibold text-app">
                    {requiredCount}
                  </div>
                </div>
              </div>
              <pre className="mt-2 max-h-[280px] overflow-auto rounded-md border border-app bg-app p-2 font-mono text-[0.65rem] leading-relaxed text-app">
                {output}
              </pre>
            </aside>
          </div>
        )}
      </div>

      <footer className="border-t border-app bg-app-elevated px-3 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
        {workspaceLabel} · {workspaceId ? "synced" : "personal mode"}
      </footer>
    </div>
  );
}

function PreviewForm({
  fields,
  answers,
  setAnswers,
  submitLabel,
  showSubmit,
}: {
  fields: FormField[];
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  submitLabel: string;
  showSubmit: boolean;
}) {
  const inputClass = "w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none";
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-2 rounded-md border border-app bg-app p-3"
    >
      {fields.length === 0 && (
        <div className="rounded-md border border-dashed border-app p-4 text-center text-xs text-muted">
          No visible fields for this step.
        </div>
      )}
      {fields.map((f) => (
        <label key={f.id} className="block text-sm text-secondary">
          <span className="mb-0.5 block font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
            {f.label}
            {f.required && <span className="text-tool-accent"> *</span>}
          </span>
          {f.type === "textarea" ? (
            <textarea
              className={`${inputClass} min-h-[60px]`}
              placeholder={f.placeholder}
              value={answers[f.name] || ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [f.name]: e.target.value }))
              }
            />
          ) : f.type === "select" ? (
            <select
              className={inputClass}
              value={answers[f.name] || ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [f.name]: e.target.value }))
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
              checked={answers[f.name] === "on"}
              onChange={(e) =>
                setAnswers((a) => ({
                  ...a,
                  [f.name]: e.target.checked ? "on" : "",
                }))
              }
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
              className={inputClass}
              placeholder={f.placeholder}
              value={answers[f.name] || ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [f.name]: e.target.value }))
              }
            />
          )}
        </label>
      ))}
      {showSubmit && (
        <button
          type="submit"
          className="rounded-md bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] hover:opacity-90"
          style={{ color: "var(--bg)" }}
        >
          {submitLabel}
        </button>
      )}
    </form>
  );
}
