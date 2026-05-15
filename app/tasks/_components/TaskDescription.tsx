"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  taskId: string;
  initial: string | null;
}

export default function TaskDescription({ taskId, initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    if ((initial ?? "") === value) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description: value || null }),
        });
        if (res.ok) router.refresh();
      } catch {}
    });
  }

  return (
    <div>
      <div className="mb-1 text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        Description
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder="Add details, links, acceptance criteria…"
        rows={6}
        className="w-full resize-y rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none focus:border-tool-accent"
      />
      {pending && (
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
          Saving…
        </div>
      )}
    </div>
  );
}
