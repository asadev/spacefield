"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

// Tiny pure-JS MD5 (RFC 1321, based on Paul Johnston's implementation, MIT).
function md5Bytes(bytes: Uint8Array): string {
  function r(n: number, c: number) {
    return (n << c) | (n >>> (32 - c));
  }
  function add(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return add(r(add(add(a, q), add(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  // Pad input as per RFC: append 0x80, pad with 0, append length in bits (64-bit LE)
  const len = bytes.length;
  const nBlocks = Math.floor((len + 8) / 64) + 1;
  const padded = new Uint8Array(nBlocks * 64);
  padded.set(bytes);
  padded[len] = 0x80;
  // length in bits as 64-bit little-endian
  const bitLen = len * 8;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const x: number[] = new Array(16);
    for (let j = 0; j < 16; j++) x[j] = dv.getUint32(i + j * 4, true);
    const aa = a,
      bb = b,
      cc = c,
      dd = d;
    a = ff(a, b, c, d, x[0], 7, -680876936);
    d = ff(d, a, b, c, x[1], 12, -389564586);
    c = ff(c, d, a, b, x[2], 17, 606105819);
    b = ff(b, c, d, a, x[3], 22, -1044525330);
    a = ff(a, b, c, d, x[4], 7, -176418897);
    d = ff(d, a, b, c, x[5], 12, 1200080426);
    c = ff(c, d, a, b, x[6], 17, -1473231341);
    b = ff(b, c, d, a, x[7], 22, -45705983);
    a = ff(a, b, c, d, x[8], 7, 1770035416);
    d = ff(d, a, b, c, x[9], 12, -1958414417);
    c = ff(c, d, a, b, x[10], 17, -42063);
    b = ff(b, c, d, a, x[11], 22, -1990404162);
    a = ff(a, b, c, d, x[12], 7, 1804603682);
    d = ff(d, a, b, c, x[13], 12, -40341101);
    c = ff(c, d, a, b, x[14], 17, -1502002290);
    b = ff(b, c, d, a, x[15], 22, 1236535329);

    a = gg(a, b, c, d, x[1], 5, -165796510);
    d = gg(d, a, b, c, x[6], 9, -1069501632);
    c = gg(c, d, a, b, x[11], 14, 643717713);
    b = gg(b, c, d, a, x[0], 20, -373897302);
    a = gg(a, b, c, d, x[5], 5, -701558691);
    d = gg(d, a, b, c, x[10], 9, 38016083);
    c = gg(c, d, a, b, x[15], 14, -660478335);
    b = gg(b, c, d, a, x[4], 20, -405537848);
    a = gg(a, b, c, d, x[9], 5, 568446438);
    d = gg(d, a, b, c, x[14], 9, -1019803690);
    c = gg(c, d, a, b, x[3], 14, -187363961);
    b = gg(b, c, d, a, x[8], 20, 1163531501);
    a = gg(a, b, c, d, x[13], 5, -1444681467);
    d = gg(d, a, b, c, x[2], 9, -51403784);
    c = gg(c, d, a, b, x[7], 14, 1735328473);
    b = gg(b, c, d, a, x[12], 20, -1926607734);

    a = hh(a, b, c, d, x[5], 4, -378558);
    d = hh(d, a, b, c, x[8], 11, -2022574463);
    c = hh(c, d, a, b, x[11], 16, 1839030562);
    b = hh(b, c, d, a, x[14], 23, -35309556);
    a = hh(a, b, c, d, x[1], 4, -1530992060);
    d = hh(d, a, b, c, x[4], 11, 1272893353);
    c = hh(c, d, a, b, x[7], 16, -155497632);
    b = hh(b, c, d, a, x[10], 23, -1094730640);
    a = hh(a, b, c, d, x[13], 4, 681279174);
    d = hh(d, a, b, c, x[0], 11, -358537222);
    c = hh(c, d, a, b, x[3], 16, -722521979);
    b = hh(b, c, d, a, x[6], 23, 76029189);
    a = hh(a, b, c, d, x[9], 4, -640364487);
    d = hh(d, a, b, c, x[12], 11, -421815835);
    c = hh(c, d, a, b, x[15], 16, 530742520);
    b = hh(b, c, d, a, x[2], 23, -995338651);

    a = ii(a, b, c, d, x[0], 6, -198630844);
    d = ii(d, a, b, c, x[7], 10, 1126891415);
    c = ii(c, d, a, b, x[14], 15, -1416354905);
    b = ii(b, c, d, a, x[5], 21, -57434055);
    a = ii(a, b, c, d, x[12], 6, 1700485571);
    d = ii(d, a, b, c, x[3], 10, -1894986606);
    c = ii(c, d, a, b, x[10], 15, -1051523);
    b = ii(b, c, d, a, x[1], 21, -2054922799);
    a = ii(a, b, c, d, x[8], 6, 1873313359);
    d = ii(d, a, b, c, x[15], 10, -30611744);
    c = ii(c, d, a, b, x[6], 15, -1560198380);
    b = ii(b, c, d, a, x[13], 21, 1309151649);
    a = ii(a, b, c, d, x[4], 6, -145523070);
    d = ii(d, a, b, c, x[11], 10, -1120210379);
    c = ii(c, d, a, b, x[2], 15, 718787259);
    b = ii(b, c, d, a, x[9], 21, -343485551);

    a = add(a, aa);
    b = add(b, bb);
    c = add(c, cc);
    d = add(d, dd);
  }

  function toHex(n: number) {
    const bytes = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// CRC32 (IEEE 802.3 poly) — tiny table-based impl.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

async function hmacHex(secret: string, bytes: Uint8Array, algo: "SHA-1" | "SHA-256" | "SHA-512"): Promise<string> {
  const enc = new TextEncoder();
  const keyBuf = enc.encode(secret).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey("raw", keyBuf, { name: "HMAC", hash: algo }, false, ["sign"]);
  const msgBuf = bytes.slice().buffer as ArrayBuffer;
  const sig = await crypto.subtle.sign("HMAC", key, msgBuf);
  return bufToHex(sig);
}

async function computeHashes(source: string | ArrayBuffer): Promise<{
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
  crc32: string;
}> {
  const bytes =
    typeof source === "string" ? new TextEncoder().encode(source) : new Uint8Array(source);
  const [s1, s256, s384, s512] = await Promise.all([
    crypto.subtle.digest("SHA-1", bytes),
    crypto.subtle.digest("SHA-256", bytes),
    crypto.subtle.digest("SHA-384", bytes),
    crypto.subtle.digest("SHA-512", bytes),
  ]);
  return {
    md5: md5Bytes(bytes),
    sha1: bufToHex(s1),
    sha256: bufToHex(s256),
    sha384: bufToHex(s384),
    sha512: bufToHex(s512),
    crc32: crc32(bytes),
  };
}

type AlgoKey = "CRC32" | "MD5" | "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
const ALGOS: AlgoKey[] = ["CRC32", "MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];

export default function HashGeneratorPage() {
  const [text, setText] = useState("hello world");
  const [hashes, setHashes] = useState({ md5: "", sha1: "", sha256: "", sha384: "", sha512: "", crc32: "" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hmacSecret, setHmacSecret] = useState("");
  const [hmacResults, setHmacResults] = useState({ sha1: "", sha256: "", sha512: "" });
  const [activeAlgo, setActiveAlgo] = useState<AlgoKey>("SHA-256");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeHashes(text).then((h) => {
      if (!cancelled) {
        setHashes(h);
        setFileName(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    if (!hmacSecret) {
      setHmacResults({ sha1: "", sha256: "", sha512: "" });
      return;
    }
    const bytes = new TextEncoder().encode(text);
    Promise.all([
      hmacHex(hmacSecret, bytes, "SHA-1"),
      hmacHex(hmacSecret, bytes, "SHA-256"),
      hmacHex(hmacSecret, bytes, "SHA-512"),
    ]).then(([s1, s256, s512]) => {
      if (!cancelled) setHmacResults({ sha1: s1, sha256: s256, sha512: s512 });
    });
    return () => {
      cancelled = true;
    };
  }, [text, hmacSecret]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const buf = await f.arrayBuffer();
    const h = await computeHashes(buf);
    setHashes(h);
    setFileName(f.name);
    setBusy(false);
  };

  const copy = (label: string, t: string) => {
    if (!t) return;
    navigator.clipboard?.writeText(t);
    setCopied(label);
    setTimeout(() => setCopied((cur) => (cur === label ? null : cur)), 1200);
  };

  const rows: Array<[AlgoKey, string]> = [
    ["CRC32", hashes.crc32],
    ["MD5", hashes.md5],
    ["SHA-1", hashes.sha1],
    ["SHA-256", hashes.sha256],
    ["SHA-384", hashes.sha384],
    ["SHA-512", hashes.sha512],
  ];

  const inputBytes = useMemo(() => new TextEncoder().encode(text).length, [text]);
  const featured = rows.find(([a]) => a === activeAlgo);

  return (
    <div data-tool-theme="data" data-tool="hash-generator">
      <ToolShell
        category="Data & Developer"
        title="Hash Generator"
        description="Compute MD5, SHA-1, SHA-256, SHA-512 of text or files. MD5 via pure-JS; SHA family via SubtleCrypto. Runs entirely in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — mode + bytes chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {fileName ? "FILE" : "TEXT"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {inputBytes}b
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              crypto.digest
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {(fileName || "stdin").toLowerCase()}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {busy ? "◉ hashing…" : "◉ live"}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Hash Generator · Crypto Digest
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  {activeAlgo}
                </h2>
                <div className="mt-2 break-all rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs leading-relaxed text-app">
                  {featured?.[1] || <span className="text-faint">— awaiting input —</span>}
                </div>
              </div>

              {/* byte counter dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-[0.65rem] font-bold text-tool-accent">
                  {inputBytes > 999 ? `${(inputBytes / 1024).toFixed(1)}k` : inputBytes}
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Input size
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {inputBytes} byte{inputBytes === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip — algorithm picker as segmented pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
              {ALGOS.map((a) => (
                <button
                  key={a}
                  onClick={() => setActiveAlgo(a)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    activeAlgo === a
                      ? "bg-tool-accent text-app-elevated"
                      : "text-secondary hover:text-app"
                  }`}
                  style={activeAlgo === a ? { color: "var(--bg)" } : undefined}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <label className="cursor-pointer rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent">
                <input type="file" onChange={handleFile} className="hidden" />
                {busy ? "Hashing…" : "Load file"}
              </label>
              <button
                onClick={() => copy(activeAlgo, featured?.[1] || "")}
                disabled={!featured?.[1]}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ color: "var(--bg)" }}
              >
                {copied === activeAlgo ? "Copied" : `Copy ${activeAlgo}`}
              </button>
            </div>
          </div>
        </section>

        {/* =========== INPUT + DIGEST GRID =========== */}
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Input panel */}
          <ToolCard title="Input" subtitle="Type or paste — or load a file">
            <div className="rounded-lg border border-app bg-app">
              <div className="flex items-center gap-2 border-b border-app px-2.5 py-1">
                <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                  $ stdin
                </span>
                <span className="font-mono text-[0.55rem] text-muted">
                  {fileName ? `file: ${fileName}` : "text mode"}
                </span>
                <span className="ml-auto font-mono text-[0.55rem] text-muted">
                  {inputBytes} bytes
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                rows={8}
                className="w-full resize-y bg-transparent px-3 py-2 font-mono text-xs leading-relaxed text-app placeholder:text-faint outline-none"
                placeholder="hello world"
              />
            </div>
          </ToolCard>

          {/* Digests panel */}
          <ToolCard title="Digests" subtitle="hex · lowercase · live">
            <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
              <div className="divide-y divide-[var(--border)]">
                {rows.map(([algo, hex]) => (
                  <div
                    key={algo}
                    className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 transition-colors ${
                      algo === activeAlgo ? "bg-tool-accent-soft/40" : "hover:bg-tool-accent-soft/30"
                    }`}
                  >
                    <button
                      onClick={() => setActiveAlgo(algo)}
                      className={`text-left font-mono text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                        algo === activeAlgo ? "text-tool-accent" : "text-secondary hover:text-tool-accent"
                      }`}
                    >
                      {algo}
                    </button>
                    <div className="break-all font-mono text-[0.7rem] leading-relaxed text-app">
                      {hex || <span className="text-faint">— awaiting input —</span>}
                    </div>
                    <button
                      onClick={() => copy(algo, hex)}
                      disabled={!hex}
                      className="shrink-0 rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                    >
                      {copied === algo ? "✓" : "copy"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </ToolCard>
        </div>

        {/* =========== HMAC PANEL =========== */}
        <section className="mt-6">
          <div className="relative overflow-hidden rounded-xl border border-app bg-app-elevated">
            <div className="flex items-center justify-between border-b border-app bg-app px-4 py-2.5">
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                ▾ hmac · keyed digest
              </div>
              <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                webhook signatures
              </div>
            </div>

            <div className="p-5">
              <div className="rounded-lg border border-app bg-app">
                <div className="flex items-center gap-2 border-b border-app px-2.5 py-1">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    $ key
                  </span>
                  <span className="font-mono text-[0.55rem] text-muted">shared secret</span>
                </div>
                <input
                  type="password"
                  placeholder="paste shared secret…"
                  value={hmacSecret}
                  onChange={(e) => setHmacSecret(e.target.value)}
                  className="w-full bg-transparent px-3 py-2 font-mono text-xs text-app placeholder:text-faint outline-none"
                />
              </div>

              {hmacSecret && (
                <div className="mt-3 overflow-hidden rounded-lg border border-app bg-app-elevated">
                  <div className="divide-y divide-[var(--border)]">
                    {(
                      [
                        ["HMAC-SHA1", hmacResults.sha1],
                        ["HMAC-SHA256", hmacResults.sha256],
                        ["HMAC-SHA512", hmacResults.sha512],
                      ] as Array<[string, string]>
                    ).map(([algo, hex]) => (
                      <div
                        key={algo}
                        className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-tool-accent-soft/30"
                      >
                        <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                          {algo}
                        </div>
                        <div className="break-all font-mono text-[0.7rem] text-app">
                          {hex || <span className="text-faint">computing…</span>}
                        </div>
                        <button
                          onClick={() => copy(algo, hex)}
                          disabled={!hex}
                          className="shrink-0 rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                        >
                          {copied === algo ? "✓" : "copy"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-3 font-mono text-[0.65rem] leading-relaxed text-muted">
                <span className="text-tool-accent">{"//"}</span> HMAC authenticates — only someone with the secret can produce a valid digest of your message. Used in Stripe, GitHub, and Slack webhook signatures.
              </p>
            </div>
          </div>
        </section>
      </ToolShell>
    </div>
  );
}
