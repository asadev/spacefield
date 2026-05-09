import Link from "next/link";

import {
  buttonClass,
  buttonGhostClass,
  inputClass,
} from "../../_lib";

import { EMAIL_ROLES } from "../../_types";
import type {
  EmailCategory,
  EmailRole,
  EmailTemplateRow,
} from "../../_types";

const CATEGORIES: EmailCategory[] = [
  "transactional",
  "marketing",
  "auth",
  "notification",
  "digest",
];

type EditorTemplate = Pick<
  EmailTemplateRow,
  | "key"
  | "display_name"
  | "description"
  | "category"
  | "role"
  | "subject"
  | "html"
  | "plain_text"
  | "variables_json"
  | "enabled"
  | "locale"
>;

interface TemplateEditorFormProps {
  /** Initial values. For new template, use blank defaults. */
  template: EditorTemplate;
  /** Whether the key field is editable (true on /new, false on /[key]). */
  keyEditable: boolean;
  /** Server-action that handles submit. */
  // eslint-disable-next-line no-unused-vars
  action: (formData: FormData) => Promise<void>;
  /** Submit button label. */
  submitLabel: string;
}

/**
 * The shared editor body. Used both by `/admin/emails/new` (blank) and
 * `/admin/emails/[key]` (populated). Server component — no interactivity
 * beyond native form fields.
 */
export function TemplateEditorForm({
  template,
  keyEditable,
  action,
  submitLabel,
}: TemplateEditorFormProps) {
  return (
    <form action={action} className="space-y-4">
      {!keyEditable && (
        <input type="hidden" name="key" value={template.key} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Key"
          hint={
            keyEditable
              ? "Stable identifier. Lowercase, dots, dashes, underscores."
              : "The key is the primary identifier — it can't be changed."
          }
        >
          <input
            type="text"
            name="key"
            required={keyEditable}
            defaultValue={template.key}
            disabled={!keyEditable}
            placeholder="welcome_v2"
            pattern="^[a-z][a-z0-9_.\-]*$"
            className={`${inputClass} font-mono ${
              keyEditable ? "" : "opacity-60"
            }`}
          />
        </Field>
        <Field
          label="Enabled"
          hint="When off, sendTemplate() returns null without firing."
        >
          <label className="flex h-[42px] items-center gap-3 rounded-lg border border-app bg-app px-3 text-sm text-app">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={template.enabled}
              className="h-4 w-4 rounded border-app accent-tool-accent"
            />
            <span>Template is active</span>
          </label>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Display name" hint="Shown in admin UI.">
          <input
            type="text"
            name="display_name"
            required
            defaultValue={template.display_name}
            placeholder="Welcome email"
            className={inputClass}
          />
        </Field>
        <Field label="Locale">
          <input
            type="text"
            name="locale"
            defaultValue={template.locale || "en"}
            placeholder="en"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>

      <Field label="Description" hint="Internal note — not sent to users.">
        <textarea
          name="description"
          rows={2}
          defaultValue={template.description}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Category">
          <select
            name="category"
            defaultValue={template.category}
            className={`${inputClass} appearance-none`}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sender role" hint="Which from-address Resend uses.">
          <select
            name="role"
            defaultValue={template.role}
            className={`${inputClass} appearance-none`}
          >
            {EMAIL_ROLES.map((r: EmailRole) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Subject"
        hint="Use {{variable}} for substitution. Same vars list as body."
      >
        <input
          type="text"
          name="subject"
          required
          defaultValue={template.subject}
          placeholder="Welcome to Space Field, {{name}}"
          className={inputClass}
        />
      </Field>

      <Field
        label="HTML body"
        hint="Inline-styled HTML. {{variable}} tokens substituted at send time."
      >
        <textarea
          name="html"
          rows={18}
          spellCheck={false}
          defaultValue={template.html}
          placeholder="<div style=...>...</div>"
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </Field>

      <Field
        label="Plain-text fallback"
        hint="Optional. If blank, Resend auto-derives from the HTML."
      >
        <textarea
          name="plain_text"
          rows={6}
          spellCheck={false}
          defaultValue={template.plain_text ?? ""}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <Field
        label="Variables"
        hint="One per line. Used by the preview + test-send forms below."
      >
        <textarea
          name="variables_json"
          rows={4}
          spellCheck={false}
          defaultValue={template.variables_json.join("\n")}
          placeholder={"name\nworkspaceName\nacceptUrl"}
          className={`${inputClass} font-mono text-xs`}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" className={buttonClass}>
          {submitLabel}
        </button>
        <Link href="/admin/emails" className={buttonGhostClass}>
          Back to templates
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
