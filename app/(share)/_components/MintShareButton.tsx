"use client";

/* Drop-in share button for any tool. Mints a toshare.net link from the
 * tool's current state, then shows a copy-able URL + QR code.
 *
 * Usage:
 *   <MintShareButton
 *     type="page"
 *     payload={() => ({ title, blocks, ... })}
 *     sourceTool="property-poster-creator"
 *     resetKey={`${data.title}|${data.image}`}  // bump → button resets
 *   />
 *
 * The component handles loading, success (URL + QR), and error states
 * inline. No external state management needed.
 *
 * `resetKey` semantics: when this prop changes value (any kind of change),
 * the button returns to its idle state — useful when the parent tool
 * "resets" (e.g. clears the form). Existing minted links stay live in
 * the DB; only this UI resets.
 */

import { useEffect, useState } from "react";
import { mintShareLink, type MintShareLinkInput } from "@/lib/toshare/client";
import { useQrPrefs } from "@/lib/qr/preferences";
import { renderStyledQrPng } from "@/lib/qr/render";

interface Props {
  type: MintShareLinkInput["type"];
  payload: () => Record<string, unknown>;
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
  /**
   * When this value changes, the button resets to idle. Pass a
   * stringified signature of the parent's identity-defining state
   * (e.g. property title + price + image) so the displayed link
   * clears whenever the parent tool's "thing" changes.
   */
  resetKey?: string | number;
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
  resetKey,
}: Props) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; url: string; copied: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // QR code: lazily generated on first toggle, cached for the life of the
  // displayed URL (cleared along with state on resetKey change).
  // Style comes from the user's shared QR preferences (set in the QR
  // generator inside Format Converters).
  const [qrPrefs] = useQrPrefs();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrErr, setQrErr] = useState<string | null>(null);

  /* When the parent's resetKey changes, return to idle. */
  useEffect(() => {
    setState({ kind: "idle" });
    setQrOpen(false);
    setQrDataUrl(null);
    setQrErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

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

  async function toggleQr() {
    if (state.kind !== "ok") return;
    if (qrOpen) {
      setQrOpen(false);
      return;
    }
    setQrOpen(true);
    if (qrDataUrl) return;
    try {
      const dataUrl = await renderStyledQrPng(state.url, qrPrefs);
      setQrDataUrl(dataUrl);
    } catch (err) {
      setQrErr(err instanceof Error ? err.message : "QR generation failed");
    }
  }

  // Re-render QR when prefs change while the QR is visible (so style edits
  // in the QR generator flow through immediately).
  useEffect(() => {
    if (!qrOpen || state.kind !== "ok") return;
    let cancelled = false;
    renderStyledQrPng(state.url, qrPrefs)
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        if (!cancelled) setQrErr(err instanceof Error ? err.message : "QR generation failed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrPrefs, qrOpen, state.kind]);

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${state.kind === "ok" ? state.url.split("/").pop() : "link"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (state.kind === "ok") {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={toggleQr}
            aria-pressed={qrOpen}
            title={qrOpen ? "Hide QR code" : "Show QR code"}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-slate-700 hover:border-slate-400 dark:text-slate-200 ${
              qrOpen
                ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                : "border-slate-300 dark:border-slate-700"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <line x1="14" y1="14" x2="17" y2="14" />
              <line x1="14" y1="18" x2="14" y2="21" />
              <line x1="18" y1="18" x2="21" y2="18" />
              <line x1="20" y1="14" x2="21" y2="14" />
              <line x1="20" y1="20" x2="21" y2="20" />
            </svg>
          </button>
        </div>

        {qrOpen ? (
          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code"
                width={120}
                height={120}
                className="rounded bg-white"
              />
            ) : qrErr ? (
              <div className="flex h-[120px] w-[120px] items-center justify-center text-xs text-red-600">
                {qrErr}
              </div>
            ) : (
              <div className="flex h-[120px] w-[120px] items-center justify-center text-xs text-slate-400">
                Generating…
              </div>
            )}
            <div className="flex-1 space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <p>Scan to open the link. Same destination as the URL above.</p>
              {qrDataUrl ? (
                <button
                  type="button"
                  onClick={downloadQr}
                  className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Download PNG
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
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
