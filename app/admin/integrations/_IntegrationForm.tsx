import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import {
  INTEGRATION_STATUSES,
  readRequiredEnv,
} from "./_helpers";

import type { IntegrationRow } from "../_types";

/**
 * Shared form for creating + editing an integration. Server component;
 * wired to a server action via the `action` prop.
 */

export type IntegrationFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<void>;
  row?: IntegrationRow;
};

export default function IntegrationForm({
  mode,
  action,
  row,
}: IntegrationFormProps) {
  const isEdit = mode === "edit";
  const oauthDefault =
    row?.oauth_config != null
      ? JSON.stringify(row.oauth_config, null, 2)
      : "";
  const envDefault = readRequiredEnv(row?.required_env ?? []).join("\n");

  return (
    <form action={action} className="space-y-4">
      {isEdit && row && <input type="hidden" name="id" value={row.id} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="ID"
          hint="Lowercase letters, digits, hyphens, underscores. Cannot change."
        >
          <input
            type="text"
            name="id"
            required
            defaultValue={row?.id ?? ""}
            disabled={isEdit}
            placeholder="hubspot"
            pattern="^[a-z0-9][a-z0-9_-]*$"
            className={`${inputClass} font-mono ${isEdit ? "opacity-60" : ""}`}
          />
        </Field>
        <Field label="Display name">
          <input
            type="text"
            name="display_name"
            required
            defaultValue={row?.display_name ?? ""}
            placeholder="HubSpot"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Category"
          hint="Used in the index filter. Free-form, e.g. crm, payments, ai, comms."
        >
          <input
            type="text"
            name="category"
            defaultValue={row?.category ?? "general"}
            placeholder="crm"
            className={inputClass}
          />
        </Field>
        <Field label="Status">
          <select
            name="status"
            defaultValue={row?.status ?? "available"}
            className={inputClass}
          >
            {INTEGRATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={row?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Logo URL">
          <input
            type="url"
            name="logo_url"
            defaultValue={row?.logo_url ?? ""}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
        <Field label="Homepage URL">
          <input
            type="url"
            name="homepage_url"
            defaultValue={row?.homepage_url ?? ""}
            placeholder="https://hubspot.com"
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="OAuth config (JSON)"
        hint="Free-form JSON object — provider URLs, scopes, client_id env name. Leave blank if not OAuth."
      >
        <textarea
          name="oauth_config"
          rows={6}
          spellCheck={false}
          defaultValue={oauthDefault}
          placeholder={`{\n  "auth_url": "https://app.hubspot.com/oauth/authorize",\n  "token_url": "https://api.hubapi.com/oauth/v1/token",\n  "scopes": ["crm.objects.contacts.read"]\n}`}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field
        label="Required env vars"
        hint="One per line. Will be checked against process.env in the verify step. Example: HUBSPOT_CLIENT_ID."
      >
        <textarea
          name="required_env"
          rows={5}
          spellCheck={false}
          defaultValue={envDefault}
          placeholder={"HUBSPOT_CLIENT_ID\nHUBSPOT_CLIENT_SECRET"}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field label="Enabled">
        <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={row ? row.enabled : true}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          <span>Integration is enabled at runtime</span>
        </label>
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button type="submit" className={buttonClass}>
          {isEdit ? "Save changes" : "Create integration"}
        </button>
        <Link href="/admin/integrations" className={buttonGhostClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}
