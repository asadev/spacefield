/**
 * Locale-aware formatters for dates, numbers, and currency.
 *
 * Two callers expect this module:
 *   1. Server components / Server Actions — read the user's locale and
 *      currency from cookies set by the CurrencySwitcher + a future
 *      LocalePicker.
 *   2. Client components — call the same helpers without arguments; the
 *      cookie is read on the client via `document.cookie`.
 *
 * This file is **isomorphic** on purpose. We deliberately avoid the
 * `import "server-only"` marker so the same helpers compile into client
 * bundles. The cookie read uses a feature check (`typeof document`) so
 * server-side execution never tries to touch the DOM.
 *
 * For the truly server-only path that needs `next/headers`, see
 * `getLocaleCookie` / `getCurrencyCookie` exported below — they import
 * lazily inside the helpers so the client bundle stays clean.
 */

import {
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from "./currency";

export const LOCALE_COOKIE = "spacefield-locale";

export const SUPPORTED_LOCALES = [
  "en-US",
  "en-AE",
  "en-GB",
  "ar-AE",
  "fr-FR",
  "es-ES",
  "de-DE",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export function isSupportedLocale(loc: string): loc is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(loc);
}

/* ─── Cookie reads ─────────────────────────────────────────────────── */

/**
 * Read a cookie by name from `document.cookie`. Returns null when
 * called server-side or when the cookie is missing.
 */
function readClientCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = name + "=";
  const parts = document.cookie ? document.cookie.split(";") : [];
  for (const raw of parts) {
    const trimmed = raw.trim();
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

/**
 * Returns the user's locale, preferring (in order):
 *   1. The `opts.locale` override
 *   2. The `spacefield-locale` cookie
 *   3. DEFAULT_LOCALE
 *
 * On the server, callers wanting cookie reads should fetch via
 * `getServerLocale()` (which uses next/headers) and pass it in
 * explicitly — this client-leaning helper falls back gracefully.
 */
export function resolveLocale(override?: string): string {
  if (override && typeof override === "string") return override;
  const cookie = readClientCookie(LOCALE_COOKIE);
  if (cookie && isSupportedLocale(cookie)) return cookie;
  return DEFAULT_LOCALE;
}

export function resolveCurrency(override?: string): SupportedCurrency {
  if (override && isSupportedCurrency(override)) return override;
  const cookie = readClientCookie(CURRENCY_COOKIE);
  if (cookie && isSupportedCurrency(cookie)) return cookie;
  return DEFAULT_CURRENCY;
}

/* ─── Format helpers ──────────────────────────────────────────────── */

export interface DateFormatOptions {
  locale?: string;
  style?: "short" | "medium" | "long" | "full";
  /** When true, includes a time component (medium style). */
  withTime?: boolean;
}

/**
 * Wraps Intl.DateTimeFormat with sensible defaults. Accepts a Date, an
 * ISO string, or an epoch-ms number; non-finite / unparseable inputs
 * fall through to an empty string so a missing field never crashes the
 * UI.
 */
export function formatDate(
  input: Date | string | number | null | undefined,
  opts: DateFormatOptions = {}
): string {
  if (input == null) return "";
  const date =
    input instanceof Date
      ? input
      : typeof input === "number"
        ? new Date(input)
        : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const locale = resolveLocale(opts.locale);
  const style = opts.style ?? "medium";

  const dt: Intl.DateTimeFormatOptions = (() => {
    switch (style) {
      case "short":
        return { dateStyle: "short" };
      case "long":
        return { dateStyle: "long" };
      case "full":
        return { dateStyle: "full" };
      case "medium":
      default:
        return { dateStyle: "medium" };
    }
  })();

  if (opts.withTime) {
    dt.timeStyle = style === "short" ? "short" : "medium";
  }

  try {
    return new Intl.DateTimeFormat(locale, dt).format(date);
  } catch {
    // Locale not supported in this runtime — retry with default.
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, dt).format(date);
  }
}

export interface NumberFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  notation?: "standard" | "compact" | "scientific" | "engineering";
}

export function formatNumber(
  n: number | null | undefined,
  opts: NumberFormatOptions = {}
): string {
  if (n == null || !Number.isFinite(n)) return "";
  const locale = resolveLocale(opts.locale);
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits,
      notation: opts.notation,
    }).format(n);
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      minimumFractionDigits: opts.minimumFractionDigits,
      maximumFractionDigits: opts.maximumFractionDigits,
      notation: opts.notation,
    }).format(n);
  }
}

export interface CurrencyFormatOptions {
  locale?: string;
  /** Override fraction digits — defaults follow the currency's CLDR. */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** When true, use compact notation ($1.2K) for large amounts. */
  compact?: boolean;
}

/**
 * Format a number as currency. `currency` is the ISO 4217 code; if
 * omitted, we read from the cookie (defaults to AED). `locale` is read
 * from the cookie too unless overridden.
 *
 * The combination "any locale × any currency" is supported by Intl, so
 * a user in en-US who picks EUR will see "€1,234.56" — correct format
 * for the active locale. That's what users expect.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency?: string,
  opts: CurrencyFormatOptions = {}
): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  const code = resolveCurrency(currency);
  const locale = resolveLocale(opts.locale);
  const fmt: Intl.NumberFormatOptions = {
    style: "currency",
    currency: code,
    currencyDisplay: "symbol",
  };
  if (opts.minimumFractionDigits !== undefined) {
    fmt.minimumFractionDigits = opts.minimumFractionDigits;
  }
  if (opts.maximumFractionDigits !== undefined) {
    fmt.maximumFractionDigits = opts.maximumFractionDigits;
  }
  if (opts.compact) fmt.notation = "compact";
  try {
    return new Intl.NumberFormat(locale, fmt).format(amount);
  } catch {
    return new Intl.NumberFormat(DEFAULT_LOCALE, fmt).format(amount);
  }
}

/* ─── Server-only helpers ─────────────────────────────────────────── */
/* Imported via `next/headers` lazily so the client bundle stays clean. */

/**
 * Server-only helper: read the user's locale cookie from request
 * headers. Falls back to DEFAULT_LOCALE.
 *
 * Don't call this from a client component — `next/headers` throws.
 */
export async function getServerLocale(): Promise<SupportedLocale> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    if (raw && isSupportedLocale(raw)) return raw;
  } catch {
    // outside a request context — return default
  }
  return DEFAULT_LOCALE;
}

export async function getServerCurrency(): Promise<SupportedCurrency> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const raw = store.get(CURRENCY_COOKIE)?.value;
    if (raw && isSupportedCurrency(raw)) return raw;
  } catch {
    // outside a request context
  }
  return DEFAULT_CURRENCY;
}
