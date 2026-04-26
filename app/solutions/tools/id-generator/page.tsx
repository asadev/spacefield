"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

type IdType = "uuid" | "uuidv7" | "nanoid" | "slug" | "ulid" | "ksuid" | "shorthash";

const NANO_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
// Crockford base32 (no I, L, O, U)
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

function uuidV4(): string {
  // Prefer native
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function nanoid(size: number): string {
  // Mask-based to avoid modulo bias.
  const mask = 63; // alphabet length 64 - 1
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += NANO_ALPHABET[bytes[i] & mask];
  }
  return out;
}

function slugify(raw: string): string {
  const s = (raw || "untitled")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  // Append short nanoid for uniqueness to avoid collisions in batches.
  const suffix = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "x";
  return s ? `${s}-${suffix}` : suffix;
}

// UUIDv7 — time-ordered UUID (draft RFC).
function uuidV7(): string {
  const now = Date.now();
  // Split 48-bit ms timestamp into upper 16 + lower 32 to avoid >>32 wrap in 32-bit ops.
  const high = Math.floor(now / 0x100000000); // upper 16 bits of the 48-bit timestamp
  const low = now >>> 0; // lower 32 bits
  const bytes = randomBytes(16);
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// KSUID — 27 chars, base62, 4-byte timestamp + 16 random bytes. Sortable.
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// Base62 encode via repeated division on a little-endian digit array (base-256 → base-62).
function base62Encode(bytes: Uint8Array, length: number): string {
  const digits: number[] = []; // little-endian base-62
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const v = digits[j] * 256 + carry;
      digits[j] = v % 62;
      carry = Math.floor(v / 62);
    }
    while (carry > 0) {
      digits.push(carry % 62);
      carry = Math.floor(carry / 62);
    }
  }
  // reverse → big-endian, then left-pad to desired length
  let out = "";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE62[digits[i]];
  while (out.length < length) out = "0" + out;
  return out;
}
function ksuid(): string {
  const buf = new Uint8Array(20);
  // KSUID epoch = 2014-05-13 Unix time 1400000000
  const secs = Math.floor(Date.now() / 1000) - 1400000000;
  buf[0] = (secs >> 24) & 0xff;
  buf[1] = (secs >> 16) & 0xff;
  buf[2] = (secs >> 8) & 0xff;
  buf[3] = secs & 0xff;
  const rnd = randomBytes(16);
  buf.set(rnd, 4);
  return base62Encode(buf, 27);
}

// Short hash-based ID: base62 of 6 random bytes (~36 bits entropy).
function shortHash(): string {
  return base62Encode(randomBytes(6), 8);
}

function ulid(): string {
  // 10-char time + 16-char random = 26 chars. Shorter variant below.
  const now = Date.now();
  let time = "";
  let t = now;
  for (let i = 9; i >= 0; i--) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let rand = "";
  // Encode 16 random bytes as 16 crockford chars (5 bits each — not a full ULID but a "short ULID" feel)
  for (let i = 0; i < 16; i++) rand += CROCKFORD[rnd[i] % 32];
  return time + rand;
}

function generateOne(
  type: IdType,
  opts: { nanoLen: number; slugBase: string }
): string {
  switch (type) {
    case "uuid":
      return uuidV4();
    case "uuidv7":
      return uuidV7();
    case "nanoid":
      return nanoid(opts.nanoLen);
    case "slug":
      return slugify(opts.slugBase);
    case "ulid":
      return ulid();
    case "ksuid":
      return ksuid();
    case "shorthash":
      return shortHash();
  }
}

const FORMATS: { id: IdType; label: string; meta: string }[] = [
  { id: "uuid", label: "UUID v4", meta: "rfc4122" },
  { id: "uuidv7", label: "UUID v7", meta: "time-sorted" },
  { id: "nanoid", label: "nanoid", meta: "url-safe" },
  { id: "ulid", label: "ULID", meta: "crockford" },
  { id: "ksuid", label: "KSUID", meta: "27ch base62" },
  { id: "shorthash", label: "ShortHash", meta: "8ch" },
  { id: "slug", label: "Slug", meta: "from text" },
];

