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
        if (event?.name === "checkout.completed") {
          opts.onCheckoutCompleted?.();
        }
      },
    });
    setupDone = true;
  }
  return Paddle;
}
