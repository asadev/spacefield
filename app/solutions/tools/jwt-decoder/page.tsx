"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Decoded =
  | {
      ok: true;
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
      signature: string;
      headerRaw: string;
      payloadRaw: string;
    }
  | { ok: false; error: string };

function base64UrlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  try {
    // atob handles ASCII, then convert to UTF-8
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

function decodeJwt(token: string): Decoded {
  const t = token.trim();
  if (!t) return { ok: false, error: "Paste a JWT to decode." };
  const parts = t.split(".");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Expected 3 segments separated by ".", got ${parts.length}.`,
    };
  }
  try {
    const headerRaw = base64UrlDecode(parts[0]);
    const payloadRaw = base64UrlDecode(parts[1]);
    const header = JSON.parse(headerRaw);
    const payload = JSON.parse(payloadRaw);
    return {
      ok: true,
      header,
      payload,
      signature: parts[2],
      headerRaw,
      payloadRaw,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function epochToLocal(sec: unknown): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  const d = new Date(sec * 1000);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString();
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyHs256(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const signingInput = `${parts[0]}.${parts[1]}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const expected = base64UrlFromBytes(new Uint8Array(sig));
  return expected === parts[2];
}

// Parse a PEM SPKI public key for RS256 verification.
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function verifyRs256(token: string, pem: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const key = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
  const pad = sigB64.length % 4 === 0 ? "" : "=".repeat(4 - (sigB64.length % 4));
  const bin = atob(sigB64 + pad);
  const sig = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) sig[i] = bin.charCodeAt(i);
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
}

// Standard registered claims from RFC 7519 + common extras.
const CLAIM_DESCRIPTIONS: Record<string, string> = {
  iss: "Issuer — who issued the token.",
  sub: "Subject — who the token is about.",
  aud: "Audience — intended recipient(s).",
  exp: "Expiration time (epoch seconds).",
  nbf: "Not-before time (epoch seconds).",
  iat: "Issued-at time (epoch seconds).",
  jti: "JWT ID — unique identifier, for blacklisting.",
  azp: "Authorized party (OIDC).",
  scope: "OAuth 2.0 scopes.",
  email: "User email (custom).",
  email_verified: "OIDC: email verified flag.",
  name: "Full name (custom / OIDC).",
  preferred_username: "OIDC preferred username.",
  roles: "Authorization roles (custom).",
  permissions: "Permissions (custom).",
};

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXggVGhvbXBzb24iLCJpYXQiOjE3NjUwMDAwMDAsImV4cCI6MTc2NTAwMzYwMH0.DjwRbDB5Y1tE4V4sFK1ll7d0cGq0LKd3LR-AkFGTbL0";

