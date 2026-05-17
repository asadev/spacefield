"use client";

import Link from "next/link";
import { useState } from "react";

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import SpacefieldLogo from "@/app/_components/SpacefieldLogo";

/* /auth/locked
 *
 * Shown after the sign-in handler short-circuits because
 * `is_account_locked(email)` returned true. The user lands here from
 * the failed sign-in flow with `?email=` so we can pre-fill the reset
 * form. They click "Email me a reset link" → we send a Supabase magic
 * link. Verifying that magic link is itself proof-of-email-ownership
 * so the callback handler is the place that clears the lockout.
 *
 * Page is intentionally not server-rendered — we never want a static
 * lockout page baked at build time, and the form is pure client.
 */

export const dynamic = "force-dynamic";

function readQueryEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    const v = new URLSearchParams(window.location.search).get("email");
    return v ?? "";
  } catch {
    return "";
  }
}

export default function LockedPage() {
  const [email, setEmail] = useState<string>(() => readQueryEmail());
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const sendLink = async () => {
    setErrMsg(null);
    if (!email || !email.includes("@")) {
      setErrMsg("Enter the email you tried to sign in with.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setErrMsg("Sign-in is not configured in this environment.");
      return;
    }
    setStatus("sending");
    try {
      const supabase = getSupabase();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Once they click the link the callback handler will land
          // them back signed in. The callback already runs server-side
          // and is where we clear the lockout after verifying identity.
          emailRedirectTo: `${origin}/auth/callback?next=/&unlock=1`,
        },
      });
      if (error) {
        setStatus("error");
        setErrMsg(error.message);
        return;
      }
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="min-h-screen bg-app text-app">
      <header className="border-b border-app bg-app-elevated/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <SpacefieldLogo size="sm" />
          </Link>
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-sm text-secondary transition-colors hover:text-app"
          >
            Back
          </Link>
        </div>
      </header>
      <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center justify-center px-5 py-12">
        <div className="w-full rounded-2xl border border-app bg-app-elevated p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-app">
            Account temporarily locked
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Too many failed sign-in attempts. For your security, this
            account is paused for a short while. You can wait, or unlock
            it now by verifying your email — we&apos;ll send a one-time
            sign-in link.
          </p>

          {status === "sent" ? (
            <div className="mt-5 rounded-lg border border-app bg-app p-3 text-sm">
              Sent. Check{" "}
              <span className="font-medium text-app">{email}</span> for a
              sign-in link. Clicking it will unlock your account.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <label className="block text-xs font-medium text-secondary">
                Your email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-app bg-app px-3 py-2 text-sm text-app outline-none focus:border-tool-accent"
                />
              </label>
              <button
                type="button"
                onClick={sendLink}
                disabled={status === "sending"}
                className="w-full rounded-lg bg-tool-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {status === "sending"
                  ? "Sending..."
                  : "Email me a sign-in link"}
              </button>
              {errMsg ? (
                <p className="text-xs text-red-500">{errMsg}</p>
              ) : null}
            </div>
          )}

          <p className="mt-6 text-xs text-secondary">
            If you didn&apos;t try to sign in, someone else may have. The
            lockout has already stopped them. You can safely wait — no
            action needed.
          </p>
        </div>
      </section>
    </main>
  );
}
