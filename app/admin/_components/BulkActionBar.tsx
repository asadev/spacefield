"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useBulkActions } from "./BulkActionContext";

/**
 * Floating bar pinned to the bottom of an admin list page. Shows up
 * once at least one row is selected. Each page passes its own list of
 * actions; on Run we POST `{ scope, action_id, target_ids }` to
 * `/api/admin/bulk/run`.
 *
 * The bar handles three classes of action server response:
 *   1. JSON `{ ok: true, summary }` — show inline status + clear selection.
 *   2. JSON `{ ok: false, error }` — show inline error, keep selection.
 *   3. CSV / file response (Content-Disposition: attachment) — trigger
 *      a browser download then clear selection.
 *
 * Visual chrome mirrors the rest of admin: solid `bg-app-elevated`,
 * `border-app`, accent in `tool-accent`. Sticky bottom with safe
 * insets.
 */

export interface BulkAction {
  /** Stable id matched against the dispatch table on the server. */
  id: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** Optional `confirm()` text. `{n}` is replaced with the selection count. */
  confirmText?: string;
  /** Optional kind hint — used for visual styling, not server behavior. */
  kind?: "default" | "destructive" | "export";
}

export interface BulkActionBarProps {
  /** Optional override; defaults to the surrounding provider's scope. */
  scope?: string;
  actions: BulkAction[];
  /** Optional override of the dispatch endpoint (for tests / future). */
  endpoint?: string;
  /** Optional callback fired after a successful (non-CSV) run. */
  onComplete?: () => void;
}

type RunStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const DEFAULT_ENDPOINT = "/api/admin/bulk/run";

