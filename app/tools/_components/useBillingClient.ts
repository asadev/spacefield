"use client";

/* useBillingClient — lazy-loads Paddle.js on demand and returns the
 * global `Paddle` object. We don't put the script tag in the root
 * layout because most users never reach a checkout — pulling 30+ KB on
 * every page just for the off chance someone clicks Upgrade is silly.
 *
 * First call to ensurePaddle() injects <script src="https://cdn.paddle.com/paddle/v2/paddle.js">,
 * waits for it to load, then runs Paddle.Setup(). Subsequent calls
 * return the already-initialised global.
 *
 * The client token + environment come from /api/me, which surfaces the
 * server's env vars (NEXT_PUBLIC_PADDLE_CLIENT_TOKEN +
 * PADDLE_ENVIRONMENT). Token-less callers get a clear error.
 */

interface PaddleCheckoutOpenItem {
  priceId: string;
  quantity: number;
}

interface PaddleCheckoutOpenOptions {
  items: PaddleCheckoutOpenItem[];
  customer?: { email?: string };
  customData?: Record<string, string>;
  settings?: {
    successUrl?: string;
    displayMode?: "overlay" | "inline";
    theme?: "light" | "dark";
    allowLogout?: boolean;
  };
}

interface PaddleCheckoutEvent {
  name?: string;
  data?: unknown;
  // Paddle Billing v2 surfaces error metadata in `error`. Shape varies
  // by failure mode (init vs payment vs validation), so we keep this
  // loose and only read `.detail` / `.message` opportunistically.
  error?:
    | {
        type?: string;
        code?: string;
        detail?: string;
        message?: string;
      }
    | string
    | null;
}

/* Paddle Billing v2's Initialize API — DOES NOT accept `environment`.
 * Environment is set separately via `Paddle.Environment.set()` BEFORE
 * Initialize is called. The agent originally wired `Paddle.Setup({...,
 * environment})` (Paddle Classic API on the v2 script) which threw
 * "[PADDLE] Unknown option parameter 'environment'". This shape is the
 * correct v2 contract. */
interface PaddleInitializeOptions {
  token: string;
  eventCallback?: (event: PaddleCheckoutEvent) => void;
}

export interface PaddleGlobal {
  Initialize: (options: PaddleInitializeOptions) => void;
  Environment: { set: (env: "production" | "sandbox") => void };
  Checkout: {
    open: (options: PaddleCheckoutOpenOptions) => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

let scriptLoadedPromise: Promise<void> | null = null;
let setupDone = false;

/* Paddle.Initialize() can only be called once per page load — calling it
 * twice with different tokens throws. So we capture the latest set of
 * caller callbacks in module-scope refs and the single Paddle init's
 * eventCallback dispatches into whichever handler is currently active.
 * Without this the second caller's onCheckoutError/onCheckoutCompleted
 * silently no-ops because the first call's closure is the only one
 * installed. */
let liveOnCompleted: (() => void) | null = null;
let liveOnError: ((message: string) => void) | null = null;

function loadScriptOnce(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paddle.js can only load in the browser"));
  }
  if (window.Paddle) return Promise.resolve();
  if (scriptLoadedPromise) return scriptLoadedPromise;

  scriptLoadedPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PADDLE_SCRIPT_SRC}"]`
    );
    if (existing) {
      if (window.Paddle) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Paddle.js failed to load")),
          { once: true }
        );
      }
      return;
    }
    const s = document.createElement("script");
    s.src = PADDLE_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(s);
  });
  return scriptLoadedPromise;
}

export interface EnsurePaddleOptions {
  token: string;
  environment?: "production" | "sandbox";
  onCheckoutCompleted?: () => void;
  /**
   * Surface Paddle's `checkout.error` and `checkout.payment_failed`
   * events so we can replace Paddle's generic "Something went wrong"
   * overlay with a meaningful toast. Without this hook, an init failure
   * (bad client token, unapproved domain, archived product) shows the
   * Paddle overlay's stock error message and the user has no recourse.
   */
  onCheckoutError?: (message: string) => void;
}

/**
 * Pull a human-readable message out of Paddle's loose error shape.
 * Falls back to a generic string if the payload is missing fields.
 */
function describePaddleEventError(event: PaddleCheckoutEvent): string {
  const err = event.error;
  if (typeof err === "string" && err.trim().length > 0) return err;
  if (err && typeof err === "object") {
    const detail = err.detail || err.message;
    if (typeof detail === "string" && detail.trim().length > 0) return detail;
    if (typeof err.code === "string" && err.code.trim().length > 0) {
      return `Paddle error: ${err.code}`;
    }
  }
  if (event.name === "checkout.payment_failed") {
    return "Payment was declined. Try a different card or contact support.";
  }
  return "Checkout failed. Please try again or contact support.";
}

/**
 * Load Paddle.js (once) and run Setup with the given token. Returns
 * the live `window.Paddle` global. Safe to call from any client click
 * handler — caching is internal.
 */
export async function ensurePaddle(opts: EnsurePaddleOptions): Promise<PaddleGlobal> {
  if (!opts.token) {
    throw new Error("Paddle client token is missing — set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN");
  }
  await loadScriptOnce();
  const Paddle = window.Paddle;
  if (!Paddle) throw new Error("Paddle.js loaded but global Paddle object is missing");

  // Always refresh the live handlers so the most recent caller's
  // callbacks fire — see comment on liveOn* refs above.
  liveOnCompleted = opts.onCheckoutCompleted ?? null;
  liveOnError = opts.onCheckoutError ?? null;

  if (!setupDone) {
    // Paddle Billing v2 contract:
    //   - environment goes through Paddle.Environment.set() BEFORE init
    //   - Initialize() takes only { token, eventCallback }
    // Default is production so we only call Environment.set when sandbox.
    if ((opts.environment ?? "production") === "sandbox") {
      Paddle.Environment.set("sandbox");
    }
    Paddle.Initialize({
      token: opts.token,
      eventCallback: (event) => {
        if (!event?.name) return;
        if (event.name === "checkout.completed") {
          liveOnCompleted?.();
          return;
        }
        if (
          event.name === "checkout.error" ||
          event.name === "checkout.payment_failed"
        ) {
          liveOnError?.(describePaddleEventError(event));
          return;
        }
      },
    });
    setupDone = true;
  }
  return Paddle;
}
