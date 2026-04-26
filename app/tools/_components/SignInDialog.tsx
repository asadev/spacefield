"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./useAuth";

/* Sign-in dialog. Email magic-link flow.
 *
 * Trade-offs:
 * - No password to manage.
 * - Single field, single click. Lowest possible signup friction.
 * - User clicks the email link, lands back on spacefield.co with a
 *   live session. Auth state change fires, useAuth hydrates the user,
 *   sync layer kicks in and pushes localStorage workspaces to cloud.
 *
 * Portaled to <body> with z-[80] so it sits above the back-layer
 * topbar / dock and any open windows. */

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SignInDialog({ open, onClose }: Props) {
  const { signInWithEmail, enabled } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setStatus("idle");
    setErrorMsg(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || status === "sending") return;
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      await signInWithEmail(trimmed);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send link");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-in-title"
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <motion.form
              initial={{ scale: 0.96, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onSubmit={submit}
              className="w-full max-w-md rounded-2xl border border-app bg-app-elevated p-6 shadow-2xl"
            >
              <h2
                id="sign-in-title"
                className="text-lg font-semibold text-app"
              >
                Sign in to Space Field
              </h2>
              <p className="mt-1 text-sm text-secondary">
                Sign in to sync your workspaces across devices. Your local
                workspace stays exactly as it is — signing in just adds cloud
                sync on top.
              </p>

              {status === "sent" ? (
                <div className="mt-5 rounded-lg border border-app bg-tool-accent-soft p-4 text-sm text-app">
                  Magic link sent to <strong>{email}</strong>. Check your
                  inbox and click the link to sign in.
                </div>
              ) : (
                <>
                  <label className="mt-5 block">
                    <span className="text-[0.72rem] uppercase tracking-[0.14em] text-muted">
                      Email
                    </span>
                    <input
                      ref={inputRef}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourbusiness.com"
                      disabled={status === "sending"}
                      className="mt-1 block w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none focus:ring-2 focus:ring-tool-accent-soft disabled:opacity-60"
                    />
                  </label>

                  {errorMsg && (
                    <div className="mt-3 rounded-lg border border-app bg-app px-3 py-2 text-sm text-app">
                      {errorMsg}
                    </div>
                  )}

                  {!enabled && (
                    <div className="mt-3 rounded-lg border border-app bg-app px-3 py-2 text-xs text-muted">
                      Sign-in isn't configured for this build. Set
                      NEXT_PUBLIC_SUPABASE_URL and
                      NEXT_PUBLIC_SUPABASE_ANON_KEY to enable.
                    </div>
                  )}
                </>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-app bg-app px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface hover:text-app"
                >
                  {status === "sent" ? "Close" : "Cancel"}
                </button>
                {status !== "sent" && (
                  <button
                    type="submit"
                    disabled={!enabled || status === "sending"}
                    className="rounded-lg bg-tool-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {status === "sending" ? "Sending…" : "Send magic link"}
                  </button>
                )}
              </div>
            </motion.form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