export default function BulkActionBar({
  scope: scopeOverride,
  actions,
  endpoint = DEFAULT_ENDPOINT,
  onComplete,
}: BulkActionBarProps) {
  const ctx = useBulkActions();
  const router = useRouter();

  const [actionId, setActionId] = useState<string>(actions[0]?.id ?? "");
  const [status, setStatus] = useState<RunStatus>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scope = scopeOverride ?? ctx.scope;
  const count = ctx.count;
  const visible = count > 0;

  // Keep the action select valid if the actions prop changes.
  useEffect(() => {
    if (!actions.length) {
      if (actionId) setActionId("");
      return;
    }
    if (!actions.some((a) => a.id === actionId)) {
      setActionId(actions[0].id);
    }
  }, [actions, actionId]);

  // Auto-clear transient success messages after a few seconds.
  useEffect(() => {
    if (status.kind !== "success") return;
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => {
      setStatus({ kind: "idle" });
    }, 4000);
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, [status]);

  const selectedAction = useMemo(
    () => actions.find((a) => a.id === actionId) ?? null,
    [actions, actionId]
  );

  if (!visible) return null;

  const disabled = pending || !selectedAction || count === 0;

  function handleRun() {
    if (!selectedAction) return;
    const ids = Array.from(ctx.selected);
    if (ids.length === 0) return;

    if (selectedAction.confirmText) {
      const text = selectedAction.confirmText.replace(
        /\{n\}/g,
        String(ids.length)
      );
      if (!window.confirm(text)) return;
    }

    setStatus({ kind: "running" });

    startTransition(async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            scope,
            action_id: selectedAction.id,
            target_ids: ids,
          }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        const contentDisposition =
          res.headers.get("content-disposition") ?? "";
        const isAttachment = /attachment/i.test(contentDisposition);

        if (!res.ok) {
          let message = `Request failed (${res.status})`;
          try {
            if (contentType.includes("application/json")) {
              const payload = (await res.json()) as { error?: string };
              if (payload?.error) message = payload.error;
            } else {
              const text = await res.text();
              if (text) message = text.slice(0, 240);
            }
          } catch {
            // ignore — we already have a fallback message
          }
          setStatus({ kind: "error", message });
          return;
        }

        if (isAttachment) {
          // Download the streamed file (e.g. CSV export).
          const blob = await res.blob();
          const filename =
            extractFilename(contentDisposition) ??
            `bulk-${scope}-${selectedAction.id}-${Date.now()}.csv`;
          triggerBrowserDownload(blob, filename);
          setStatus({
            kind: "success",
            message: `Exported ${ids.length} ${pluralize("row", ids.length)}.`,
          });
          ctx.clear();
          onComplete?.();
          return;
        }

        if (contentType.includes("application/json")) {
          const payload = (await res.json()) as {
            ok?: boolean;
            error?: string;
            summary?: string;
            succeeded?: number;
            failed?: number;
            total?: number;
          };
          if (payload?.ok === false) {
            setStatus({
              kind: "error",
              message: payload.error || "Action failed",
            });
            return;
          }
          const summary =
            payload.summary ||
            buildSummary(payload, selectedAction.label, ids.length);
          setStatus({ kind: "success", message: summary });
          ctx.clear();
          // Refresh the surrounding server component so changes appear.
          router.refresh();
          onComplete?.();
          return;
        }

        // Unknown shape — assume success.
        setStatus({
          kind: "success",
          message: `${selectedAction.label}: done.`,
        });
        ctx.clear();
        router.refresh();
        onComplete?.();
      } catch (err: unknown) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-7xl flex-wrap items-center gap-3 rounded-xl border border-app bg-app-elevated px-3 py-2 shadow-lg sm:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tool-accent">
            {count}
          </span>
          <span className="text-xs text-app">
            {pluralize("selected", count, "selected")}
          </span>
          <button
            type="button"
            onClick={() => {
              ctx.clear();
              setStatus({ kind: "idle" });
            }}
            disabled={pending}
            className="text-xs text-secondary transition-colors hover:text-tool-accent disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        <div className="hidden h-5 w-px bg-app sm:block" aria-hidden />

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <label
            htmlFor="bulk-action-select"
            className="text-[11px] uppercase tracking-wider text-faint"
          >
            Action
          </label>
          <select
            id="bulk-action-select"
            value={actionId}
            onChange={(e) => setActionId(e.target.value)}
            disabled={pending || actions.length === 0}
            className="h-8 min-w-[12rem] rounded-lg border border-app bg-app px-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft disabled:opacity-50"
          >
            {actions.length === 0 ? (
              <option value="">No actions available</option>
            ) : (
              actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))
            )}
          </select>

          <button
            type="button"
            onClick={handleRun}
            disabled={disabled}
            className={[
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity disabled:opacity-50",
              selectedAction?.kind === "destructive"
                ? "bg-rose-500 text-white hover:opacity-90"
                : "bg-tool-accent text-white hover:opacity-90",
            ].join(" ")}
          >
            {pending ? "Running…" : `Run on ${count}`}
          </button>

          {/* Status message */}
          <div
            aria-live="polite"
            className="ml-auto min-w-0 max-w-full truncate text-[11px] sm:max-w-sm"
          >
            {status.kind === "running" && (
              <span className="text-muted">Running…</span>
            )}
            {status.kind === "success" && (
              <span className="text-emerald-500 dark:text-emerald-400">
                {status.message}
              </span>
            )}
            {status.kind === "error" && (
              <span
                className="text-rose-500 dark:text-rose-400"
                title={status.message}
              >
                {status.message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── helpers ──────────────────── */

function pluralize(word: string, n: number, singular?: string): string {
  if (n === 1) return singular ?? word;
  return word.endsWith("s") ? word : `${word}s`;
}

function buildSummary(
  payload: {
    succeeded?: number;
    failed?: number;
    total?: number;
  },
  label: string,
  fallbackTotal: number
): string {
  const total = payload.total ?? fallbackTotal;
  const succeeded = payload.succeeded ?? total;
  const failed = payload.failed ?? 0;
  if (failed === 0) return `${label}: ${succeeded}/${total} succeeded.`;
  return `${label}: ${succeeded} ok, ${failed} failed (of ${total}).`;
}

function extractFilename(disposition: string): string | null {
  if (!disposition) return null;
  // RFC 5987 — filename* takes precedence, then plain filename.
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, "").trim());
    } catch {
      // fall through
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  if (plain?.[1]) return plain[1].trim();
  return null;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
