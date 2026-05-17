"use client";

import { useActionState } from "react";

import { requestEmailChange, type ActionResult } from "../_actions";

/* EmailChangeCard — Client form that calls the requestEmailChange
 * server action. Uses useActionState so we get the latest result back
 * without a custom fetch; the action revalidates /account itself on
 * success, so the next render reflects whatever changed.
 */

const inputClass =
  "w-full rounded-lg border border-app bg-app px-3 py-2 text-sm outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export default function EmailChangeCard({
  currentEmail,
}: {
  currentEmail: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ sentTo: string }> | null,
    FormData
  >(requestEmailChange, null);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted">
          Current email
        </label>
        <div className="mt-1 truncate rounded-lg border border-app bg-app px-3 py-2 text-sm">
          {currentEmail}
        </div>
      </div>

      <div>
        <label
          htmlFor="account-new-email"
          className="block text-xs font-medium text-muted"
        >
          New email
        </label>
        <input
          id="account-new-email"
          type="email"
          name="new_email"
          required
          autoComplete="email"
          placeholder="you@newdomain.com"
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send confirmation"}
        </button>
        {state?.ok ? (
          <span className="text-xs text-emerald-500">
            Confirmation sent to {state.sentTo}. Click the link to finish.
          </span>
        ) : state && !state.ok ? (
          <span className="text-xs text-rose-500">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
