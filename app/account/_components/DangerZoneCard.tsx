"use client";

import { useActionState, useState } from "react";

import {
  requestAccountDeletion,
  cancelAccountDeletion,
  type ActionResult,
} from "../_actions";
import type { AccountDeletionRequest } from "@/lib/lifecycle";

/* DangerZoneCard — two modes:
 *
 *   1. No pending request → show the destructive form (reason +
 *      email-to-confirm + submit).
 *   2. Pending request    → show grace-period countdown + cancel
 *      button.
 *
 * Type-to-confirm: the submit button stays disabled until the user
 * types their email exactly.
 */

export default function DangerZoneCard({
  currentEmail,
  pendingDeletion,
}: {
  currentEmail: string;
  pendingDeletion: AccountDeletionRequest | null;
}) {
  if (pendingDeletion) {
    return <PendingDeletionView pending={pendingDeletion} />;
  }
  return <RequestDeletionView currentEmail={currentEmail} />;
}

function RequestDeletionView({ currentEmail }: { currentEmail: string }) {
  const [confirm, setConfirm] = useState("");
  const [state, formAction, pending] = useActionState<
    ActionResult<{ graceUntil: string }> | null,
    FormData
  >(requestAccountDeletion, null);

  const confirmMatches =
    confirm.trim().toLowerCase() === currentEmail.toLowerCase();

  return (
    <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-500">
          Danger zone
        </h2>
        <p className="mt-1 text-xs text-muted">
          Deleting your account schedules a hard delete in 30 days. Until
          then you can cancel by visiting this page. After 30 days
          everything — profile, files, workspaces you own — is removed
          and can&apos;t be recovered.
        </p>
      </header>

      <form action={formAction} className="space-y-3">
        <div>
          <label
            htmlFor="account-delete-reason"
            className="block text-xs font-medium text-muted"
          >
            Reason <span className="text-faint">(optional)</span>
          </label>
          <textarea
            id="account-delete-reason"
            name="reason"
            maxLength={500}
            rows={2}
            placeholder="Tell us why — we read these."
            className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 placeholder:text-faint"
          />
        </div>

        <div>
          <label
            htmlFor="account-delete-confirm"
            className="block text-xs font-medium text-muted"
          >
            Type your email <span className="font-mono">{currentEmail}</span>{" "}
            to confirm
          </label>
          <input
            id="account-delete-confirm"
            type="text"
            name="confirm"
            required
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !confirmMatches}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Delete my account"}
          </button>
          {state && !state.ok ? (
            <span className="text-xs text-rose-500">{state.error}</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function PendingDeletionView({ pending }: { pending: AccountDeletionRequest }) {
  const grace = new Date(pending.grace_until);
  const days = Math.max(
    0,
    Math.ceil((grace.getTime() - Date.now()) / 86_400_000)
  );

  const [state, formAction, pendingState] = useActionState<
    ActionResult | null,
    FormData
  >(async () => {
    return await cancelAccountDeletion();
  }, null);

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
          Account scheduled for deletion
        </h2>
        <p className="mt-1 text-xs text-muted">
          Your account will be permanently deleted on{" "}
          <strong>{grace.toLocaleString()}</strong> ({days} day
          {days === 1 ? "" : "s"} from now). Click cancel below to stop it.
        </p>
        {pending.reason ? (
          <p className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs italic text-muted">
            Reason: {pending.reason}
          </p>
        ) : null}
      </header>

      <form action={formAction}>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pendingState}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingState ? "Cancelling…" : "Cancel deletion"}
          </button>
          {state && !state.ok ? (
            <span className="text-xs text-rose-500">{state.error}</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