function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const s = Math.floor(abs / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

type SegmentKey = "header" | "payload" | "signature";

export default function JwtDecoderPage() {
  const [token, setToken] = useState(SAMPLE);
  const [secret, setSecret] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [verify, setVerify] = useState<null | { ok: boolean; checked: boolean }>(
    null
  );
  const [segment, setSegment] = useState<SegmentKey>("payload");

  const decoded = useMemo(() => decodeJwt(token), [token]);

  const algorithm = decoded.ok && typeof decoded.header["alg"] === "string"
    ? (decoded.header["alg"] as string)
    : "";
  const tokenType = decoded.ok && typeof decoded.header["typ"] === "string"
    ? (decoded.header["typ"] as string)
    : "";

  const expMs = decoded.ok && typeof decoded.payload["exp"] === "number"
    ? (decoded.payload["exp"] as number) * 1000
    : null;
  const iatMs = decoded.ok && typeof decoded.payload["iat"] === "number"
    ? (decoded.payload["iat"] as number) * 1000
    : null;
  const nbfMs = decoded.ok && typeof decoded.payload["nbf"] === "number"
    ? (decoded.payload["nbf"] as number) * 1000
    : null;

  // Client-only clock: Date.now() during render would trigger an impure
  // call in the React compiler and SSR/CSR mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expired = now !== null && expMs !== null && expMs < now;
  const notYet = now !== null && nbfMs !== null && nbfMs > now;
  const expRemaining = now !== null && expMs !== null ? expMs - now : null;

  // When token changes, reset verification state.
  useEffect(() => {
    setVerify(null);
  }, [token, secret, pubKey]);

  const runVerify = async () => {
    if (!decoded.ok) return;
    try {
      if (algorithm === "HS256" && secret) {
        const ok = await verifyHs256(token, secret);
        setVerify({ ok, checked: true });
      } else if (algorithm === "RS256" && pubKey) {
        const ok = await verifyRs256(token, pubKey);
        setVerify({ ok, checked: true });
      }
    } catch {
      setVerify({ ok: false, checked: true });
    }
  };

  const tokenParts = token.split(".");
  const segCount = tokenParts.length;
  const tokenLen = token.length;

  // Status — drives the valid/invalid badge.
  const status: { label: string; tone: string } = !decoded.ok
    ? {
        label: "invalid",
        tone: "border-rose-500/40 bg-rose-500/15 text-rose-500",
      }
    : expired
    ? {
        label: "expired",
        tone: "border-rose-500/40 bg-rose-500/15 text-rose-500",
      }
    : notYet
    ? {
        label: "not yet valid",
        tone: "border-amber-500/40 bg-amber-500/15 text-amber-500",
      }
    : {
        label: "valid",
        tone: "border-tool-accent bg-tool-accent-soft text-tool-accent",
      };

  const segments: { k: SegmentKey; label: string; meta: string }[] = [
    { k: "header", label: "Header", meta: "alg + typ" },
    { k: "payload", label: "Payload", meta: "claims" },
    { k: "signature", label: "Signature", meta: `${decoded.ok ? decoded.signature.length : 0} chars` },
  ];

  const activeCode = decoded.ok
    ? segment === "header"
      ? JSON.stringify(decoded.header, null, 2)
      : segment === "payload"
      ? JSON.stringify(decoded.payload, null, 2)
      : decoded.signature
    : "";

  return (
    <div data-tool-theme="data" data-tool="jwt-decoder">
      <ToolShell
        category="Data & Developer"
        title="JWT Decoder"
        description="Decode and inspect a JSON Web Token. Detect expired tokens and verify HS256 / RS256 signatures locally in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — status + alg chips, no dots */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${status.tone}`}
            >
              {status.label}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              alg:{algorithm || "none"}
            </span>
            {tokenType && (
              <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                typ:{tokenType}
              </span>
            )}
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              token.inspector
              <span className="text-faint">/</span>
              <span className="text-secondary">
                segs={segCount}/3 · len={tokenLen}
              </span>
            </div>
            {expRemaining !== null && (
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${
                  expRemaining < 0
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-500"
                    : expRemaining < 5 * 60 * 1000
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                    : "border-tool-accent bg-tool-accent-soft text-tool-accent"
                }`}
              >
                {expRemaining < 0
                  ? `expired ${formatRemaining(expRemaining)} ago`
                  : `expires in ${formatRemaining(expRemaining)}`}
              </span>
            )}
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  JSON Web Token · Inspector
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {decoded.ok ? Object.keys(decoded.header).length : 0}h · {decoded.ok ? Object.keys(decoded.payload).length : 0}p
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                    {iatMs ? "issued" : "no iat"}
                  </span>
                </div>

                <div className="mt-3 text-sm text-secondary">
                  Paste a token, inspect the three segments, and verify the
                  signature locally — keys never leave your browser.
                </div>
              </div>

              {/* expiry dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${decoded.ok && !expired && !notYet ? 100 : 0}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {decoded.ok && !expired && !notYet ? "OK" : "!"}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Token state
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {status.label}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {segments.map((t) => (
                <button
                  key={t.k}
                  onClick={() => setSegment(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    segment === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setToken(SAMPLE)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Load sample
              </button>
              <button
                onClick={() => setToken("")}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-rose-500/40 hover:text-rose-500"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        {/* ============================== TOKEN INPUT ============================== */}
        <section className="mb-5 rounded-xl border border-app bg-app-elevated">
          <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              ▾ token.input · header.payload.signature
            </div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              {tokenLen} chars
            </div>
          </div>
          <div className="p-5">
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste a jwt: header.payload.signature"
              className="w-full min-h-[120px] rounded-lg border border-app bg-app p-3 font-mono text-[0.7rem] leading-relaxed text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent break-all"
              spellCheck={false}
            />

            {decoded.ok && (
              <div className="mt-3 rounded-lg border border-app bg-app p-3 font-mono text-[0.65rem] leading-relaxed break-all">
                <span className="text-tool-accent">{tokenParts[0]}</span>
                <span className="text-faint">.</span>
                <span className="text-app">{tokenParts[1]}</span>
                <span className="text-faint">.</span>
                <span className="text-secondary">{tokenParts[2]}</span>
              </div>
            )}
          </div>
        </section>

        {!decoded.ok ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 font-mono text-xs text-rose-500">
            <div className="mb-1 text-[0.6rem] uppercase tracking-[0.22em]">
              decode.error
            </div>
            {decoded.error}
          </div>
        ) : (
          <>
            {(expired || notYet) && (
              <div
                className={`mb-5 rounded-xl border p-3 font-mono text-xs ${
                  expired
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                }`}
              >
                <span className="text-muted">// </span>
                {expired
                  ? `Token expired at ${epochToLocal((decoded.payload.exp as number) || 0)}.`
                  : `Token not valid until ${epochToLocal((decoded.payload.nbf as number) || 0)}.`}
              </div>
            )}

            {/* ============================== ACTIVE SEGMENT ============================== */}
            <section className="mb-5 rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ {segment}
                  <span className="ml-2 text-muted">
                    {segments.find((s) => s.k === segment)?.meta}
                  </span>
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  {activeCode.length} chars
                </div>
              </div>
              <div className="p-5">
                {segment === "signature" ? (
                  <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                    {activeCode}
                  </pre>
                ) : (
                  <pre className="overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                    <SyntaxHighlightedJson code={activeCode} />
                  </pre>
                )}
              </div>
            </section>

            {/* ============================== ALL SEGMENTS GRID ============================== */}
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <MonoPane
                label="header"
                meta="alg + typ"
                code={JSON.stringify(decoded.header, null, 2)}
              />
              <MonoPane
                label="payload"
                meta="claims"
                code={JSON.stringify(decoded.payload, null, 2)}
              />
              <MonoPane
                label="signature"
                meta={`${decoded.signature.length} chars`}
                code={decoded.signature}
                wrap
              />
            </div>

            {/* ============================== CLAIMS REFERENCE ============================== */}
            <section className="mb-5 rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ claims.reference
                </div>
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                  rfc 7519 + common
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="border-b border-app bg-app text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      <th className="px-3 py-2 text-left">claim</th>
                      <th className="px-3 py-2 text-left">value</th>
                      <th className="px-3 py-2 text-left">meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(decoded.payload).map(([k, v]) => {
                      let display: string;
                      if (k === "exp" || k === "iat" || k === "nbf")
                        display = `${v} (${epochToLocal(v as number) || "invalid"})`;
                      else if (typeof v === "object") display = JSON.stringify(v);
                      else display = String(v);
                      return (
                        <tr
                          key={k}
                          className="border-t border-app align-top transition-colors hover:bg-tool-accent-soft"
                        >
                          <td className="px-3 py-2 text-tool-accent">{k}</td>
                          <td className="px-3 py-2 break-all max-w-[260px] text-app">
                            {display}
                          </td>
                          <td className="px-3 py-2 text-[0.7rem] text-secondary">
                            {CLAIM_DESCRIPTIONS[k] || (
                              <em className="text-muted">custom claim</em>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ============================== SIGNATURE VERIFY ============================== */}
            <section className="rounded-xl border border-app bg-app-elevated">
              <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  ▾ signature.verify
                </div>
                <span
                  className={`font-mono text-[0.6rem] uppercase tracking-[0.18em] ${
                    algorithm === "HS256" || algorithm === "RS256"
                      ? "text-tool-accent"
                      : "text-amber-500"
                  }`}
                >
                  {algorithm || "—"}
                </span>
              </div>

              <div className="p-5">
                {algorithm === "RS256" ? (
                  <div>
                    <label className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                      public_key.pem
                    </label>
                    <textarea
                      value={pubKey}
                      onChange={(e) => setPubKey(e.target.value)}
                      placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
                      className="mt-2 w-full min-h-[120px] rounded-lg border border-app bg-app p-3 font-mono text-[0.65rem] text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                      shared_secret
                    </label>
                    <input
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="your-secret"
                      type="password"
                      className="mt-2 w-full rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
                      spellCheck={false}
                    />
                  </div>
                )}

                <button
                  onClick={runVerify}
                  disabled={
                    (algorithm === "HS256" && !secret) ||
                    (algorithm === "RS256" && !pubKey) ||
                    (algorithm !== "HS256" && algorithm !== "RS256")
                  }
                  className="mt-3 w-full rounded-lg bg-tool-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--bg)" }}
                >
                  {algorithm !== "HS256" && algorithm !== "RS256"
                    ? `verify supports HS256 + RS256 (got ${algorithm || "none"})`
                    : "verify.signature()"}
                </button>

                {verify?.checked && (
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg border p-2.5 font-mono text-xs ${
                      verify.ok
                        ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        verify.ok ? "bg-tool-accent" : "bg-rose-500"
                      }`}
                    />
                    {verify.ok ? "signature.valid = true" : "signature.match = false"}
                  </div>
                )}

                <p className="mt-3 border-t border-app pt-3 font-mono text-[0.6rem] leading-relaxed text-amber-500">
                  <span className="font-semibold">// WARN:</span> verification runs in your
                  browser only. Don&rsquo;t paste production secrets into any online tool —
                  including this one.
                </p>
              </div>
            </section>
          </>
        )}
      </ToolShell>
    </div>
  );
}

