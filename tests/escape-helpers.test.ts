// @ts-nocheck
/**
 * Unit tests for lib/escape-helpers.ts.
 *
 * Why @ts-nocheck: vitest is an opt-in dev dependency (see
 * tests/README.md). The directive keeps `tsc --noEmit` green when
 * `@types/vitest` isn't installed; Vitest's own runner ignores it.
 */
import { describe, it, expect } from "vitest";

import {
  escapeForLike,
  escapeForOr,
  escapeCsvCell,
} from "@/lib/escape-helpers";

describe("escapeForLike", () => {
  it("escapes the three SQL-LIKE wildcards plus the escape char", () => {
    expect(escapeForLike("100%")).toBe("100\\%");
    expect(escapeForLike("a_b")).toBe("a\\_b");
    expect(escapeForLike("c:\\path")).toBe("c:\\\\path");
  });

  it("escapes backslash first so the new backslashes from %/_ aren't double-escaped", () => {
    // If we escaped %/_ before \, the leading backslash from \% would
    // itself get \-prefixed and we'd ship `\\%` to Postgres, matching
    // a literal backslash followed by anything.
    expect(escapeForLike("\\%")).toBe("\\\\\\%");
  });

  it("returns plain input untouched", () => {
    expect(escapeForLike("hello world")).toBe("hello world");
  });
});

describe("escapeForOr", () => {
  it("strips structural characters used by PostgREST .or()", () => {
    expect(escapeForOr("a,b")).toBe("ab");
    expect(escapeForOr("foo(bar)")).toBe("foobar");
    expect(escapeForOr("x*y")).toBe("xy");
    expect(escapeForOr("line1\nline2")).toBe("line1line2");
    expect(escapeForOr("with\0null")).toBe("withnull");
  });

  it("leaves SQL-LIKE wildcards alone (they're escaped by escapeForLike)", () => {
    expect(escapeForOr("100% off")).toBe("100% off");
  });

  it("handles empty + ascii unchanged", () => {
    expect(escapeForOr("")).toBe("");
    expect(escapeForOr("safe-string-123")).toBe("safe-string-123");
  });
});

describe("escapeCsvCell", () => {
  it("defangs formula-injection prefixes", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell("+1.5")).toBe("'+1.5");
    expect(escapeCsvCell("-5")).toBe("'-5");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
    expect(escapeCsvCell("\tcol")).toBe("'\tcol");
  });

  it("wraps cells with embedded quotes, commas, or newlines and doubles inner quotes", () => {
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles null/undefined as empty string", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("coerces non-strings via String()", () => {
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("combines formula-defang + quote-wrap when both apply", () => {
    // `=foo,bar` — formula prefix AND a comma — needs both treatments.
    // Apostrophe is prefixed first; then the comma triggers wrapping.
    expect(escapeCsvCell("=foo,bar")).toBe(`"'=foo,bar"`);
  });
});
