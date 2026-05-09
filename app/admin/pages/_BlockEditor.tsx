import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type {
  AdminPageBlockKind,
  AdminPageBlockRow,
} from "../_types";
import {
  addBlock,
  deleteBlock,
  moveBlock,
  updateBlock,
} from "./_actions";

const BLOCK_KIND_OPTIONS: ReadonlyArray<{
  value: AdminPageBlockKind;
  label: string;
  hint: string;
}> = [
  { value: "kpi", label: "KPI card", hint: "Single number from a SELECT." },
  { value: "table", label: "Table", hint: "Tabular data from a SELECT." },
  { value: "chart", label: "Chart", hint: "Line or bar from a SELECT." },
  { value: "markdown", label: "Markdown", hint: "Static prose / docs / brief." },
  { value: "button", label: "Button", hint: "Run an RPC, queue a workflow, or link." },
  { value: "iframe", label: "Iframe", hint: "Embed an external dashboard." },
  { value: "form", label: "Form", hint: "Capture input + POST to an RPC." },
  { value: "divider", label: "Divider", hint: "Horizontal rule." },
];

/* Templates seed the config textarea with a useful starting point. */
const CONFIG_TEMPLATES: Record<AdminPageBlockKind, string> = {
  kpi: JSON.stringify(
    {
      sql: "select count(*)::int as value from auth.users limit 1",
      label: "Total users",
      format: "number",
      currency: "USD",
    },
    null,
    2
  ),
  table: JSON.stringify(
    {
      sql: "select id, email, created_at from auth.users order by created_at desc limit 50",
      columns: [
        { key: "id", label: "ID" },
        { key: "email", label: "Email" },
        { key: "created_at", label: "Created", format: "datetime" },
      ],
    },
    null,
    2
  ),
  chart: JSON.stringify(
    {
      sql: "select day, signups from public.daily_signups order by day asc limit 30",
      x: "day",
      y: ["signups"],
      chart_type: "line",
    },
    null,
    2
  ),
  markdown: JSON.stringify(
    { body: "## Notes\n\nWrite anything here." },
    null,
    2
  ),
  button: JSON.stringify(
    {
      label: "Refresh cache",
      action_kind: "rpc",
      target: "refresh_admin_cache",
      confirm: "Refresh the admin cache?",
    },
    null,
    2
  ),
  iframe: JSON.stringify(
    { url: "https://status.example.com", height: 480 },
    null,
    2
  ),
  form: JSON.stringify(
    {
      fields: [
        { name: "user_id", label: "User UUID", type: "text", required: true },
        { name: "reason", label: "Reason", type: "textarea" },
      ],
      submit_label: "Submit",
      submit_target: "support_force_logout",
    },
    null,
    2
  ),
  divider: "{}",
};

/**
 * Block editor sub-tree. Renders:
 *   - "+ Add block" form (kind picker + title + sort_order).
 *   - One <details> per existing block with a per-block edit form,
 *     up/down/delete buttons.
 *
 * Each form posts to a server action declared in `_actions.ts`. We don't
 * use any client JS — every change is a round-trip. Live preview lives
 * in the page-level component (`_BlockPreview`).
 */