// Lightweight JSON syntax highlighter — colours keys with tool-accent.
function SyntaxHighlightedJson({ code }: { code: string }) {
  const tokens = useMemo(() => {
    const out: { text: string; cls: string }[] = [];
    // match keys: "name":  vs string values: "value" vs numbers, booleans, null
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}\[\],])/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      if (m.index > last) out.push({ text: code.slice(last, m.index), cls: "" });
      if (m[1] && m[2]) {
        out.push({ text: m[1], cls: "text-tool-accent" });
        out.push({ text: m[2], cls: "text-muted" });
      } else if (m[1]) {
        out.push({ text: m[1], cls: "text-app" });
      } else if (m[3]) {
        out.push({ text: m[3], cls: "text-secondary" });
      } else if (m[4]) {
        out.push({ text: m[4], cls: "text-secondary" });
      } else if (m[5]) {
        out.push({ text: m[5], cls: "text-muted" });
      }
      last = m.index + m[0].length;
    }
    if (last < code.length) out.push({ text: code.slice(last), cls: "" });
    return out;
  }, [code]);

  return (
    <code>
      {tokens.map((t, i) => (
        <span key={i} className={t.cls}>
          {t.text}
        </span>
      ))}
    </code>
  );
}

function MonoPane({
  label,
  meta,
  code,
  wrap,
}: {
  label: string;
  meta?: string;
  code: string;
  wrap?: boolean;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
            {label}
          </span>
        </div>
        {meta && (
          <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            {meta}
          </span>
        )}
      </div>
      <pre
        className={`overflow-auto rounded-b-xl bg-app p-3 font-mono text-[0.7rem] leading-relaxed text-app ${
          wrap ? "whitespace-pre-wrap break-all" : ""
        }`}
      >
        {label === "signature" ? code : <SyntaxHighlightedJson code={code} />}
      </pre>
    </div>
  );
}
