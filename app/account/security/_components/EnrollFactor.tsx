"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  startTotpEnrollment,
  confirmTotpEnrollment,
  type ActionResult,
  type StartEnrollmentSuccess,
} from "../_actions";

/* EnrollFactor — wraps the "Add authenticator" button and the two-step
 * enroll flow (start → verify). Disabled when the user already has a
 * verified TOTP factor; the Supabase auth backend allows multiple
 * factors but our policy is one-per-user for simplicity.
 *
 * Flow:
 *   1. Click "Add authenticator" → calls startTotpEnrollment server
 *      action, which returns a factor_id + QR + secret.
 *   2. We render the QR image and ask the user to type the 6-digit
 *      code their authenticator generated.
 *   3. Submit → confirmTotpEnrollment verifies the code, regenerates
 *      recovery codes, and we hand off the displayed-once recovery
 *      codes to a sub-component for the user to save.
 */

export default function EnrollFactor({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<StartEnrollmentSuccess | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startPending, startStartTransition] = useTransition();

  const handleStart = () => {
    setStartError(null);
    startStartTransition(async () => {
      const r = await startTotpEnrollment();
      if (!r.ok) {
        setStartError(r.error);
        return;
      }
      setEnrollment({
        factorId: r.factorId,
        qrCode: r.qrCode,
        secret: r.secret,
        uri: r.uri,
      });
    });
  };

  if (!enrollment) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled || startPending}
          className="rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {disabled
            ? "Authenticator added"
            : startPending
              ? "Starting…"
              : "Add authenticator app"}
        </button>
        {startError ? (
          <span className="text-xs text-rose-500">{startError}</span>
        ) : null}
      </div>
    );
  }

  return (
    <VerifyEnrollmentForm
      enrollment={enrollment}
      onCancel={() => setEnrollment(null)}
      onSuccess={() => {
        setEnrollment(null);
        router.refresh();
      }}
    />
  );
}

function VerifyEnrollmentForm({
  enrollment,
  onCancel,
  onSuccess,
}: {
  enrollment: StartEnrollmentSuccess;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ recoveryCodes: string[] }> | null,
    FormData
  >(confirmTotpEnrollment, null);

  // Successful enrollment → show recovery codes once, then signal done.
  if (state?.ok) {
    return (
      <PostEnrollmentRecoveryCodes
        codes={state.recoveryCodes}
        onDone={onSuccess}
      />
    );
  }

  // The qr_code field is an SVG data URL. We render with <img> rather
  // than next/image to avoid a remote-loader config dance.
  return (
    <div className="rounded-lg border border-app bg-app p-4">
      <p className="text-sm font-medium">Scan with your authenticator</p>
      <p className="mt-1 text-xs text-faint">
        Or type the secret manually: <code className="rounded bg-app-elevated px-1 font-mono text-[11px]">{enrollment.secret}</code>
      </p>

      <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enrollment.qrCode}
          alt="TOTP QR code"
          width={160}
          height={160}
          className="rounded border border-app bg-white p-2"
        />

        <form action={formAction} className="flex-1 space-y-3">
          <input type="hidden" name="factor_id" value={enrollment.factorId} />
          <div>
            <label htmlFor="totp-code" className="block text-xs font-medium text-muted">
              6-digit code from your app
            </label>
            <input
              id="totp-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              placeholder="123456"
              className="mt-1 w-32 rounded-lg border border-app bg-app px-3 py-2 font-mono text-base tracking-widest outline-none focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Verifying…" : "Verify & enable"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-app bg-app px-3 py-2 text-sm text-muted hover:bg-app-elevated"
            >
              Cancel
            </button>
            {state && !state.ok ? (
              <span className="text-xs text-rose-500">{state.error}</span>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function PostEnrollmentRecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard API — let the user select manually.
    }
  };

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="text-sm font-medium text-emerald-700">
        2FA enabled. Save these recovery codes now.
      </p>
      <p className="mt-1 text-xs text-muted">
        Each works once. If you lose your authenticator and these codes,
        you&apos;ll be locked out — we can&apos;t recover them.
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
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>I&apos;ve saved these somewhere safe</span>
        </label>
        <button
          type="button"
          disabled={!saved}
          onClick={onDone}
          className="rounded-lg bg-tool-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