export function BlockEditor({
  pageId,
  blocks,
}: {
  pageId: string;
  blocks: AdminPageBlockRow[];
}) {
  return (
    <div className="space-y-4">
      <AddBlockForm pageId={pageId} nextSortOrder={
        blocks.length > 0 ? Math.max(...blocks.map((b) => b.sort_order)) + 1 : 0
      } />

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app bg-app-elevated p-8 text-center">
          <div className="text-sm font-medium text-app">No blocks yet.</div>
          <div className="mt-1 text-[11px] text-muted">
            Add the first block above.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {blocks.map((b, i) => (
            <li key={b.id}>
              <BlockCard
                block={b}
                isFirst={i === 0}
                isLast={i === blocks.length - 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddBlockForm({
  pageId,
  nextSortOrder,
}: {
  pageId: string;
  nextSortOrder: number;
}) {
  return (
    <details className="rounded-xl border border-dashed border-app bg-app-elevated p-4">
      <summary className="cursor-pointer text-sm font-medium text-app">
        + Add block
      </summary>
      <form action={addBlock} className="mt-4 space-y-3">
        <input type="hidden" name="page_id" value={pageId} />
        <input
          type="hidden"
          name="sort_order"
          value={nextSortOrder}
          readOnly
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Kind
            </span>
            <select name="kind" defaultValue="kpi" className={inputClass}>
              {BLOCK_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Title (optional)
            </span>
            <input
              type="text"
              name="title"
              maxLength={140}
              placeholder="Active users"
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Config JSON (you can edit after creating — templates per kind)
          </span>
          <textarea
            name="config"
            rows={8}
            defaultValue={CONFIG_TEMPLATES.kpi}
            className={`${inputClass} resize-y font-mono text-[11px]`}
          />
          <span className="text-[10px] text-faint">
            Tip: pick a kind first, then edit this JSON. Templates for each
            kind are shown after the block is created.
          </span>
        </label>

        <div className="flex items-center justify-end">
          <button type="submit" className={buttonClass}>
            Add block
          </button>
        </div>
      </form>
    </details>
  );
}

function BlockCard({
  block,
  isFirst,
  isLast,
}: {
  block: AdminPageBlockRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const cfgPreview = previewConfig(block);
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex flex-wrap items-center gap-2 border-b border-app px-4 py-3">
        <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tool-accent">
          {block.kind}
        </span>
        <span className="text-sm font-medium text-app">
          {block.title ?? <span className="text-muted">untitled block</span>}
        </span>
        <span className="ml-auto font-mono text-[10px] text-faint">
          #{block.sort_order} · {block.id.slice(0, 8)}
        </span>
      </div>
      {cfgPreview ? (
        <div className="border-b border-app px-4 py-2 font-mono text-[11px] text-muted">
          {cfgPreview}
        </div>
      ) : null}

      <details className="px-4 py-3">
        <summary className="cursor-pointer text-xs text-secondary">
          Edit block
        </summary>
        <form action={updateBlock} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={block.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Kind
              </span>
              <select
                name="kind"
                defaultValue={block.kind}
                className={inputClass}
              >
                {BLOCK_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Title
              </span>
              <input
                type="text"
                name="title"
                defaultValue={block.title ?? ""}
                maxLength={140}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Config (JSON)
            </span>
            <textarea
              name="config"
              rows={10}
              defaultValue={JSON.stringify(block.config ?? {}, null, 2)}
              className={`${inputClass} resize-y font-mono text-[11px]`}
            />
            <span className="text-[10px] text-faint">
              {configHint(block.kind)}
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-app">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                Sort order
              </span>
              <input
                type="number"
                name="sort_order"
                defaultValue={block.sort_order}
                className={`${inputClass} h-9 w-24 font-mono`}
              />
            </label>
            <button type="submit" className={buttonClass}>
              Save block
            </button>
          </div>
        </form>
      </details>

      <div className="flex flex-wrap items-center gap-2 border-t border-app px-4 py-2">
        {!isFirst ? (
          <form action={moveBlock}>
            <input type="hidden" name="id" value={block.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" className={`${buttonGhostClass} h-7`}>
              ↑ Move up
            </button>
          </form>
        ) : null}
        {!isLast ? (
          <form action={moveBlock}>
            <input type="hidden" name="id" value={block.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" className={`${buttonGhostClass} h-7`}>
              ↓ Move down
            </button>
          </form>
        ) : null}
        <form action={deleteBlock} className="ml-auto">
          <input type="hidden" name="id" value={block.id} />
          <button
            type="submit"
            className="h-7 rounded-md border border-app bg-app px-2.5 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}

function previewConfig(block: AdminPageBlockRow): string {
  const cfg = (block.config ?? {}) as Record<string, unknown>;
  switch (block.kind) {
    case "kpi": {
      const c = cfg as { sql?: string; label?: string };
      return [c.label ? `label: ${c.label}` : null, c.sql ? truncSql(c.sql) : null]
        .filter(Boolean)
        .join("  ·  ");
    }
    case "table":
    case "chart": {
      const c = cfg as { sql?: string };
      return c.sql ? truncSql(c.sql) : "(no SQL configured)";
    }
    case "markdown": {
      const c = cfg as { body?: string };
      const head = (c.body ?? "").slice(0, 80).replace(/\n/g, " ");
      return head ? `“${head}…”` : "(empty)";
    }
    case "button": {
      const c = cfg as { label?: string; action_kind?: string; target?: string };
      return `${c.label ?? "(no label)"}  →  ${c.action_kind ?? "rpc"}: ${c.target ?? "(no target)"}`;
    }
    case "iframe": {
      const c = cfg as { url?: string };
      return c.url ?? "(no URL)";
    }
    case "form": {
      const c = cfg as { fields?: { name?: string }[]; submit_target?: string };
      const names = (c.fields ?? []).map((f) => f.name).filter(Boolean).join(", ");
      return `${names || "(no fields)"}  →  ${c.submit_target ?? "(no target)"}`;
    }
    case "divider":
      return "";
    default:
      return "";
  }
}

function truncSql(s: string): string {
  const oneline = s.replace(/\s+/g, " ").trim();
  return oneline.length > 100 ? `${oneline.slice(0, 100)}…` : oneline;
}

function configHint(kind: AdminPageBlockKind): string {
  switch (kind) {
    case "kpi":
      return 'Shape: { sql, label, format: "number"|"currency"|"percent", currency? }. SQL must be SELECT-only.';
    case "table":
      return 'Shape: { sql, columns: [{ key, label?, format? }] }.';
    case "chart":
      return 'Shape: { sql, x, y: string[], chart_type: "line"|"bar" }.';
    case "markdown":
      return "Shape: { body }. Same renderer as the help center.";
    case "button":
      return 'Shape: { label, action_kind: "rpc"|"workflow"|"href", target, confirm? }.';
    case "iframe":
      return "Shape: { url, height }. Sandboxed.";
    case "form":
      return 'Shape: { fields: [{ name, label, type }], submit_label, submit_target }.';
    case "divider":
      return "No config.";
  }
}
