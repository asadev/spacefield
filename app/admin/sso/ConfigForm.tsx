import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import {
  FIELD_HINT,
  FIELD_LABEL,
  PROTOCOL_FIELDS,
  PROTOCOL_LABEL,
  PROTOCOLS,
  STATUS_LABEL,
  STATUSES,
  TEXTAREA_FIELDS,
  type Protocol,
} from "./_helpers";

import type { SsoConfigRow } from "../_types";

type WorkspaceLite = { id: string; name: string };

/**
 * Server-rendered form shared by /admin/sso/new and /[id]. The protocol
 * select and the per-protocol fields are independent — switching the
 * dropdown on `new` requires reloading via the GET form above (same UX
 * pattern as the alerts editor). On `edit` we render the saved
 * protocol's fields and leave the others hidden.
 */
export default function ConfigForm({
  config,
  protocol,
  workspaces,
  action,
  submitLabel,
}: {
  config: Partial<SsoConfigRow> | null;
  protocol: Protocol;
  workspaces: WorkspaceLite[];
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const fields = PROTOCOL_FIELDS[protocol] ?? [];
  return (
    <form action={action} className="space-y-4 rounded-xl border border-app bg-app-elevated p-5">
      {config?.id && <input type="hidden" name="id" value={config.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Display name"
          hint="Shown to users on the sign-in screen."
        >
          <input
            type="text"
            name="display_name"
            required
            defaultValue={config?.display_name ?? ""}
            placeholder="e.g. Okta · Acme Corp"
            className={inputClass}
          />
        </Field>

        <Field
          label="Workspace"
          hint="Empty / Global = applies to the whole platform. Pick a workspace for tenant-scoped SSO."
        >
          <select
            name="workspace_id"
            defaultValue={config?.workspace_id ?? "_global"}
            className={inputClass}
          >
            <option value="_global">— Global (no workspace) —</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Protocol">
          {/* On NEW we render a select (the page also offers a GET form
              above to reload field set). On EDIT we lock to the saved
              protocol — to switch, delete the row and re-create. */}
          <select
            name="protocol"
            defaultValue={protocol}
            className={inputClass}
          >
            {PROTOCOLS.map((p) => (
              <option key={p} value={p}>
                {PROTOCOL_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status">
          <select
            name="status"
            defaultValue={config?.status ?? "pending"}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-app bg-app p-4">
        <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
          {PROTOCOL_LABEL[protocol]} fields
        </legend>
        {fields.map((key) => {
          const value = (config?.[key as keyof SsoConfigRow] as string | null) ?? "";
          if (TEXTAREA_FIELDS.has(key)) {
            return (
              <Field key={key} label={FIELD_LABEL[key]} hint={FIELD_HINT[key]}>
                <textarea
                  name={key}
                  defaultValue={value}
                  rows={6}
                  placeholder={
                    key === "certificate"
                      ? "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"
                      : "<EntityDescriptor xmlns=…>"
                  }
                  className={`${inputClass} font-mono text-[11px]`}
                />
              </Field>
            );
          }
          return (
            <Field key={key} label={FIELD_LABEL[key]} hint={FIELD_HINT[key]}>
              <input
                type="text"
                name={key}
                defaultValue={value}
                placeholder={placeholderFor(key)}
                className={`${inputClass} ${
                  key === "client_id" || key === "client_secret_env"
                    ? "font-mono"
                    : ""
                }`}
              />
            </Field>
          );
        })}
      </fieldset>

      <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
        <a href="/admin/sso" className={buttonGhostClass}>
          Cancel
        </a>
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function placeholderFor(key: string): string {
  switch (key) {
    case "entity_id":
      return "https://idp.example.com/saml/metadata";
    case "sso_url":
      return "https://idp.example.com/sso";
    case "client_id":
      return "abc123.apps.googleusercontent.com";
    case "client_secret_env":
      return "GOOGLE_OAUTH_SECRET";
    default:
      return "";
  }
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}
