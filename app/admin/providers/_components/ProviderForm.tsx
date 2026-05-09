"use client";

import { useState } from "react";

import type { AiProviderRow } from "../../_types";
import { buttonClass, inputClass } from "./_styles";

const STATUS_OPTIONS: Array<{
  value: "live" | "paused" | "disabled";
  label: string;
}> = [
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "disabled", label: "Disabled" },
];

/**
 * Editor for `public.ai_providers`. Submits to a real server-action via
 * the `action` prop. Client component for the textarea state + boolean
 * focus behaviour; everything else is plain form fields.
 */
export default function ProviderForm({
  provider,
  action,
}: {
  provider: AiProviderRow;
  action: (formData: FormData) => void;
}) {
  const [metadataText, setMetadataText] = useState<string>(() => {
    try {
      return JSON.stringify(provider.metadata ?? {}, null, 2);
    } catch {
      return "{}";
    }
  });
  const [parseError, setParseError] = useState<string | null>(null);

  function onMetadataChange(v: string) {
    setMetadataText(v);
    if (v.trim() === "") {
      setParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(v);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setParseError("metadata must be a JSON object");
        return;
      }
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "invalid JSON");
    }
  }

  return (
    <form
      action={action}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      <input type="hidden" name="id" value={provider.id} />

      <header>
        <h2 className="text-sm font-semibold text-app">Settings</h2>
        <p className="mt-0.5 text-xs text-muted">
          Provider id <code className="font-mono">{provider.id}</code> is
          fixed (foreign keys to <code className="font-mono">ai_provider_health</code>).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Display name" htmlFor="display_name">
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            defaultValue={provider.display_name}
            className={inputClass}
            placeholder="Anthropic Claude"
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={provider.status}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Base URL"
          htmlFor="base_url"
          hint="Provider's API root. Optional — used for display only."
        >
          <input
            id="base_url"
            name="base_url"
            type="url"
            defaultValue={provider.base_url ?? ""}
            className={inputClass}
            placeholder="https://api.anthropic.com"
          />
        </Field>

        <Field
          label="API key env var"
          htmlFor="api_key_env"
          hint="The NAME of the env var holding the secret (never the value)."
        >
          <input
            id="api_key_env"
            name="api_key_env"
            type="text"
            required
            defaultValue={provider.api_key_env}
            className={`${inputClass} font-mono`}
            placeholder="ANTHROPIC_API_KEY"
            pattern="^[A-Z][A-Z0-9_]{2,63}$"
            title="uppercase letters/digits/underscore, 3-64 chars, must start with a letter"
          />
        </Field>

        <Field
          label="Cost quota (USD)"
          htmlFor="cost_quota_usd"
          hint="0 means no quota."
        >
          <input
            id="cost_quota_usd"
            name="cost_quota_usd"
            type="number"
            min={0}
            max={1000000}
            step={1}
            defaultValue={provider.cost_quota_usd ?? 0}
            className={inputClass}
          />
        </Field>

        <Field label="Spend (USD, read-only)" htmlFor="spent_usd_display">
          <input
            id="spent_usd_display"
            name="spent_usd_display"
            type="text"
            disabled
            value={`$${Number(provider.spent_usd ?? 0).toFixed(2)}`}
            className={`${inputClass} text-secondary`}
          />
        </Field>
      </div>

      <Field
        label="Metadata (JSON)"
        htmlFor="metadata"
        hint="Free-form provider config. The discovery payload is stored under metadata.discovery — re-discovering overwrites it."
      >
        <textarea
          id="metadata"
          name="metadata"
          rows={8}
          spellCheck={false}
          value={metadataText}
          onChange={(e) => onMetadataChange(e.target.value)}
          className={`${inputClass} font-mono text-xs`}
        />
        {parseError && (
          <div className="mt-1 text-[11px] text-rose-500">
            JSON error: {parseError}
          </div>
        )}
      </Field>

      <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
        <button type="submit" className={buttonClass} disabled={!!parseError}>
          Save changes
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="block text-[0.65rem] font-medium uppercase tracking-[0.18em] text-muted"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-faint">{hint}</p>}
    </div>
  );
}
