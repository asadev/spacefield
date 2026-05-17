"use client";

import { useActionState, useState } from "react";

import {
  requestWorkspaceDeletion,
  cancelWorkspaceDeletion,
  type WorkspaceActionResult,
} from "../_actions";
import type { WorkspaceDeletionRequest } from "@/lib/lifecycle";

/* WorkspaceDangerCard — Renders the danger-zone UI for one owned
 * workspace. Two modes:
 *
 *   - No pending request → form: reason + type-workspace-name to confirm
 *   - Pending request    → grace countdown + cancel button
 */

export default function WorkspaceDangerCard({
  workspace,
}: {
  workspace: {
    id: string;
    name: string;
    pending: WorkspaceDeletionRequest | null;
  };
}) {
  if (workspace.pending) {
    return (
      <PendingDeletion
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        pending={workspace.pending}
      />
    );
  }
  return <RequestDeletion workspaceId={workspace.id} workspaceName={workspace.name} />;
}

function RequestDeletion({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [confirm, setConfirm] = useState("");
  const [state, formAction, pending] = useActionState<
    WorkspaceActionResult<{ graceUntil: string; workspaceId: string }> | null,
    FormData
  >(requestWorkspaceDeletion, null);

  const confirmMatches = confirm === workspaceName;

  return (
    <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-500">
            {workspaceName}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Schedules permanent deletion in 30 days. The workspace and
            everything inside it (files, chats, members, tasks) goes away.
            Until then you can cancel from this page.
          </p>
        </div>
      </header>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="expected" value={workspaceName} />

        <div>
          <label
            htmlFor={`ws-${workspaceId}-reason`}
            className="block text-xs font-medium text-muted"
          >
            Reason <span className="text-faint">(optional)</span>
          </label>
          <textarea
            id={`ws-${workspaceId}-reason`}
            name="reason"
            maxLength={500}
            rows={2}
            placeholder="Tell us why — we read these."
            className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 placeholder:text-faint"
          />
        </div>

        <div>
          <label
            htmlFor={`ws-${workspaceId}-confirm`}
            className="block text-xs font-medium text-muted"
          >
            Type the workspace name{" "}
            <span className="font-mono">{workspaceName}</span> to confirm
          </label>
          <input
            id={`ws-${workspaceId}-confirm`}
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
            {pending ? "Submitting…" : "Delete this workspace"}
          </button>
          {state && !state.ok ? (
            <span className="text-xs text-rose-500">{state.error}</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function PendingDeletion({
  workspaceId,
  workspaceName,
  pending,
}: {
  workspaceId: string;
  workspaceName: string;
  pending: WorkspaceDeletionRequest;
}) {
  const grace = new Date(pending.grace_until);
  const days = Math.max(
    0,
    Math.ceil((grace.getTime() - Date.now()) / 86_400_000)
  );

  const [state, formAction, pendingState] = useActionState<
    WorkspaceActionResult<{ workspaceId: string }> | null,
    FormData
  >(cancelWorkspaceDeletion, null);

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-600">
          {workspaceName} — scheduled for deletion
        </h2>
        <p className="mt-1 text-xs text-muted">
          Will be permanently deleted on{" "}
          <strong>{grace.toLocaleString()}</strong> ({days} day
          {days === 1 ? "" : "s"} from now). Cancel below to keep it.
        </p>
        {pending.reason ? (
          <p className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-xs italic text-muted">
            Reason: {pending.reason}
          </p>
        ) : null}
      </header>

      <form action={formAction}>
        <input type="hidden" name="workspace_id" value={workspaceId} />
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
