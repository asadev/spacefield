"use client";

import { useState } from "react";

import { buttonClass, inputClass } from "./_styles";

/**
 * Inline editor for creating a new prompt version. Pre-fills with the
 * current body so the admin can iterate from the latest known-good text.
 *
 * Submitting calls the `createVersion` server action; the optional
 * "promote" toggle updates `prompt_library.current_version` in the same
 * transaction.
 */

export type NewVersionFormProps = {
  promptId: string;
  currentBody: string;
  currentVariables: string[];
  /** Server action — passed in from the page. */
  action: (formData: FormData) => void;
};

export default function NewVersionForm({
  promptId,
  currentBody,
  currentVariables,
  action,
}: NewVersionFormProps) {
  const [body, setBody] = useState(currentBody);
  const [variables, setVariables] = useState(
    (currentVariables ?? []).join("\n")
  );
  const [notes, setNotes] = useState("");
  const [promote, setPromote] = useState(false);

  // Live variable extraction so admins can see what the parser will pick.
  const detected = extractVars(body);

  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-app bg-app-elevated p-5"
    >
      <input type="hidden" name="id" value={promptId} />

      <header>
        <h2 className="text-sm font-semibold text-app">New version</h2>
        <p className="mt-0.5 text-xs text-muted">
          Body pre-fills with the current version. Saving inserts a new
          <code className="font-mono"> prompt_versions </code>row with the
          next version number. Toggle <em>Promote to current</em> to also
          flip <code className="font-mono">current_version</code>.
        </p>
      </header>

      <Field
        label="Body"
        hint={
          detected.length > 0
            ? `Auto-detected: ${detected.join(", ")}`
            : "No {{variable}} placeholders detected."
        }
      >
        <textarea
          name="body"
          required
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputClass} resize-y font-mono text-xs`}
          spellCheck={false}
        />
      </Field>

      <Field
        label="Variables (optional)"
        hint="One per line. Blank → auto-extract from body."
      >
        <textarea
          name="variables"
          rows={3}
          value={variables}
          onChange={(e) => setVariables(e.target.value)}
          className={`${inputClass} resize-y font-mono text-xs`}
          spellCheck={false}
        />
      </Field>

      <Field
        label="Notes (optional)"
        hint="Short changelog entry — what changed in this version?"
      >
        <input
          name="notes"
          maxLength={400}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tightened intro paragraph; added {{tone}} variable"
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      <label className="flex items-center gap-2 rounded-lg border border-app bg-app/40 p-3 text-xs text-app">
        <input
          type="checkbox"
          name="promote"
          checked={promote}
          onChange={(e) => setPromote(e.target.checked)}
          className="h-4 w-4 rounded border-app accent-tool-accent"
        />
        Promote to current version on save
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="submit" className={buttonClass} disabled={!body.trim()}>
          {promote ? "Save + promote" : "Save as new version"}
        </button>
      </div>
    </form>
  );
}

function extractVars(body: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(m[1]);
  }
  return Array.from(out).sort();
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
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}
