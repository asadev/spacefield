"use client";

/**
 * Unified toast bus for Space Field.
 *
 * Until now we had a grab-bag of `alert(...)` calls, a couple of bespoke
 * banner components, and the XP toast (which is its own animated thing).
 * For ordinary feedback ("Saved", "Couldn't connect", etc.) we now have
 * a single pub-sub bus + one `<Toaster />` mount in the root layout.
 *
 * Anywhere in the client tree:
 *
 *   import { toast } from "@/lib/toast";
 *   toast.success("Saved.");
 *   toast.error("Couldn't reach the server.");
 *   toast.info("Tip: press Cmd-K to search.", { ttl: 8000 });
 *
 * The `subscribe` API is for the Toaster component itself; no other
 * consumer should need it.
 *
 * No React imports here — the bus is a plain module singleton so a
 * Server Action's redirect/fallback path can also schedule a toast for
 * post-navigation pickup (via a `?toast=` query param, handled by the
 * Toaster — see the bottom of this file).
 */

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. Defaults to 4500. */
  ttl: number;
}

export interface ToastOptions {
  /** Override the default auto-dismiss in ms. */
  ttl?: number;
}

type Listener = (t: Toast) => void;

const listeners = new Set<Listener>();
let counter = 0;

function nextId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}_${counter}`;
}

function emit(kind: ToastKind, message: string, opts?: ToastOptions): void {
  if (!message) return;
  const t: Toast = {
    id: nextId(),
    kind,
    message,
    ttl: Math.max(1000, opts?.ttl ?? 4500),
  };
  for (const l of listeners) {
    try {
      l(t);
    } catch {
      // a misbehaving subscriber should never break the bus
    }
  }
}

export const toast = {
  info: (message: string, opts?: ToastOptions) => emit("info", message, opts),
  success: (message: string, opts?: ToastOptions) =>
    emit("success", message, opts),
  warn: (message: string, opts?: ToastOptions) => emit("warn", message, opts),
  error: (message: string, opts?: ToastOptions) => emit("error", message, opts),
  /** Subscribe to the bus. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Strip-out helper for query-param-based toasts.
 *
 * Server Actions that `redirect()` after success can append e.g.
 * `?toast=success:Saved` and the Toaster (on mount) will read it,
 * dispatch, and rewrite the URL to remove the param. This helper just
 * exposes the parser so the dispatch side can stay typed.
 */
export function parseQueryToast(
  raw: string | null
): { kind: ToastKind; message: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const kind = raw.slice(0, idx) as ToastKind;
  if (kind !== "info" && kind !== "success" && kind !== "warn" && kind !== "error") {
    return null;
  }
  const message = raw.slice(idx + 1).trim();
  if (!message) return null;
  return { kind, message };
}
