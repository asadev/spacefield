"use client";

import { useTransition } from "react";

import { sendCampaign } from "./_actions";

export function SendCampaignButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    if (
      !confirm(
        `Send push campaign "${title}" now? This dispatches notifications to every matching subscriber. There is no undo once dispatched.`
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => {
      void sendCampaign(fd);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? "Dispatching…" : "Send now"}
    </button>
  );
}
