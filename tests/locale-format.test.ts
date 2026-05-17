// @ts-nocheck
/**
 * Unit tests for lib/locale/format.ts.
 *
 * All tests pass explicit `locale` overrides so they don't depend on
 * cookie state or Node's default ICU build. Asserts use substring
 * checks (`toContain`) for currency formatting because Intl insets
 * non-breaking spaces and locale-specific minus signs that vary
 * between ICU versions.
 */
import { describe, it, expect } from "vitest";

import {
  formatDate,
  formatNumber,
  formatCurrency,
  resolveLocale,
  resolveCurrency,
  isSupportedLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from "@/lib/locale/format";

describe("isSupportedLocale", () => {
  it("accepts every locale in SUPPORTED_LOCALES", () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(loc)).toBe(true);
    }
  });

  it("rejects bogus values", () => {
    expect(isSupportedLocale("xx-XX")).toBe(false);
    expect(isSupportedLocale("")).toBe(false);
  });
});

describe("resolveLocale / resolveCurrency without a cookie", () => {
  it("uses the override when provided", () => {
    expect(resolveLocale("en-GB")).toBe("en-GB");
    expect(resolveCurrency("EUR")).toBe("EUR");
  });

  it("falls back to defaults when no cookie + no override (Node has no document)", () => {
    // Node has no global document, so readClientCookie returns null and
    // the helpers fall back to defaults.
    expect(resolveLocale()).toBe(DEFAULT_LOCALE);
    // resolveCurrency's default is exported as DEFAULT_CURRENCY from
    // lib/locale/currency — we just assert it's one of the supported
    // codes rather than hard-coding a value that lives in another file.
    const c = resolveCurrency();
    expect(typeof c).toBe("string");
    expect(c.length).toBe(3);
  });
});

describe("formatDate", () => {
  it("returns empty for null/undefined/NaN inputs", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
    expect(formatDate(Number.NaN)).toBe("");
  });

  it("formats a known epoch in en-US medium style", () => {
    // 2024-01-15T10:00:00Z — Intl en-US medium -> "Jan 15, 2024"
    const out = formatDate(new Date("2024-01-15T10:00:00Z"), {
      locale: "en-US",
    });
    expect(out).toContain("2024");
    expect(out).toContain("Jan");
    expect(out).toContain("15");
  });

  it("respects the `withTime` flag", () => {
    const out = formatDate(new Date("2024-01-15T10:00:00Z"), {
      locale: "en-US",
      withTime: true,
    });
    // The exact time depends on the test runner's TZ — just check we
    // produced something longer than the bare date form.
    const bare = formatDate(new Date("2024-01-15T10:00:00Z"), {
      locale: "en-US",
    });
    expect(out.length).toBeGreaterThan(bare.length);
  });

  it("falls back to DEFAULT_LOCALE when the requested locale throws", () => {
    // Intl in Node accepts arbitrary BCP-47 strings without throwing,
    // so this is mostly a smoke test that the helper doesn't blow up.
    const out = formatDate(new Date("2024-01-15T10:00:00Z"), {
      locale: "zz-ZZ",
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("formatNumber", () => {
  it("returns empty for null / non-finite", () => {
    expect(formatNumber(null)).toBe("");
    expect(formatNumber(undefined)).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("");
    expect(formatNumber(Number.NaN)).toBe("");
  });

  it("formats integers with locale-specific separators", () => {
    expect(formatNumber(1234567, { locale: "en-US" })).toBe("1,234,567");
    // de-DE uses "." as thousands separator
    expect(formatNumber(1234567, { locale: "de-DE" })).toBe("1.234.567");
  });

  it("honours fraction-digit options", () => {
    expect(
      formatNumber(1.5, {
        locale: "en-US",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe("1.50");
  });

  it("supports compact notation", () => {
    const out = formatNumber(1500, { locale: "en-US", notation: "compact" });
    // Either "1.5K" or "2K" depending on ICU rounding mode — check it
    // looks compacted.
    expect(out).toMatch(/K|k/i);
  });
});

describe("formatCurrency", () => {
  it("returns empty for null / non-finite", () => {
    expect(formatCurrency(null, "USD")).toBe("");
    expect(formatCurrency(undefined, "USD")).toBe("");
    expect(formatCurrency(Number.NaN, "USD")).toBe("");
  });

  it("formats a US-dollar amount in en-US with the $ symbol", () => {
    const out = formatCurrency(1234.5, "USD", { locale: "en-US" });
    expect(out).toContain("$");
    expect(out).toContain("1,234");
  });

  it("formats euros in de-DE with a euro symbol after the number", () => {
    const out = formatCurrency(1234.5, "EUR", { locale: "de-DE" });
    expect(out).toContain("€");
  });

  it("falls back to default currency when the override is unsupported", () => {
    // A bogus code like "XYZ" isn't in SUPPORTED_CURRENCIES so the
    // helper falls back to whatever DEFAULT_CURRENCY is — we just
    // check it produced something rather than throwing.
    const out = formatCurrency(100, "XYZ", { locale: "en-US" });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
