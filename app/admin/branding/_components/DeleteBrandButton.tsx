"use client";

import { useTransition } from "react";

import { deleteBrand } from "../_actions";

/**
 * Confirms before posting the delete server action. Keeps the dialog
 * in a small client island so the rest of the page stays server.
 */
export default function DeleteBrandButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(
      `Delete brand config "${name}"? This cannot be undone.`
    );
    if (!ok) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await deleteBrand(fd);
    });
  }

  return (
    <form action={deleteBrand} onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
