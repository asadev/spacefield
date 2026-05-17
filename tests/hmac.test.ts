// @ts-nocheck
/**
 * Unit tests for lib/hmac.ts.
 *
 * These cover both the happy path (round-trip sign+verify) and the
 * security-relevant edge cases: length mismatch, case insensitivity,
 * empty body, and mismatch-without-early-return.
 */
import { describe, it, expect } from "vitest";

import { signHmacSha256, verifyHmacSha256 } from "@/lib/hmac";

const SECRET = "test-secret-do-not-use-in-prod";

describe("signHmacSha256", () => {
  it("returns 64 lowercase hex chars for SHA-256", async () => {
    const sig = await signHmacSha256(SECRET, "hello");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same (secret, body)", async () => {
    const a = await signHmacSha256(SECRET, '{"a":1}');
    const b = await signHmacSha256(SECRET, '{"a":1}');
    expect(a).toBe(b);
  });

  it("changes with any byte of the body", async () => {
    const a = await signHmacSha256(SECRET, '{"a":1}');
    const b = await signHmacSha256(SECRET, '{"a":2}');
    expect(a).not.toBe(b);
  });

  it("changes with the secret", async () => {
    const a = await signHmacSha256("secret-a", "body");
    const b = await signHmacSha256("secret-b", "body");
    expect(a).not.toBe(b);
  });

  it("matches the RFC-4231 SHA-256 test vector #1", async () => {
    // RFC 4231 test 1: key = 0x0b * 20, data = "Hi There".
    const key = "\x0b".repeat(20);
    const expected =
      "b0344c61d8db38535ca8afceaf0bf12b" +
      "881dc200c9833da726e9376c2e32cff7";
    const sig = await signHmacSha256(key, "Hi There");
    expect(sig).toBe(expected);
  });
});

describe("verifyHmacSha256", () => {
  it("accepts a freshly-signed body", async () => {
    const body = '{"event":"order.created","id":"ord_1"}';
    const sig = await signHmacSha256(SECRET, body);
    expect(await verifyHmacSha256(SECRET, body, sig)).toBe(true);
  });

  it("rejects a wrong signature of the right length", async () => {
    const sig = "0".repeat(64);
    expect(await verifyHmacSha256(SECRET, "body", sig)).toBe(false);
  });

  it("rejects when secret differs", async () => {
    const sig = await signHmacSha256(SECRET, "body");
    expect(await verifyHmacSha256("other-secret", "body", sig)).toBe(false);
  });

  it("rejects when body differs (replay-with-tamper)", async () => {
    const sig = await signHmacSha256(SECRET, '{"x":1}');
    expect(await verifyHmacSha256(SECRET, '{"x":2}', sig)).toBe(false);
  });

  it("rejects length mismatch even when XOR-sum happens to be zero", async () => {
    const sig = await signHmacSha256(SECRET, "body");
    // A short-but-prefix-matching signature must NOT pass.
    expect(await verifyHmacSha256(SECRET, "body", sig.slice(0, 32))).toBe(
      false,
    );
    // Empty signature is rejected.
    expect(await verifyHmacSha256(SECRET, "body", "")).toBe(false);
  });

  it("is case-insensitive on the provided signature (we emit lowercase)", async () => {
    const body = "case-test";
    const sig = await signHmacSha256(SECRET, body);
    expect(await verifyHmacSha256(SECRET, body, sig.toUpperCase())).toBe(true);
  });

  it("handles empty body symmetrically", async () => {
    const sig = await signHmacSha256(SECRET, "");
    expect(await verifyHmacSha256(SECRET, "", sig)).toBe(true);
    expect(await verifyHmacSha256(SECRET, "not-empty", sig)).toBe(false);
  });
});
