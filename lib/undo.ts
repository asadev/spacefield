"use client";

/**
 * Gmail-style "Undo" bus.
 *
 * Soft-delete UX: after a user removes a comment / task / row, we
 * surface a floating snackbar in the bottom-left for ~5 seconds with
 * the message + an UNDO button. Pressing UNDO calls the registered
 * callback (which restores the row server-side). Letting the timer
 * elapse just dismisses the card.
 *
 * Usage:
 *
 *   import { pushUndo } from "@/lib/undo";
 *   // After a soft delete:
 *   pushUndo("Comment deleted.", async () => {
 *     await fetch(`/api/comments?comment_id=${id}&undo=1`, { method: "PATCH" });
 *     refetch();
 *   });
 *
 * The <UndoSnackbar /> component (mounted once in the root layout)
 * subscribes to this bus and renders the most recently pushed undo.
 *
 * Design notes:
 *   - Only one undo card visible at a time. If a new action fires while
 *     a card is up, the old one is replaced — the user's brain only
 *     tracks "the last thing I did" anyway.
 *   - Undo callbacks are awaited so the snackbar can show a "Restoring…"
 *     state and surface errors. The bus does not retry — callers should.
 *   - We don't import React here so the bus can be called from any
 *     module, including non-client utilities.
 */

export interface UndoAction {
  /** Stable id; used for re-render keying + dismissal. */
  id: string;
  /** Snackbar label shown next to the UNDO button. */
  label: string;
  /** Called when the user clicks UNDO. May return a promise. */
  undo: () => Promise<void> | void;
  /** Optional callback when the action expires without an undo. */
  onExpire?: () => void;
  /** ms since epoch when the undo window closes. */
  expiresAt: number;
}

type Listener = (current: UndoAction | null) => void;

const listeners = new Set<Listener>();
let active: UndoAction | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let counter = 0;

function nextId(): string {
  counter += 1;
  return `u${Date.now().toString(36)}_${counter}`;
}

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function emit() {
  for (const l of listeners) {
    try {
      l(active);
    } catch {
      // a misbehaving subscriber should never break the bus
    }
  }
}

/**
 * Push a new undo card onto the stack. Replaces any active card.
 * Returns the action id (useful for tests + early dismissal).
 */
export function pushUndo(
  label: string,
  undo: () => Promise<void> | void,
  opts: { ttlMs?: number; onExpire?: () => void } = {}
): string {
  const ttl = Math.max(1500, Math.min(opts.ttlMs ?? 5000, 30_000));
  const id = nextId();

  // Old card expires silently — the user explicitly pushed a new one.
  clearTimer();
  active = {
    id,
    label,
    undo,
    onExpire: opts.onExpire,
    expiresAt: Date.now() + ttl,
  };
  emit();

  timer = setTimeout(() => {
    if (active?.id === id) {
      const expired = active;
      active = null;
      emit();
      if (expired.onExpire) {
        try {
          expired.onExpire();
        } catch {
          // ignore
        }
      }
    }
  }, ttl);

  return id;
}

/**
 * Trigger the active undo. Awaits the callback so the caller can
 * disable a button or show a spinner. After this returns, the card is
 * dismissed regardless of success.
 */
export async function runUndo(id: string): Promise<void> {
  if (!active || active.id !== id) return;
  const cb = active.undo;
  clearTimer();
  active = null;
  emit();
  try {
    await cb();
  } catch {
    // Caller is responsible for surfacing the failure (toast etc.).
    // We don't auto-re-show the snackbar — feels weird.
  }
}

/** Dismiss the current undo without firing the callback. */
export function dismissUndo(id?: string): void {
  if (!active) return;
  if (id && active.id !== id) return;
  clearTimer();
  active = null;
  emit();
}

/**
 * Subscribe to the active undo. The listener fires immediately with the
 * current state (which is `null` when nothing is active).
 */
export function subscribeUndo(listener: Listener): () => void {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper — only intended for the unit tests. */
export function _resetUndoForTests(): void {
  clearTimer();
  active = null;
  listeners.clear();
  counter = 0;
}
