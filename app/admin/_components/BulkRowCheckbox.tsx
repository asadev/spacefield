"use client";

import { useBulkActionsOptional } from "./BulkActionContext";

/**
 * Tiny checkbox bound to the surrounding `<BulkActionProvider>`. Used
 * inside list rows to select an individual target by id.
 *
 * Renders nothing (rather than throwing) when no provider is mounted,
 * so existing pages can drop it in incrementally without wiring the
 * provider up everywhere first.
 */
export interface BulkRowCheckboxProps {
  id: string;
  /** Optional accessible label, e.g. "Select user alice@example.com". */
  label?: string;
  /** Stop click bubbling so wrapping links/rows don't navigate. Default true. */
  stopPropagation?: boolean;
  className?: string;
}

export default function BulkRowCheckbox({
  id,
  label,
  stopPropagation = true,
  className,
}: BulkRowCheckboxProps) {
  const ctx = useBulkActionsOptional();
  if (!ctx) return null;

  const checked = ctx.isSelected(id);

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={() => ctx.toggle(id)}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      aria-label={label ?? `Select ${id}`}
      className={
        className ??
        "h-4 w-4 cursor-pointer rounded border-app text-tool-accent accent-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
      }
    />
  );
}

/** "Select all on this page" — toggles every passed id into selection. */
export interface BulkSelectAllCheckboxProps {
  ids: string[];
  label?: string;
  className?: string;
}

export function BulkSelectAllCheckbox({
  ids,
  label,
  className,
}: BulkSelectAllCheckboxProps) {
  const ctx = useBulkActionsOptional();
  if (!ctx) return null;

  const selectedOnPage = ids.filter((id) => ctx.isSelected(id)).length;
  const allOnPage = ids.length > 0 && selectedOnPage === ids.length;
  const someOnPage = selectedOnPage > 0 && !allOnPage;

  return (
    <input
      type="checkbox"
      checked={allOnPage}
      ref={(el) => {
        if (el) el.indeterminate = someOnPage;
      }}
      onChange={() => {
        if (allOnPage) {
          // Unselect everything on this page.
          for (const id of ids) ctx.unselect(id);
        } else {
          ctx.selectAll(ids);
        }
      }}
      aria-label={label ?? "Select all on page"}
      className={
        className ??
        "h-4 w-4 cursor-pointer rounded border-app text-tool-accent accent-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
      }
    />
  );
}
