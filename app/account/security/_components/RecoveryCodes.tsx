"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import {
  regenerateRecoveryCodesAction,
  type ActionResult,
} from "../_actions";

/* RecoveryCodes — shows the remaining-code count and the regenerate
 * button. New codes are returned by the server action and rendered
 * exactly once; the user has to confirm they saved them before the
 * panel collapses back to the count.
 *
 * Regenerate is gated on `requireRecentAuth()`. If the gate fires the
 * action returns `{ ok: false, reauth: url }` and we navigate there;
 * after the reauth round-trip the user lands back on /account/security
 * and can click the button again.
 */

export default function RecoveryCodes({
  remaining,
  hasTotp,
}: {
  remaining: number;
  hasTotp: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult<{ codes: string[] }> | null,
    FormData
  >(async (_prev) => regenerateRecoveryCodesAction(_prev), null);

  const [acknowledged, setAcknowledged] = useState(false);

  // Reauth bounce — same trick as FactorList.
  if (state && !state.ok && state.reauth && typeof window !== "undefined") {
    router.push(state.reauth);
  }

  if (state?.ok) {
    return (
      <CodesGrid
        codes={state.codes}
        acknowledged={acknowledged}
        setAcknowledged={setAcknowledged}
        onDone={() => {
          setAcknowledged(false);
          router.refresh();
        }}
      />
    );
  }

  const description = !hasTotp
    ? "Enroll an authenticator first — recovery codes only help once you have 2FA enabled."
    : remaining === 0
      ? "No active recovery codes. Generate a batch to unlock the backup."
      : `${remaining} unused code${remaining === 1 ? "" : "s"} remaining.`;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm text-muted">{description}</p>
      <button
        type="submit"
        disabled={pending || !hasTotp}
        className="rounded-lg border border-app bg-app px-4 py-2 text-sm font-medium transition-colors hover:bg-app-elevated disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending
          ? "Generating…"
          : remaining > 0
            ? "Regenerate codes"
            : "Generate codes"}
      </button>
      {state && !state.ok && !state.reauth ? (
        <span className="w-full text-xs text-rose-500">{state.error}</span>
      ) : null}
    </form>
  );
}

function CodesGrid({
  codes,
  acknowledged,
  setAcknowledged,
  onDone,
}: {
  codes: string[];
  acknowledged: boolean;
  setAcknowledged: (b: boolean) => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — fall back to manual select.
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium text-amber-700">
        New recovery codes. Save them now.
      </p>
      <p className="mt-1 text-xs text-muted">
        Any old un-used codes have been invalidated. These won&apos;t be
        shown again.
      </p>

      <pre className="mt-3 grid grid-cols-2 gap-2 rounded border border-app bg-app p-3 font-mono text-xs">
        {codes.map((c) => (
          <span key={c} className="select-all">{c}</span>
        ))}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copyAll}
          className="rounded-lg border border-app bg-app px-3 py-1.5 text-xs font-medium hover:bg-app-elevated"
        >
          {copied ? "Copied" : "Copy all"}
        </button>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>I&apos;ve saved these somewhere safe</span>
        </label>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={onDone}
          className="rounded-lg bg-tool-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
