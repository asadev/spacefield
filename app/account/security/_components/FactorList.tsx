"use client";

import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";

import { disableTotpFactor, type ActionResult } from "../_actions";

/* FactorList — renders the enrolled TOTP factors with a "Remove" button
 * per row. Removal is gated on `requireRecentAuth()` inside the server
 * action; if the user is missing the proof cookie, the action returns
 * `{ ok: false, reauth: url }` and we navigate them to the reauth
 * prompt.
 */

interface FactorRow {
  id: string;
  friendly_name: string | null;
  status: string;
  created_at: string | null;
}

export default function FactorList({ factors }: { factors: FactorRow[] }) {
  if (factors.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-app bg-app px-3 py-4 text-center text-sm text-faint">
        No authenticator app yet. Add one below to enable 2FA.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-app overflow-hidden rounded-lg border border-app">
      {factors.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 bg-app px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {f.friendly_name?.trim() || "Authenticator app"}
            </div>
            <div className="text-xs text-faint">
              Added{" "}
              {f.created_at
                ? new Date(f.created_at).toLocaleDateString()
                : "—"}
            </div>
          </div>
          <RemoveFactorButton factorId={f.id} />
        </li>
      ))}
    </ul>
  );
}

function RemoveFactorButton({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    disableTotpFactor,
    null,
  );

  // If the server action came back with a reauth redirect, navigate.
  // We do this in render so the navigation happens after the action
  // resolves; React batches it correctly.
  if (state && !state.ok && state.reauth) {
    if (typeof window !== "undefined") {
      router.push(state.reauth);
    }
  }

  return (
    <form
      action={(fd) => {
        if (!confirm("Remove this authenticator? You'll need a recovery code or a new authenticator to sign in for 2FA-required actions.")) {
          return;
        }
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="factor_id" value={factorId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state && !state.ok && !state.reauth ? (
        <span className="ms-2 text-xs text-rose-500">{state.error}</span>
      ) : null}
    </form>
  );
}
