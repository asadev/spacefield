"use client";

import { useTransition } from "react";

import { forceClearApproval } from "./_actions";

export default function ApprovalActions({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(e) => {
        e.stopPropagation();
        if (
          !confirm(
            "Force-clear this pending approval? The runtime will treat it as if the user never replied."
          )
        ) {
          return;
        }
        const fd = new FormData();
        fd.set("id", id);
        startTransition(() => {
          void forceClearApproval(fd);
        });
      }}
      className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 text-xs text-app transition-colors hover:border-tool-accent disabled:opacity-50"
    >
      {isPending ? "Clearing…" : "Force-clear"}
    </button>
  );
}
