// @ts-nocheck
/**
 * Unit tests for lib/safe-href.ts — the URL scheme allowlist.
 */
import { describe, it, expect } from "vitest";

import { isSafeScheme, safeHref } from "@/lib/safe-href";

describe("isSafeScheme", () => {
  it("accepts http(s), mailto, tel, root-relative paths, and fragments", () => {
    expect(isSafeScheme("https://example.com")).toBe(true);
    expect(isSafeScheme("http://example.com")).toBe(true);
    expect(isSafeScheme("mailto:hi@example.com")).toBe(true);
    expect(isSafeScheme("tel:+971501234567")).toBe(true);
    expect(isSafeScheme("/about")).toBe(true);
    expect(isSafeScheme("#section")).toBe(true);
  });

  it("rejects javascript:, data:, vbscript:, file:", () => {
    expect(isSafeScheme("javascript:alert(1)")).toBe(false);
    expect(isSafeScheme("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeScheme("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeScheme("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeScheme("file:///etc/passwd")).toBe(false);
  });

  it("rejects scheme-relative URLs (//evil.com)", () => {
    expect(isSafeScheme("//evil.com")).toBe(false);
  });

  it("rejects empty / whitespace / non-string input", () => {
    expect(isSafeScheme("")).toBe(false);
    // @ts-expect-error — exercising the runtime guard
    expect(isSafeScheme(null)).toBe(false);
    // @ts-expect-error
    expect(isSafeScheme(undefined)).toBe(false);
    // @ts-expect-error
    expect(isSafeScheme(123)).toBe(false);
  });

  it("trims leading whitespace before matching (defends against ' javascript:')", () => {
    // The regex is anchored after trim, so a leading space wouldn't
    // bypass it. Verify both that a safe href survives trimming and an
    // unsafe one is still caught.
    expect(isSafeScheme("  https://example.com")).toBe(true);
    expect(isSafeScheme("  javascript:1")).toBe(false);
  });
});

describe("safeHref", () => {
  it("returns the trimmed input when scheme is allowed", () => {
    expect(safeHref("  https://example.com  ")).toBe("https://example.com");
    expect(safeHref("/docs")).toBe("/docs");
  });

  it("returns null for disallowed schemes and falsy input", () => {
    expect(safeHref("javascript:1")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
  });
});
