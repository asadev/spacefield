"use client";

import { useTransition } from "react";

import { deleteLocale } from "../_actions";

export default function DeleteLocaleButton({
  code,
  name,
  isDefault,
}: {
  code: string;
  name: string;
  isDefault: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isDefault) {
      window.alert("Cannot delete the default locale.");
      return;
    }
    const ok = window.confirm(
      `Delete locale "${name}" (${code})? All strings for this locale will be deleted too.`
    );
    if (!ok) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      await deleteLocale(fd);
    });
  }

  return (
    <form action={deleteLocale} onSubmit={onSubmit} className="inline-flex">
      <input type="hidden" name="code" value={code} />
      <button
        type="submit"
        disabled={isPending || isDefault}
        title={isDefault ? "Default locale cannot be deleted" : "Delete"}
        className="rounded-md border border-app bg-app-elevated px-2 py-1 text-[11px] text-secondary transition-colors hover:border-red-500/60 hover:text-red-500 disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
