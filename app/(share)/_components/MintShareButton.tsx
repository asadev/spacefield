"use client";

/* Drop-in share button for any tool. Mints a share.example.com link from the
 * tool's current state, then shows a copy-able URL.
 *
 * Usage:
 *   <MintShareButton
 *     type="page"
 *     payload={{ title, blocks, ... }}
 *     sourceTool="property-poster-creator"
 *     label="Share as link"
 *   />
 *
 * The component handles loading, success (URL display), and error states
 * inline. No external state management needed.
 */

import { useState } from "react";
import { mintShareLink, type MintShareLinkInput } from "@/lib/share/client";

interface Props {
  type: MintShareLinkInput["type"];
  payload: () => Record<string, unknown>;   // function so it pulls fresh state on click
  sourceTool: string;
  workspaceId?: string;
  label?: string;
  className?: string;
  /** If true, the button is disabled (e.g. tool state isn't shareable yet). */
  disabled?: boolean;
  /** If set, called after a successful mint with the result. */
  onMinted?: (result: { url: string; linkId: string; slug: string }) => void;
  /** Visual variant. */
  variant?: "primary" | "ghost";
}

export default function MintShareButton({
  type,
  payload,
  sourceTool,
  workspaceId,
  label = "Share link",
  className = "",
  disabled,
  onMinted,
  variant = "primary",
}: Props) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; url: string; copied: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function go() {
    if (disabled) return;
    setState({ kind: "loading" });
    const result = await mintShareLink({
      type,
      payload: payload(),
      sourceTool,
      workspaceId,
    });
    if (!result.ok || !result.url) {
      setState({ kind: "error", message: result.error ?? "Failed to create link." });
      return;
    }
    setState({ kind: "ok", url: result.url, copied: false });
    onMinted?.({
      url: result.url,
      linkId: result.linkId ?? "",
      slug: result.slug ?? "",
    });
  }

  async function copy() {
    if (state.kind !== "ok") return;
    try {
      await navigator.clipboard.writeText(state.url);
      setState({ ...state, copied: true });
      setTimeout(() => setState((s) => (s.kind === "ok" ? { ...s, copied: false } : s)), 1500);
    } catch {
      // ignore
    }
  }

  if (state.kind === "ok") {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          readOnly
          value={state.url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          {state.copied ? "Copied" : "Copy"}
        </button>
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-200"
        >
          Open
        </a>
      </div>
    );
  }

  const baseClasses =
    variant === "primary"
      ? "inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
      : "inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={disabled || state.kind === "loading"}
        className={baseClasses}
      >
        {state.kind === "loading" ? (
          <>
            <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeLinecap="round" />
            </svg>
            Creating…
          </>
        ) : (
          <>
            <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {label}
          </>
        )}
      </button>
      {state.kind === "error" ? (
        <p className="mt-2 text-xs text-red-600">{state.message}</p>
      ) : null}
    </div>
  );
}
