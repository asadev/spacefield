"use client";

import { useState } from "react";

import { importSkillsJson } from "../_actions";

/**
 * Client component. Toggle a paste-area for a JSON array of skill rows
 * and submit it to the import action. The server action handles
 * validation; this is just a UI wrapper.
 *
 * The action returns void (revalidates the page on success), so the
 * server-side error path surfaces as a thrown error which Next renders
 * in the error overlay. Inline help below the textarea reminds admins
 * of the row shape.
 */
export default function BulkImportPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-3 py-1.5 text-xs font-medium text-app transition-colors hover:border-tool-accent"
      >
        Import from JSON
      </button>
    );
  }

  return (
    <form
      action={importSkillsJson}
      className="w-full space-y-2 rounded-xl border border-tool-accent bg-app-elevated p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-app">
            Bulk import skills
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Paste a JSON array of skill rows. Existing rows are upserted
            (custom only — code skills keep their source-defined
            tools_json and handler_module). New rows are inserted as
            kind=&apos;custom&apos;. Invalid rows are skipped and listed
            in the audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:text-app"
        >
          Cancel
        </button>
      </div>
      <textarea
        name="payload"
        rows={10}
        spellCheck={false}
        placeholder={EXAMPLE_PAYLOAD}
        className="w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-[11px] leading-relaxed text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint"
      />
      <div className="flex items-center justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Import
        </button>
      </div>
    </form>
  );
}

const EXAMPLE_PAYLOAD = `[
  {
    "id": "my.example",
    "kind": "custom",
    "display_name": "My example skill",
    "description": "What it does in one line.",
    "system_fragment": "You can call my_tool to do X.",
    "category": "general",
    "status": "draft",
    "sort_order": 100,
    "allowed_workspace_roles": ["owner", "admin", "member"],
    "requires_confirmation_default": false,
    "tools_json": [
      {
        "name": "my_tool",
        "description": "Plain-English description for the LLM.",
        "input_schema": { "type": "object", "properties": {}, "additionalProperties": false },
        "read_only": true,
        "handler_kind": "rpc",
        "handler_target": "my_rpc_function"
      }
    ]
  }
]`;
