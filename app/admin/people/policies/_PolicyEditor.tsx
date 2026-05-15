"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTimeOffPolicy } from "@/lib/people/actions";

// Inlined from app/admin/_lib.ts — that file pulls in server-only
// admin gating which can't be reached from a client component.
const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";
const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

/**
 * "Add new policy" form. Admins choose a workspace and key inputs;
 * server action does the insert. Updates + deletes are handled by
 * future inline editors per row.
 */
export default function PolicyEditor({
  workspaces,
}: {
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-app bg-app-elevated p-5">
      <h2 className="text-sm font-semibold text-app">Add policy</h2>
      <form
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          const workspace_id = String(fd.get("workspace_id") ?? "");
          const name = String(fd.get("name") ?? "");
          const kind = String(fd.get("kind") ?? "pto");
          const accrual = Number(fd.get("accrual") ?? 20);
          const carryover = Number(fd.get("carryover") ?? 5);
          if (!workspace_id) return setError("Pick a workspace.");
          if (!name) return setError("Name required.");
          start(async () => {
            const res = await createTimeOffPolicy({
              workspace_id,
              name,
              kind: kind as
                | "pto"
                | "sick"
                | "unpaid"
                | "parental"
                | "custom",
              accrual_per_year_days: accrual,
              carryover_max: carryover,
            });
            if (!res.ok) setError(res.error);
            else {
              (e.target as HTMLFormElement).reset();
              router.refresh();
            }
          });
        }}
      >
        <select name="workspace_id" defaultValue="" className={`${inputClass} h-9`}>
          <option value="" disabled>
            Workspace…
          </option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <input name="name" placeholder="Standard PTO" className={`${inputClass} h-9`} />
        <select name="kind" defaultValue="pto" className={`${inputClass} h-9`}>
          <option value="pto">PTO</option>
          <option value="sick">Sick</option>
          <option value="unpaid">Unpaid</option>
          <option value="parental">Parental</option>
          <option value="custom">Custom</option>
        </select>
        <input
          name="accrual"
          type="number"
          step="0.5"
          defaultValue={20}
          placeholder="Accrual / yr"
          className={`${inputClass} h-9`}
        />
        <input
          name="carryover"
          type="number"
          step="0.5"
          defaultValue={5}
          placeholder="Carryover"
          className={`${inputClass} h-9`}
        />
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Add"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </section>
  );
}
