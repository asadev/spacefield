"use client";

import { useTransition } from "react";

import { deleteSuite } from "../_actions";

/**
 * Confirm-then-delete client wrapper. Server action handles redirect.
 */
export default function DeleteSuiteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        if (!confirm(`Delete eval suite "${id}"? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
      action={(fd) => {
        start(() => {
          void deleteSuite(fd);
        });
      }}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/15 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete suite"}
      </button>
    </form>
  );
}
