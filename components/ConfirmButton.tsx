"use client";

import { useCallback, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Button that requires the user to confirm before its `onConfirm`
 * handler fires. Two interaction modes:
 *
 *   1. Native (default) — uses `window.confirm()`. Fast to apply across
 *      the codebase and works inside iframed shells (the Spacefield OS
 *      windows). Trade-off: looks like the browser's default modal, not
 *      the in-app chrome.
 *   2. Inline — flips the button into a "Are you sure? • Cancel • Confirm"
 *      state for ~6 seconds. Useful when a native dialog would feel
 *      heavy (e.g. inside a popover) or when you want a slightly less
 *      disruptive UX for "are you sure" prompts.
 *
 * Use `kind="destructive"` for delete/remove flows — adds a rose accent
 * so the danger is obvious without any extra styling on the consumer.
 *
 * Consumers should still respect server confirmations + idempotency
 * (e.g. "type the resource name to delete") for truly irreversible
 * operations. This helper covers the everyday "are you sure?" gap.
 */

type Kind = "default" | "destructive";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "type"
> & {
  /** Called when the user confirms the action. */
  onConfirm: () => void | Promise<void>;
  /** The confirmation prompt. Supports `{n}` substitution for callers. */
  prompt?: string;
  /** Optional substitution for `{n}` in the prompt. */
  count?: number;
  /** Native window.confirm (default) vs inline two-step confirm. */
  mode?: "native" | "inline";
  /** Styling hint — destructive adds a rose accent. */
  kind?: Kind;
  /** Button label. */
  children: ReactNode;
  /**
   * Optional label shown during the second step of the inline mode.
   * Defaults to "Confirm".
   */
  confirmLabel?: string;
};

const INLINE_TIMEOUT_MS = 6000;

export default function ConfirmButton({
  onConfirm,
  prompt = "Are you sure?",
  count,
  mode = "native",
  kind = "default",
  children,
  confirmLabel = "Confirm",
  className,
  disabled,
  ...rest
}: Props) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);

  const resolvedPrompt = prompt.replace(/\{n\}/g, String(count ?? ""));

  const fire = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      setArmed(false);
    }
  }, [onConfirm, pending]);

  const baseClasses = [
    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    kind === "destructive"
      ? "border border-rose-400/40 bg-rose-400/10 text-rose-400 hover:bg-rose-400/20"
      : "border border-app bg-app text-app hover:bg-surface",
  ].join(" ");

  if (mode === "native") {
    return (
      <button
        type="button"
        onClick={async () => {
          if (typeof window !== "undefined" && !window.confirm(resolvedPrompt)) {
            return;
          }
          await fire();
        }}
        className={(className ? className + " " : "") + baseClasses}
        disabled={disabled || pending}
        {...rest}
      >
        {pending ? "Working…" : children}
      </button>
    );
  }

  // Inline two-step.
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          setArmed(true);
          // Auto-disarm after the timeout so a stale "are you sure" UI
          // doesn't sit around forever.
          window.setTimeout(() => setArmed(false), INLINE_TIMEOUT_MS);
        }}
        className={(className ? className + " " : "") + baseClasses}
        disabled={disabled || pending}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-secondary">{resolvedPrompt}</span>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md border border-app bg-app px-2 py-1 text-[11px] text-app hover:bg-surface"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className={
          "rounded-md px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50 " +
          (kind === "destructive" ? "bg-rose-500" : "bg-tool-accent")
        }
      >
        {pending ? "Working…" : confirmLabel}
      </button>
    </span>
  );
}
