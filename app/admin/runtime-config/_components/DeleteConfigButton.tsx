"use client";

import { useTransition } from "react";

import { deleteConfig } from "../_actions";

/**
 * Confirm-then-delete client wrapper. Keeps the destructive action
 * inside a tiny client island so the rest of the per-key page stays
 * server-rendered.
 */
export default function DeleteConfigButton({
  configKey,
}: {
  configKey: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(
      `Delete config "${configKey}"? Code that calls getRuntimeConfig("${configKey}") will fall back to its default. This cannot be undone.`
    );
    if (!ok) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await deleteConfig(fd);
    });
  }

  return (
    <form action={deleteConfig} onSubmit={onSubmit}>
      <input type="hidden" name="key" value={configKey} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete config"}
      </button>
    </form>
  );
}
