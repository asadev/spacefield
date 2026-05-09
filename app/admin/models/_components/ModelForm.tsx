"use client";

import { useState } from "react";

import {
  MODEL_PROVIDERS,
  type AiModelRow,
  type CapabilityTier,
  type ModelProvider,
  type ModelStatus,
} from "../../_types";
import { buttonClass, inputClass } from "./_styles";

/**
 * Shared editor for `/admin/models/new` and `/admin/models/[id]`.
 * Client component so the boolean toggles + numeric inputs feel right.
 * The form posts to a real server-action via the `action` prop.
 */
export type ModelFormMode = "create" | "edit";

export type ModelFormProps = {
  mode: ModelFormMode;
  action: (formData: FormData) => void;
  model?: AiModelRow | null;
};

const DEFAULT_MODEL: Pick<
  AiModelRow,
  | "provider"
  | "label"
  | "context_window"
  | "max_output_tokens"
  | "supports_vision"
  | "supports_thinking"
  | "supports_tools"
  | "cost_input_per_million"
  | "cost_output_per_million"
  | "status"
  | "capability_tier"
  | "sort_order"
> = {
  provider: "anthropic",
  label: "",
  context_window: 200000,
  max_output_tokens: 4096,
  supports_vision: true,
  supports_thinking: false,
  supports_tools: true,
  cost_input_per_million: 0,
  cost_output_per_million: 0,
  status: "live",
  capability_tier: "balanced",
  sort_order: 0,
};

const STATUS_OPTIONS: { value: ModelStatus; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "beta", label: "Beta" },
  { value: "deprecated", label: "Deprecated" },
];

const TIER_OPTIONS: { value: CapabilityTier; label: string; help: string }[] =
  [
    { value: "flagship", label: "Flagship", help: "Best quality, slowest" },
    { value: "balanced", label: "Balanced", help: "Default workhorse" },
    { value: "fast", label: "Fast", help: "Cheap + low latency" },
    { value: "reasoning", label: "Reasoning", help: "Thinking-class model" },
  ];

export default function ModelForm({ mode, action, model }: ModelFormProps) {
  const initial = model ?? DEFAULT_MODEL;

  const [provider, setProvider] = useState<ModelProvider>(initial.provider);
  const [supportsVision, setSupportsVision] = useState(
    Boolean(initial.supports_vision)
  );
  const [supportsThinking, setSupportsThinking] = useState(
    Boolean(initial.supports_thinking)
  );
  const [supportsTools, setSupportsTools] = useState(
    Boolean(initial.supports_tools)
  );

  return (
    <form
      action={action}
      className="space-y-6 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && (
        <input type="hidden" name="id" value={model?.id ?? ""} />
      )}

      {/* Identity */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-app">Identity</h2>
          <p className="mt-0.5 text-xs text-muted">
            The id is the string passed to the SDK. For Claude that's
            usually <code className="font-mono">claude-haiku-4-5</code> or a
            dated suffix; for OpenAI it's <code className="font-mono">gpt-5-mini</code>.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Model id
            </span>
            {mode === "create" ? (
              <input
                type="text"
                name="id"
                required
                placeholder="claude-haiku-5-0"
                className={`${inputClass} font-mono`}
              />
            ) : (
              <input
                type="text"
                value={model?.id ?? ""}
                readOnly
                className={`${inputClass} font-mono opacity-70`}
              />
            )}
            <span className="mt-1 block text-[11px] text-faint">
              Lowercase letters/digits/dots/hyphens. Cannot be changed
              after creation.
            </span>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Display label
            </span>
            <input
              type="text"
              name="label"
              required
              defaultValue={initial.label}
              placeholder="Claude Haiku 5.0"
              className={inputClass}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Provider
            </span>
            <select
              name="provider"
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as ModelProvider)
              }
              className={inputClass}
            >
              {MODEL_PROVIDERS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Status
            </span>
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
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Capability tier
            </span>
            <select
              name="capability_tier"
              defaultValue={initial.capability_tier}
              className={inputClass}
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.help}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Sort order
            </span>
            <input
              type="number"
              name="sort_order"
              defaultValue={initial.sort_order}
              step={1}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {/* Limits */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-app">Limits</h2>
          <p className="mt-0.5 text-xs text-muted">
            Soft hints used by tooling. The runtime caps independently per
            call_kind; this is for picker UI and cost estimation.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Context window (tokens)
            </span>
            <input
              type="number"
              name="context_window"
              defaultValue={initial.context_window}
              step={1024}
              className={inputClass}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Max output tokens
            </span>
            <input
              type="number"
              name="max_output_tokens"
              defaultValue={initial.max_output_tokens}
              step={256}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {/* Capabilities */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-app">Capabilities</h2>
          <p className="mt-0.5 text-xs text-muted">
            Surfaced to the agent picker so admins can see at a glance
            what a model can do.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-app">
            <input
              type="checkbox"
              name="supports_vision"
              checked={supportsVision}
              onChange={(e) => setSupportsVision(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Vision (image input)
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-app">
            <input
              type="checkbox"
              name="supports_thinking"
              checked={supportsThinking}
              onChange={(e) => setSupportsThinking(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Extended thinking
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-app">
            <input
              type="checkbox"
              name="supports_tools"
              checked={supportsTools}
              onChange={(e) => setSupportsTools(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Tool use
          </label>
        </div>
      </section>

      {/* Cost */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold text-app">Pricing</h2>
          <p className="mt-0.5 text-xs text-muted">
            US dollars per million tokens. Used by the insights dashboard
            for cost estimation.
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Input $/M tokens
            </span>
            <input
              type="number"
              name="cost_input_per_million"
              defaultValue={initial.cost_input_per_million}
              step={0.01}
              min={0}
              className={inputClass}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-secondary">
              Output $/M tokens
            </span>
            <input
              type="number"
              name="cost_output_per_million"
              defaultValue={initial.cost_output_per_million}
              step={0.01}
              min={0}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
        <button type="submit" className={buttonClass}>
          {mode === "create" ? "Create model" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
