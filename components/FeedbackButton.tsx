"use client";

/**
 * FeedbackButton — a small "Feedback" pill that opens a modal where
 * admins (and any signed-in user the chrome puts it in front of) can
 * report a bug, request a feature, or leave a one-liner. POSTs to
 * /api/feedback which inserts into the `user_feedback` table.
 *
 * Mounted in app/admin/_components/Header.tsx beside the theme toggle.
 *
 * Why not just a mailto: link — we want the feedback to flow through
 * a Supabase table so admins can triage it without a third-party
 * inbox, and so we can stamp the current URL + user agent for context
 * (the submitter doesn't have to re-type "the budget chart page" etc.).
 *
 * The button is intentionally low-key — single small label, no badge,
 * no nudge. It doesn't need to compete with the notification bell.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface SubmitState {
  status: "idle" | "submitting" | "ok" | "error";
  message?: string;
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname() ?? "";

  // Pre-fill the page URL field with where the user clicked from.
  // Captured at open time so a slow modal animation doesn't lock in
  // the wrong URL.
  useEffect(() => {
    if (!open) return;
    if (typeof window !== "undefined") {
      setPageUrl(window.location.href);
    }
  }, [open, pathname]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function reset() {
    setOpen(false);
    setText("");
    setPageUrl("");
    setState({ status: "idle" });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setState({ status: "error", message: "Please write something." });
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          url: pageUrl || null,
          user_agent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "" }));
        setState({
          status: "error",
          message: j.error || `Server returned ${res.status}.`,
        });
        return;
      }
      setState({ status: "ok", message: "Thanks — we'll take a look." });
      // Auto-close after a beat so the user gets the ack.
      window.setTimeout(reset, 1400);
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Network error.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-app px-2 py-1 text-[11px] font-medium text-secondary transition-colors hover:bg-app-elevated hover:text-tool-accent"
        title="Send feedback to the team"
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            // Click-outside dismiss — only the backdrop, not the panel
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-xl border border-app bg-app-elevated p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
                  Feedback
                </div>
                <h2 id="feedback-title" className="mt-1 text-base font-semibold text-app">
                  Tell us what&apos;s on your mind
                </h2>
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded-md p-1 text-muted hover:bg-app hover:text-app"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-3 space-y-3">
              <label className="block">
                <span className="block text-[0.7rem] uppercase tracking-[0.15em] text-muted">
                  Message
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  required
                  maxLength={4000}
                  placeholder="What's broken, missing, confusing, or great?"
                  className="mt-1 w-full rounded-md border border-app bg-app px-3 py-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                />
                <span className="mt-0.5 block text-[10px] text-faint">
                  {text.length} / 4000
                </span>
              </label>

              <label className="block">
                <span className="block text-[0.7rem] uppercase tracking-[0.15em] text-muted">
                  Page URL (optional)
                </span>
                <input
                  type="url"
                  value={pageUrl}
                  onChange={(e) => setPageUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 w-full rounded-md border border-app bg-app px-3 py-1.5 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                />
              </label>

              {state.status === "error" && state.message && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                  {state.message}
                </div>
              )}
              {state.status === "ok" && state.message && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500">
                  {state.message}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-app px-3 py-1.5 text-xs text-secondary hover:bg-app hover:text-app"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state.status === "submitting" || !text.trim()}
                  className="rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-app-on-accent disabled:opacity-50"
                >
                  {state.status === "submitting" ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
