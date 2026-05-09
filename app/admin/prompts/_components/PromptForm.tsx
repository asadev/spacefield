"use client";

import { useState } from "react";

import type { PromptLibraryRow } from "../../_types";
import { buttonClass, inputClass } from "./_styles";

/**
 * Edit-form for prompt_library metadata. Used by both
 * `/admin/prompts/new` (create mode — also shows body + variables) and
 * `/admin/prompts/[id]` (edit mode — body lives in the version editor).
 */

export type PromptFormMode = "create" | "edit";

export type PromptFormProps = {
  mode: PromptFormMode;
  action: (formData: FormData) => void;
  prompt?: PromptLibraryRow | null;
};

const DEFAULT_PROMPT = {
  id: "",
  display_name: "",
  description: "",
  category: "general",
  tags: [] as string[],
  status: "draft" as const,
};

export default function PromptForm({
  mode,
  action,
  prompt,
}: PromptFormProps) {
  const initial = prompt ?? DEFAULT_PROMPT;

  const [id, setId] = useState(initial.id);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [tags, setTags] = useState((initial.tags ?? []).join(", "));
  const [status, setStatus] = useState<"live" | "draft" | "archived">(
    initial.status
  );

  const [body, setBody] = useState("");
  const [variables, setVariables] = useState("");

  return (
    <form
      action={action}
      className="space-y-6 rounded-xl border border-app bg-app-elevated p-5"
    >
      {mode === "edit" && (
        <input type="hidden" name="id" value={initial.id} />
      )}

      <section className="space-y-4">
        <header>
          <h2 className="text-sm font-semibold text-app">Identity</h2>
          <p className="mt-0.5 text-xs text-muted">
            Identifier and human labels. The id is referenced by every
            workflow step and version row — make it stable.
          </p>
        </header>

        {mode === "create" && (
          <Field label="Prompt id" hint="lowercase, alphanum + . _ -">
            <input
              name="id"
              required
              maxLength={64}
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. cold_outreach_v1"
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}

        <Field label="Display name" hint="What admins see in lists.">
          <input
            name="display_name"
            required
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field label="Description" hint="One-paragraph summary.">
          <textarea
            name="description"
            rows={2}
            maxLength={400}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Category">
            <input
              name="category"
              maxLength={64}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          <Field label="Status">
            <select
              name="status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "live" | "draft" | "archived")
              }
              className={inputClass}
            >
              <option value="draft">draft</option>
              <option value="live">live</option>
              <option value="archived">archived</option>
            </select>
          </Field>
        </div>

        <Field
          label="Tags"
          hint="Comma- or newline-separated. Used for filtering and search."
        >
          <input
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="cold-outreach, sales, b2b"
            className={inputClass}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      </section>

      {mode === "create" && (
        <>
          <hr className="border-app" />
          <section className="space-y-4">
            <header>
              <h2 className="text-sm font-semibold text-app">First version</h2>
              <p className="mt-0.5 text-xs text-muted">
                Saving creates a <code className="font-mono">prompt_versions</code>{" "}
                row with version=1 and sets the prompt&apos;s{" "}
                <code className="font-mono">current_version</code> to 1.
              </p>
            </header>

            <Field
              label="Body (required)"
              hint="Use {{variable}} placeholders. Variables are auto-detected on save if you leave the variables field blank."
            >
              <textarea
                name="body"
                required
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${inputClass} resize-y font-mono text-xs`}
                spellCheck={false}
                placeholder="You are a helpful assistant. The user&apos;s name is {{user_name}}…"
              />
            </Field>

            <Field
              label="Variables (optional)"
              hint="One per line, or comma-separated. Leave blank to auto-detect from {{var}} patterns in the body."
            >
              <textarea
                name="variables"
                rows={3}
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                className={`${inputClass} resize-y font-mono text-xs`}
                spellCheck={false}
                placeholder="user_name&#10;company&#10;tone"
              />
            </Field>
          </section>
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="submit" className={buttonClass}>
          {mode === "create" ? "Create prompt" : "Save changes"}
        </button>
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
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}
