"use client";

import { useTransition } from "react";

import { deleteString } from "../_actions";

export default function DeleteStringButton({
  code,
  stringKey,
}: {
  code: string;
  stringKey: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(`Delete string "${stringKey}"?`);
    if (!ok) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await deleteString(fd);
    });
  }

  return (
    <form action={deleteString} onSubmit={onSubmit}>
      <input type="hidden" name="locale_code" value={code} />
      <input type="hidden" name="string_key" value={stringKey} />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-red-500/60 hover:text-red-500 disabled:opacity-50"
      >
        {isPending ? "…" : "Delete"}
      </button>
    </form>
  );
}
