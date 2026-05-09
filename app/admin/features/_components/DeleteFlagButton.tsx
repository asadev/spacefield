"use client";

import { useTransition } from "react";

import { deleteFlag } from "../_actions";

/**
 * Tiny client wrapper that confirms before posting the delete server
 * action. Keeping the dialog in a client island lets the rest of the
 * page stay server-rendered.
 */
export default function DeleteFlagButton({ flagKey }: { flagKey: string }) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      `Delete flag "${flagKey}"? This cannot be undone.`
    );
    if (!ok) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await deleteFlag(fd);
    });
  }

  return (
    <form action={deleteFlag} onSubmit={onSubmit}>
      <input type="hidden" name="key" value={flagKey} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete flag"}
      </button>
    </form>
  );
}
