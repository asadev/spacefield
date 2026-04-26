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
  const { signInWithEmail, signInWithGoogle, enabled } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "google">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleGoogle = async () => {
    if (!enabled || status === "google" || status === "sending") return;
    setStatus("google");
    setErrorMsg(null);
    try {
      await signInWithGoogle();
      // signInWithGoogle redirects the page; this line is unreachable on success.
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Google sign-in failed");
    }
  };

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
                  {/* Google sign-in — primary path. Single click, no email
                    * round-trip, redirects to Google's consent and back. */}
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={!enabled || status === "google" || status === "sending"}
                    className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-app bg-app px-4 py-2.5 text-sm font-medium text-app transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                    </svg>
                    {status === "google" ? "Redirecting…" : "Continue with Google"}
                  </button>

                  <div className="my-4 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                    <div className="h-px flex-1 bg-app" />
                    or
                    <div className="h-px flex-1 bg-app" />
                  </div>

                  <label className="block">
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
