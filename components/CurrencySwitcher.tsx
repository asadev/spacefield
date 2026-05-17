"use client";

import { useCallback, useEffect, useState } from "react";

import {
  CURRENCIES,
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/locale/currency";

/**
 * Small dropdown that lets the user pick a display currency. The
 * choice persists to the `spacefield-currency` cookie (1-year TTL) and
 * dispatches a `spacefield:currency-changed` custom event so any
 * currency-rendering component on the page can re-render without a
 * full page reload.
 *
 * Components that want to react to the change can subscribe via
 * `useCurrencySubscription()` below.
 *
 * Mounted on pricing pages and any invoice surface that lists totals.
 *
 * Visual: compact pill button with chevron, opens a native <select>
 * styled to match the surrounding chrome. We use a native select rather
 * than a custom popover so keyboard a11y comes for free and the picker
 * works on touch devices.
 */

interface Props {
  /** Optional class added to the wrapper for one-off layout overrides. */
  className?: string;
  /**
   * When true, write to localStorage in addition to the cookie so
   * statically rendered pages can pick up the choice on first paint.
   */
  mirrorToLocalStorage?: boolean;
}

const LS_KEY = "spacefield.currency";
const EVENT_NAME = "spacefield:currency-changed";

export default function CurrencySwitcher({
  className,
  mirrorToLocalStorage = true,
}: Props) {
  const [code, setCode] = useState<SupportedCurrency>(DEFAULT_CURRENCY);

  // Hydrate from cookie on mount. We deliberately don't read the cookie
  // during render to avoid SSR mismatches — the default is sensible.
  useEffect(() => {
    const fromCookie = readCookie(CURRENCY_COOKIE);
    if (fromCookie && isSupportedCurrency(fromCookie)) {
      setCode(fromCookie);
      return;
    }
    if (mirrorToLocalStorage) {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (raw && isSupportedCurrency(raw)) setCode(raw);
      } catch {
        // ignore — localStorage can be disabled
      }
    }
  }, [mirrorToLocalStorage]);

  const onChange = useCallback(
    (next: SupportedCurrency) => {
      setCode(next);
      writeCookie(CURRENCY_COOKIE, next, 60 * 60 * 24 * 365);
      if (mirrorToLocalStorage) {
        try {
          window.localStorage.setItem(LS_KEY, next);
        } catch {
          // ignore
        }
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(EVENT_NAME, { detail: { code: next } })
        );
      }
    },
    [mirrorToLocalStorage]
  );

  const current = CURRENCIES[code];

  return (
    <label
      className={
        "inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2 py-1 text-xs text-app " +
        (className ?? "")
      }
      title="Display currency"
    >
      <span aria-hidden className="text-faint">
        {current.symbol}
      </span>
      <select
        aria-label="Display currency"
        value={code}
        onChange={(e) => {
          const v = e.target.value;
          if (isSupportedCurrency(v)) onChange(v);
        }}
        className="bg-transparent text-xs font-medium text-app outline-none"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ─── Helpers + subscription hook ─────────────────────────────────── */

/**
 * Subscribe to currency changes from any component on the page. The
 * callback is invoked with the new currency code when the user picks a
 * different option in any visible CurrencySwitcher.
 */
export function subscribeToCurrencyChange(
  cb: (code: SupportedCurrency) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ code: string }>).detail;
    if (detail && isSupportedCurrency(detail.code)) cb(detail.code);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = name + "=";
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      try {
        return decodeURIComponent(trimmed.slice(target.length));
      } catch {
        return trimmed.slice(target.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "SameSite=Lax",
  ];
  if (secure) attrs.push("Secure");
  document.cookie = attrs.join("; ");
}
