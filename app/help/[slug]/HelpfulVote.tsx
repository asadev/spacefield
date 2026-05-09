"use client";

import { useEffect, useState } from "react";

const VOTE_PREFIX = "help_vote_";

type VoteState = "idle" | "submitting" | "voted-up" | "voted-down" | "error";

/**
 * Thumbs up/down at the bottom of a public article. Stores the vote in
 * localStorage so users can't spam-click. Increments the article's
 * helpful / not_helpful counter via `/api/admin/help/vote`.
 *
 * NOTE: the route is mounted under /api/admin/help — that namespace was
 * provided to this agent. The handler itself does NOT require admin auth
 * (RLS lets anon insert votes via the dedicated public RPC), it just
 * lives there because it's part of the help feature surface.
 */
export function HelpfulVote({
  articleId,
  helpful,
  notHelpful,
}: {
  articleId: string;
  helpful: number;
  notHelpful: number;
}) {
  const storageKey = `${VOTE_PREFIX}${articleId}`;
  const [state, setState] = useState<VoteState>("idle");
  const [helpfulCount, setHelpfulCount] = useState(helpful);
  const [notHelpfulCount, setNotHelpfulCount] = useState(notHelpful);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prior = window.localStorage.getItem(storageKey);
    if (prior === "up") setState("voted-up");
    else if (prior === "down") setState("voted-down");
  }, [storageKey]);

  const disabled =
    state === "submitting" || state === "voted-up" || state === "voted-down";

  async function submit(value: "up" | "down") {
    if (disabled) return;
    setState("submitting");
    try {
      const res = await fetch("/api/admin/help/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ article_id: articleId, value }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, value);
      }
      if (value === "up") {
        setHelpfulCount((n) => n + 1);
        setState("voted-up");
      } else {
        setNotHelpfulCount((n) => n + 1);
        setState("voted-down");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="rounded-xl border border-app bg-app-elevated p-4">
      <div className="text-sm font-medium text-app">Was this helpful?</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => submit("up")}
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            state === "voted-up"
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "border-app bg-app text-app hover:border-emerald-500/60"
          } disabled:opacity-60`}
        >
          <span aria-hidden>👍</span>
          <span>Yes</span>
          <span className="font-mono tabular-nums text-[10px] text-faint">
            {helpfulCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => submit("down")}
          disabled={disabled}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            state === "voted-down"
              ? "border-rose-500/60 bg-rose-500/15 text-rose-500"
              : "border-app bg-app text-app hover:border-rose-500/60"
          } disabled:opacity-60`}
        >
          <span aria-hidden>👎</span>
          <span>No</span>
          <span className="font-mono tabular-nums text-[10px] text-faint">
            {notHelpfulCount}
          </span>
        </button>
        {state === "voted-up" && (
          <span className="text-xs text-secondary">
            Thanks — glad it helped.
          </span>
        )}
        {state === "voted-down" && (
          <span className="text-xs text-secondary">
            Got it. We&apos;ll improve this one.
          </span>
        )}
        {state === "error" && (
          <span className="text-xs text-rose-500">
            Couldn&apos;t record vote. Try again.
          </span>
        )}
      </div>
    </div>
  );
}
