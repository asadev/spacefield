"use client";

/**
 * Inline catalog of canned sample inputs admins can drop into ToolTester
 * to verify shape without typing. Click a sample → onPick fires with the
 * input object. The list is intentionally short and pattern-based — not
 * tool-specific — so it stays useful as new tools are added.
 */

export type SampleInput = {
  id: string;
  label: string;
  description: string;
  payload: Record<string, unknown>;
};

const DEFAULT_SAMPLES: SampleInput[] = [
  {
    id: "lookup_user",
    label: "Lookup user by email",
    description: "Pattern for read-by-key tools.",
    payload: { email: "demo@example.com" },
  },
  {
    id: "lookup_id",
    label: "Lookup by id",
    description: "Generic id-based lookup.",
    payload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    id: "create_record",
    label: "Create record",
    description: "Generic create with name + free-form fields.",
    payload: { name: "Sample", fields: {} },
  },
  {
    id: "update_record",
    label: "Update record",
    description: "Apply a partial patch to an existing record.",
    payload: {
      id: "00000000-0000-0000-0000-000000000000",
      patch: { name: "Updated" },
    },
  },
  {
    id: "list_paginated",
    label: "List with pagination",
    description: "Standard limit + offset shape.",
    payload: { limit: 10, offset: 0 },
  },
  {
    id: "search_query",
    label: "Search query",
    description: "Free-text query with optional filters.",
    payload: { query: "hello world", filters: {} },
  },
  {
    id: "delete_by_id",
    label: "Delete by id",
    description: "Single id, no body.",
    payload: { id: "00000000-0000-0000-0000-000000000000" },
  },
  {
    id: "send_message",
    label: "Send message",
    description: "Notification / email / chat dispatch.",
    payload: {
      to: "demo@example.com",
      subject: "Test",
      body: "Hello from the tool tester.",
    },
  },
  {
    id: "empty_object",
    label: "Empty input",
    description: "For tools that take no arguments.",
    payload: {},
  },
];

export type SampleInputCatalogProps = {
  onPick: (payload: Record<string, unknown>) => void;
  /** Override the catalog. */
  samples?: SampleInput[];
};

export default function SampleInputCatalog({
  onPick,
  samples,
}: SampleInputCatalogProps) {
  const list = samples && samples.length > 0 ? samples : DEFAULT_SAMPLES;
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        Sample inputs
      </div>
      <div className="flex flex-wrap gap-2">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.payload)}
            title={s.description}
            className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-[11px] font-medium text-app transition-colors hover:border-tool-accent"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
