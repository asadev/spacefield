"use client";

import { useActionState, useState } from "react";

import { submitReauth, type ReauthResult } from "./_actions";

/* ReauthForm — client form that posts to the submitReauth server
 * action. Two modes:
 *
 *   - TOTP (default if enrolled): 6-digit numeric input.
 *   - Recovery: alphanumeric input (10 chars + optional dash).
 *
 * Mode toggle is a pair of pill buttons. We don't auto-detect because
 * the user always knows which they're trying to use, and a wrong-mode
 * submission has worse UX than just letting them pick.
 */

export default function ReauthForm({
  next,
  hasTotp,
  hasRecovery,
}: {
  next: string;
  hasTotp: boolean;
  hasRecovery: boolean;
}) {
  const [mode, setMode] = useState<"totp" | "recovery">(hasTotp ? "totp" : "recovery");
  const [state, formAction, pending] = useActionState<ReauthResult | null, FormData>(
    submitReauth,
    null,
  );

  const showToggle = hasTotp && hasRecovery;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="mode" value={mode} />

      {showToggle ? (
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode("totp")}
            className={`flex-1 rounded-lg border px-3 py-2 font-medium transition-colors ${
              mode === "totp"
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app hover:bg-app-elevated"
            }`}
          >
            Authenticator code
          </button>
          <button
            type="button"
            onClick={() => setMode("recovery")}
            className={`flex-1 rounded-lg border px-3 py-2 font-medium transition-colors ${
              mode === "recovery"
                ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                : "border-app bg-app hover:bg-app-elevated"
            }`}
          >
            Recovery code
          </button>
        </div>
      ) : null}

      {mode === "totp" ? (
        <div>
          <label htmlFor="reauth-code" className="block text-xs font-medium text-muted">
            6-digit code from your authenticator app
          </label>
          <input
            id="reauth-code"
            key="totp"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="123456"
            className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
          />
        </div>
      ) : (
        <div>
          <label htmlFor="reauth-code" className="block text-xs font-medium text-muted">
            Recovery code
          </label>
          <input
            id="reauth-code"
            key="recovery"
            name="code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            required
            autoFocus
            placeholder="XXXXX-XXXXX"
            className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-center font-mono text-base tracking-widest uppercase outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
          />
          <p className="mt-1 text-[11px] text-faint">
            Dashes are optional. Codes are single-use.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Verifying…" : "Confirm"}
        </button>
        {state && !state.ok ? (
          <p className="text-center text-xs text-rose-500">{state.error}</p>
        ) : null}
      </div>
    </form>
  );
}
