/**
 * Supported currencies for the in-app currency switcher.
 *
 * Kept narrow and curated — the universe of currencies is large, but
 * we only expose the ones our customer base actually uses + the
 * canonical reserves. The list is read by `CurrencySwitcher` (the
 * dropdown UI) and by `formatCurrency` (which falls back to the cookie
 * choice when no explicit code is passed).
 *
 * Anything outside this list still formats correctly via Intl —
 * formatCurrency takes an arbitrary code — but it won't show in the
 * picker UI.
 */

export const SUPPORTED_CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: SupportedCurrency = "USD";

export const CURRENCY_COOKIE = "spacefield-currency";

/**
 * Display metadata for each currency. We render the symbol next to the
 * dropdown label so users with limited English can still parse the
 * choice. Locale hints inform Intl when a user hasn't set their locale
 * explicitly — e.g. picking EUR while on en-US should still render
 * "€1,234.56" rather than crossing wires with US dollars.
 */
export const CURRENCIES: Record<
  SupportedCurrency,
  {
    code: SupportedCurrency;
    label: string;
    symbol: string;
    /** Preferred locale for typographic conventions when formatting. */
    preferredLocale: string;
  }
> = {
  AED: { code: "AED", label: "UAE Dirham",   symbol: "د.إ", preferredLocale: "en-AE" },
  USD: { code: "USD", label: "US Dollar",    symbol: "$",   preferredLocale: "en-US" },
  EUR: { code: "EUR", label: "Euro",         symbol: "€",   preferredLocale: "en-IE" },
  GBP: { code: "GBP", label: "British Pound", symbol: "£",  preferredLocale: "en-GB" },
  SAR: { code: "SAR", label: "Saudi Riyal",  symbol: "﷼",  preferredLocale: "en-SA" },
};

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}
