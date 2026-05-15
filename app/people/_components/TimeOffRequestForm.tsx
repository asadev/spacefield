"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { submitTimeOffRequest } from "@/lib/people/actions";
import type { TimeOffPolicy } from "@/lib/people/types";

import { peopleInputClass, peopleButtonClass } from "./styles";

/**
 * Lightweight client form. Calls the server action directly so we don't
 * need to wire a fetch endpoint just to submit a request.
 */
export default function TimeOffRequestForm({
  policies,
}: {
  policies: TimeOffPolicy[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk] = useState<string | null>(null);

  if (policies.length === 0) {
    return (
      <p className="text-sm text-muted">
        No time-off policies are configured yet. Ask your admin to create one
        in <span className="font-mono text-app">/admin/people/policies</span>.
      </p>
    );
  }

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const fd = new FormData(e.currentTarget);
        const policy_id = String(fd.get("policy_id") ?? "");
        const start_date = String(fd.get("start_date") ?? "");
        const end_date = String(fd.get("end_date") ?? "");
        const reason = String(fd.get("reason") ?? "");
        if (!policy_id || !start_date || !end_date) {
          setError("Pick a policy and both dates.");
          return;
        }
        start(async () => {
          const res = await submitTimeOffRequest({
            policy_id,
            start_date,
            end_date,
            reason,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setOk("Submitted. Your manager has been notified.");
          (e.target as HTMLFormElement).reset();
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="uppercase tracking-wide text-faint">Policy</span>
        <select name="policy_id" className={peopleInputClass} defaultValue={policies[0].id}>
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.kind})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide text-faint">Start</span>
        <input type="date" name="start_date" required className={peopleInputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="uppercase tracking-wide text-faint">End</span>
        <input type="date" name="end_date" required className={peopleInputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs sm:col-span-2">
        <span className="uppercase tracking-wide text-faint">Reason (optional)</span>
        <textarea
          name="reason"
          rows={2}
          className={peopleInputClass}
          placeholder="e.g. family event, doctor's appointment"
        />
      </label>
      <div className="sm:col-span-2 flex items-center justify-between gap-3">
        <div className="text-xs">
          {error && <span className="text-rose-500">{error}</span>}
          {okMsg && <span className="text-emerald-500">{okMsg}</span>}
        </div>
        <button type="submit" disabled={pending} className={peopleButtonClass}>
          {pending ? "Submitting…" : "Submit request"}
        </button>
      </div>
    </form>
  );
}