// Render an id with the leading sortable/timestamp prefix highlighted in tool-accent.
function renderHighlighted(id: string, type: IdType) {
  if (!id) return <>—</>;
  let prefixLen = 0;
  if (type === "uuid" || type === "uuidv7") prefixLen = 8;
  else if (type === "ulid") prefixLen = 10;
  else if (type === "ksuid") prefixLen = 7;
  else if (type === "shorthash") prefixLen = 3;
  if (prefixLen === 0 || prefixLen >= id.length) {
    return <span className="text-tool-accent">{id}</span>;
  }
  return (
    <>
      <span className="text-tool-accent">{id.slice(0, prefixLen)}</span>
      <span className="text-app">{id.slice(prefixLen)}</span>
    </>
  );
}

export default function IdGeneratorPage() {
  const [type, setType] = useState<IdType>("uuid");
  const [count, setCount] = useState(10);
  const [nanoLen, setNanoLen] = useState(21);
  const [slugBase, setSlugBase] = useState("New Blog Post Title");
  const [tick, setTick] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const ids = useMemo(() => {
    const n = Math.max(1, Math.min(100, Math.floor(count)));
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push(generateOne(type, { nanoLen, slugBase }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, count, nanoLen, slugBase, tick]);

  const primary = ids[0] ?? "";

  const regen = () => {
    setTick((t) => t + 1);
    setCopiedIdx(null);
    setCopiedAll(false);
  };
  const copyAll = () => {
    navigator.clipboard?.writeText(ids.join("\n"));
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1500);
  };
  const copyOne = (v: string, i: number) => {
    navigator.clipboard?.writeText(v);
    setCopiedIdx(i);
    window.setTimeout(() => setCopiedIdx((cur) => (cur === i ? null : cur)), 1200);
  };
  const downloadCsv = () => {
    const header = "index,id\n";
    const body = ids.map((id, i) => `${i + 1},${id}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-ids.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const charLen = primary.length;
  const activeFormat = FORMATS.find((f) => f.id === type);

  return (
    <div data-tool-theme="data" data-tool="id-generator">
      <ToolShell
        category="Data & Developer"
        title="ID Generator"
        description="Generate UUID v4/v7, nanoid, ULID, KSUID, slugs and short hashes. Batch up to 100 at a time."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — format + count chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {activeFormat?.label.toLowerCase()}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              n={ids.length}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              len={charLen}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              identifier.foundry
              <span className="text-faint">/</span>
              <span className="text-secondary">emit({activeFormat?.id}).id</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">◉ csprng</div>
          </div>

          <div className="relative p-5">
            <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              Fresh value · primary.id
            </div>

            <div className="mt-3 break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              {renderHighlighted(primary, type)}
            </div>

            <div className="mt-3 h-px w-full bg-gradient-to-r from-tool-accent via-tool-accent-soft to-transparent" />

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                onClick={regen}
                className="rounded-lg bg-tool-accent px-3 py-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                ↻ Regenerate
              </button>
              <button
                onClick={() => copyOne(primary, -1)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                {copiedIdx === -1 ? "✓ Copied" : "⧉ Copy"}
              </button>
              <button
                onClick={copyAll}
                className="rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                {copiedAll ? "✓ Copied all" : `⧉ Copy ${ids.length}`}
              </button>
              <button
                onClick={downloadCsv}
                className="rounded-lg border border-app bg-app-elevated px-3 py-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                ↓ CSV
              </button>
            </div>
          </div>
        </section>

        {/* ============================== FORMAT SEGMENTED ============================== */}
        <ToolCard
          title="Format"
          subtitle="Pick an ID scheme"
          className="mb-6"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
              {FORMATS.length} schemes
            </span>
            <span className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
              format.select
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => {
              const active = f.id === type;
              return (
                <button
                  key={f.id}
                  onClick={() => setType(f.id)}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                    active
                      ? "border-tool-accent bg-tool-accent text-app-elevated"
                      : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                  }`}
                  style={active ? { color: "var(--bg)" } : undefined}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      active ? "bg-app-elevated" : "bg-app group-hover:bg-tool-accent"
                    }`}
                    style={active ? { backgroundColor: "var(--bg)" } : undefined}
                  />
                  <span className="font-mono text-xs font-semibold">{f.label}</span>
                  <span
                    className={`font-mono text-[0.55rem] uppercase tracking-[0.15em] ${
                      active ? "" : "text-faint"
                    }`}
                    style={active ? { color: "var(--bg)", opacity: 0.7 } : undefined}
                  >
                    {f.meta}
                  </span>
                </button>
              );
            })}
          </div>
        </ToolCard>

        {/* ============================== BATCH + OUTPUT ============================== */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
          {/* batch config */}
          <ToolCard title="Batch config" subtitle="1 — 100 ids">
            <div>
              <label className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                Count
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value))}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-tool-accent-soft"
                  style={{ accentColor: "var(--tool-accent)" }}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value || "1"))}
                  className="w-16 rounded-md border border-app bg-app px-2 py-1.5 text-right font-mono text-sm text-app outline-none transition-colors focus:border-tool-accent"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[1, 5, 10, 25, 50, 100].map((n) => {
                  const active = count === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`rounded-md border px-2 py-1 font-mono text-[0.65rem] transition-colors ${
                        active
                          ? "border-tool-accent bg-tool-accent"
                          : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                      }`}
                      style={active ? { color: "var(--bg)" } : undefined}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            {type === "nanoid" && (
              <div className="mt-5">
                <label className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                  nanoid length
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[6, 8, 12, 16, 21, 32].map((n) => {
                    const active = nanoLen === n;
                    return (
                      <button
                        key={n}
                        onClick={() => setNanoLen(n)}
                        className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                          active
                            ? "border-tool-accent bg-tool-accent"
                            : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                        }`}
                        style={active ? { color: "var(--bg)" } : undefined}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {type === "slug" && (
              <div className="mt-5">
                <label className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-secondary">
                  source text
                </label>
                <input
                  value={slugBase}
                  onChange={(e) => setSlugBase(e.target.value)}
                  className="mt-2 w-full rounded-md border border-app bg-app px-3 py-2 font-mono text-sm text-app placeholder:text-faint outline-none transition-colors focus:border-tool-accent"
                  placeholder="Enter title"
                />
              </div>
            )}

            <div className="mt-5 rounded-lg border border-app bg-app p-3 font-mono text-[0.65rem] leading-relaxed text-muted">
              <span className="text-tool-accent">//</span> all values generated client-side via{" "}
              <span className="text-tool-accent">crypto.getRandomValues</span>. nothing leaves your browser.
            </div>
          </ToolCard>

          {/* output stream */}
          <ToolCard title="Output stream" subtitle={`${ids.length} row${ids.length === 1 ? "" : "s"}`}>
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary">
                {activeFormat?.label}
              </span>
              <div className="flex items-center gap-2 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-tool-accent" />
                live
              </div>
            </div>

            <div className="max-h-[560px] overflow-auto rounded-lg border border-app bg-app-elevated">
              <ul className="divide-y divide-[color:var(--border)]">
                {ids.map((id, i) => (
                  <li
                    key={i}
                    className="group flex items-center gap-3 border-app px-3 py-2 transition-colors hover:bg-tool-accent-soft"
                  >
                    <span className="w-8 shrink-0 text-right font-mono text-[0.6rem] text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <code className="flex-1 truncate font-mono text-xs">
                      {renderHighlighted(id, type)}
                    </code>
                    <button
                      onClick={() => copyOne(id, i)}
                      className={`rounded border px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] transition-colors ${
                        copiedIdx === i
                          ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                          : "border-app bg-app text-secondary hover:border-tool-accent hover:text-tool-accent"
                      }`}
                    >
                      {copiedIdx === i ? "✓" : "copy"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </ToolCard>
        </div>

        {/* ============================== REFERENCE ============================== */}
        <ToolCard
          title="Reference"
          subtitle="Format spec"
          className="mt-6"
        >
          <div className="grid grid-cols-1 gap-2 font-mono text-[0.65rem] leading-relaxed text-secondary sm:grid-cols-2">
            <div>
              <span className="text-tool-accent">UUID v4</span> — RFC 4122 random. 122 bits entropy. Great default.
            </div>
            <div>
              <span className="text-tool-accent">UUID v7</span> — draft RFC 9562. Time-prefixed, sortable. Index-friendly.
            </div>
            <div>
              <span className="text-tool-accent">nanoid</span> — URL-safe, 64-char alphabet. 21 chars ≈ UUID odds.
            </div>
            <div>
              <span className="text-tool-accent">Slug</span> — kebab-case slug + 6-char unique suffix.
            </div>
            <div>
              <span className="text-tool-accent">ULID</span> — Crockford base32, lexicographically sortable.
            </div>
            <div>
              <span className="text-tool-accent">KSUID</span> — Segment&apos;s 27ch base62, ts(2014-05-13) + 16 rand.
            </div>
            <div className="sm:col-span-2">
              <span className="text-tool-accent">ShortHash</span> — 8ch base62 (~48 bits). Non-security short IDs only.
            </div>
          </div>
        </ToolCard>
      </ToolShell>
    </div>
  );
}
