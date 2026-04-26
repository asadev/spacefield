"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard from "../../_components/ToolCard";

type Tab = "parse" | "encode" | "base64" | "qs-builder";
type Param = { key: string; value: string };

const SAMPLE =
  "https://example.com:8443/search/results?q=hello%20world&lang=en-US&utm_source=newsletter#top";

function parseUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    const params: Param[] = [];
    u.searchParams.forEach((v, k) => params.push({ key: k, value: v }));
    return {
      ok: true as const,
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port,
      path: u.pathname,
      hash: u.hash.replace(/^#/, ""),
      params,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function buildUrl(
  protocol: string,
  host: string,
  port: string,
  path: string,
  params: Param[],
  hash: string
): string {
  const proto = protocol || "https";
  const base = `${proto}://${host}${port ? `:${port}` : ""}${path.startsWith("/") ? path : "/" + path}`;
  const qs = params
    .filter((p) => p.key !== "" || p.value !== "")
    .map(
      (p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`
    )
    .join("&");
  return `${base}${qs ? "?" + qs : ""}${hash ? "#" + hash : ""}`;
}

function b64Encode(s: string): string {
  try {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function b64Decode(s: string): string {
  try {
    const bin = atob(s.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export default function UrlEncoderParserPage() {
  const [tab, setTab] = useState<Tab>("parse");
  const [input, setInput] = useState(SAMPLE);
  const [parsed, setParsed] = useState(() => parseUrl(SAMPLE));

  const [protocol, setProtocol] = useState("https");
  const [host, setHost] = useState("example.com");
  const [port, setPort] = useState("");
  const [path, setPath] = useState("/");
  const [hash, setHash] = useState("");
  const [params, setParams] = useState<Param[]>([]);

  // Encode/decode tab state
  const [rawText, setRawText] = useState("Hello World / foo=bar&baz=qux");
  const [encoded, setEncoded] = useState(() => encodeURIComponent("Hello World / foo=bar&baz=qux"));

  // Base64 tab state
  const [b64Input, setB64Input] = useState("Hello, world");
  const [b64Out, setB64Out] = useState(() => b64Encode("Hello, world"));
  const [b64Mode, setB64Mode] = useState<"encode" | "decode">("encode");

  // Query-string builder tab state
  const [qsBase, setQsBase] = useState("https://example.com/search");
  const [qsParams, setQsParams] = useState<Param[]>([
    { key: "q", value: "hello world" },
    { key: "lang", value: "en" },
    { key: "utm_source", value: "newsletter" },
  ]);

  // Sync parse state when user pastes.
  useEffect(() => {
    const r = parseUrl(input);
    setParsed(r);
    if (r.ok) {
      setProtocol(r.protocol);
      setHost(r.host);
      setPort(r.port);
      setPath(r.path);
      setHash(r.hash);
      setParams(r.params);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const rebuilt = useMemo(
    () => buildUrl(protocol, host, port, path, params, hash),
    [protocol, host, port, path, params, hash]
  );

  const updateParam = (i: number, patch: Partial<Param>) =>
    setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addParam = () => setParams((p) => [...p, { key: "", value: "" }]);
  const removeParam = (i: number) => setParams((p) => p.filter((_, idx) => idx !== i));

  const copyRebuilt = () => navigator.clipboard?.writeText(rebuilt);

  // Encode/decode helpers
  const swapEncodeDecode = () => {
    try {
      setRawText(decodeURIComponent(encoded));
    } catch {
      // leave as-is on error
    }
  };

  // Tabs metadata
  const tabs: { k: Tab; label: string; sigil: string }[] = [
    { k: "parse", label: "Parse & rebuild", sigil: "/?#" },
    { k: "encode", label: "Encode / decode", sigil: "%xx" },
    { k: "base64", label: "Base64", sigil: "b64" },
    { k: "qs-builder", label: "QS builder", sigil: "&=" },
  ];

  return (
    <div data-tool-theme="data" data-tool="url-encoder-parser">
      <ToolShell
        category="Data & Developer"
        title="URL Encoder & Parser"
        description="Break a URL into editable parts and rebuild it. Also handles encodeURIComponent, decodeURIComponent, and base64."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — status chips, no traffic dots */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              {`{/}`} uri.dissector
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              tab:{tab}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              url.tool
              <span className="text-faint">/</span>
              <span className="text-secondary">
                {parsed.ok ? "parsed=ok" : "parsed=err"}
              </span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              ◉ client-only
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  URL Encoder &amp; Parser · Dissect, encode, rebuild
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  URL Encoder &amp; Parser
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-secondary">
                  Break a URL into editable parts and rebuild it. Plus encodeURIComponent, decodeURIComponent, base64.
                </p>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
              {tabs.map(({ k, label, sigil }) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    tab === k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  <span className={tab === k ? "text-tool-accent" : "text-faint"}>{sigil}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {tab === "parse" && (
          <div className="space-y-5">
            {/* Top: full URL input in mono */}
            <ToolCard title="URI input" subtitle="paste a URL to dissect">
              <div className="mb-3 flex items-center justify-end">
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.6rem] text-tool-accent">
                  {input.length} chars
                </span>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[72px] resize-y break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                placeholder="https://..."
              />
              {!parsed.ok && (
                <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-500">
                  {parsed.error}
                </div>
              )}
            </ToolCard>

            {/* Bottom: parsed parts as cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Scheme */}
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    scheme
                  </div>
                  <div className="font-mono text-[0.55rem] text-faint">://</div>
                </div>
                <input
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app outline-none focus:border-tool-accent"
                />
              </div>

              {/* Host */}
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    host
                  </div>
                  <div className="font-mono text-[0.55rem] text-faint">authority</div>
                </div>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app outline-none focus:border-tool-accent"
                />
              </div>

              {/* Port */}
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    port
                  </div>
                  <div className="font-mono text-[0.55rem] text-faint">:</div>
                </div>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="(default)"
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                />
              </div>

              {/* Path */}
              <div className="rounded-xl border border-app bg-app-elevated p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    path
                  </div>
                  <div className="font-mono text-[0.55rem] text-faint">/</div>
                </div>
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="w-full rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app outline-none focus:border-tool-accent"
                />
              </div>
            </div>

            {/* Query params table card */}
            <ToolCard
              title="Query params"
              subtitle={`${params.length} pair${params.length === 1 ? "" : "s"} · ?key=value&...`}
            >
              <div className="mb-3 flex items-center justify-end">
                <button
                  onClick={addParam}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  + Add pair
                </button>
              </div>
              {params.length === 0 ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-app bg-app p-6 font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted">
                  no query parameters
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-app">
                  <div className="grid grid-cols-[1fr_1.5fr_auto] gap-px border-b border-app bg-tool-accent-soft px-2 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    <div className="px-1">key</div>
                    <div className="px-1">value</div>
                    <div className="px-1 text-right">×</div>
                  </div>
                  <div className="divide-y divide-[color:var(--border)]">
                    {params.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 bg-app p-2">
                        <input
                          value={p.key}
                          onChange={(e) => updateParam(i, { key: e.target.value })}
                          placeholder="key"
                          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                        />
                        <input
                          value={p.value}
                          onChange={(e) => updateParam(i, { value: e.target.value })}
                          placeholder="value"
                          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                        />
                        <button
                          onClick={() => removeParam(i)}
                          className="rounded-md border border-app bg-app-elevated px-2 font-mono text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                          title="remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ToolCard>

            {/* Fragment card */}
            <ToolCard title="Fragment" subtitle="#anchor · client-side only">
              <div className="mb-3 flex items-center justify-end">
                <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.6rem] text-tool-accent">
                  #
                </span>
              </div>
              <input
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder="(empty)"
                className="w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
              />
            </ToolCard>

            {/* Rebuilt URL card */}
            <ToolCard title="URI rebuilt" subtitle={`live preview · ${rebuilt.length} chars`}>
              <div className="mb-3 flex items-center justify-end">
                <button
                  onClick={copyRebuilt}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  Copy URL
                </button>
              </div>
              <pre className="break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app">
                {rebuilt}
              </pre>
            </ToolCard>
          </div>
        )}

        {tab === "encode" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
            {/* Decoded pane */}
            <ToolCard title="Decoded view" subtitle="plaintext">
              <div className="mb-3 flex items-center justify-end">
                <button
                  onClick={() => setEncoded(encodeURIComponent(rawText))}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  encode →
                </button>
              </div>
              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setEncoded(encodeURIComponent(e.target.value));
                }}
                spellCheck={false}
                className="w-full min-h-[260px] resize-y rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                placeholder="paste raw text..."
              />
              <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
                <span>{rawText.length.toLocaleString()} chars</span>
                <span>utf-8</span>
              </div>
            </ToolCard>

            {/* Swap arrow */}
            <div className="flex items-center justify-center lg:px-1">
              <button
                onClick={swapEncodeDecode}
                title="Swap: decode → raw"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
              >
                <span className="hidden lg:inline">⇄</span>
                <span className="lg:hidden">⇅</span>
              </button>
            </div>

            {/* Encoded pane */}
            <ToolCard title="Encoded view" subtitle="percent-encoded">
              <div className="mb-3 flex items-center justify-end">
                <button
                  onClick={() => navigator.clipboard?.writeText(encoded)}
                  className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                >
                  copy
                </button>
              </div>
              <textarea
                value={encoded}
                onChange={(e) => setEncoded(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[260px] resize-y break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                placeholder="encoded output..."
              />
              <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
                <span>{encoded.length.toLocaleString()} chars</span>
                <span>%xx</span>
              </div>
            </ToolCard>
          </div>
        )}

        {tab === "qs-builder" && (() => {
          const qs = qsParams
            .filter((p) => p.key !== "" || p.value !== "")
            .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
            .join("&");
          const unencodedQs = qsParams
            .filter((p) => p.key !== "" || p.value !== "")
            .map((p) => `${p.key}=${p.value}`)
            .join("&");
          const full = `${qsBase}${qs ? "?" + qs : ""}`;
          const update = (i: number, patch: Partial<Param>) =>
            setQsParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
          const add = () => setQsParams((p) => [...p, { key: "", value: "" }]);
          const remove = (i: number) => setQsParams((p) => p.filter((_, idx) => idx !== i));
          return (
            <div className="space-y-5">
              {/* Base URL */}
              <ToolCard title="Base URL" subtitle="target endpoint, no query string">
                <div className="mb-3 flex items-center justify-end">
                  <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.6rem] text-tool-accent">
                    {qsBase.length} chars
                  </span>
                </div>
                <input
                  value={qsBase}
                  onChange={(e) => setQsBase(e.target.value)}
                  className="w-full rounded-md border border-app bg-app-elevated px-3 py-2 font-mono text-xs text-app outline-none focus:border-tool-accent"
                />
              </ToolCard>

              {/* QS params table */}
              <ToolCard
                title="Query pairs"
                subtitle={`${qsParams.length} pair${qsParams.length === 1 ? "" : "s"}`}
              >
                <div className="mb-3 flex items-center justify-end">
                  <button
                    onClick={add}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    + Add pair
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-app">
                  <div className="grid grid-cols-[1fr_1.5fr_auto] gap-px border-b border-app bg-tool-accent-soft px-2 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                    <div className="px-1">key</div>
                    <div className="px-1">value</div>
                    <div className="px-1 text-right">×</div>
                  </div>
                  <div className="divide-y divide-[color:var(--border)]">
                    {qsParams.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 bg-app p-2">
                        <input
                          value={p.key}
                          onChange={(e) => update(i, { key: e.target.value })}
                          placeholder="key"
                          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                        />
                        <input
                          value={p.value}
                          onChange={(e) => update(i, { value: e.target.value })}
                          placeholder="value"
                          className="w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                        />
                        <button
                          onClick={() => remove(i)}
                          className="rounded-md border border-app bg-app-elevated px-2 font-mono text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                          title="remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </ToolCard>

              {/* Full URL preview + variants */}
              <ToolCard title="Full URL" subtitle={`${full.length} chars · ready to ship`}>
                <div className="mb-3 flex items-center justify-end">
                  <button
                    onClick={() => navigator.clipboard?.writeText(full)}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    Copy URL
                  </button>
                </div>
                <pre className="break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app">
                  {full}
                </pre>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-app bg-app-elevated p-3">
                    <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                      encoded query
                    </div>
                    <pre className="break-all font-mono text-[0.7rem] text-app">{qs || "(empty)"}</pre>
                  </div>
                  <div className="rounded-lg border border-app bg-app-elevated p-3">
                    <div className="mb-2 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                      unencoded (reference)
                    </div>
                    <pre className="break-all font-mono text-[0.7rem] text-secondary">{unencodedQs || "(empty)"}</pre>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-tool-accent bg-tool-accent-soft p-3 font-mono text-[0.65rem] leading-relaxed text-tool-accent">
                  shortener note → dropping <code className="font-semibold">utm_*</code> params or moving heavy JSON into a base64 hash fragment typically cuts URL length more than a shortener service — and keeps URLs self-hostable.
                </div>
              </ToolCard>
            </div>
          );
        })()}

        {tab === "base64" && (
          <div className="space-y-5">
            {/* Mode pill */}
            <ToolCard title="B64 mode" subtitle="switch direction">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated p-0.5 font-mono text-[0.65rem] uppercase tracking-[0.18em]">
                  {(["encode", "decode"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setB64Mode(m);
                        setB64Out(m === "encode" ? b64Encode(b64Input) : b64Decode(b64Input));
                      }}
                      className={`rounded-md px-3 py-1.5 transition-colors ${
                        b64Mode === m
                          ? "bg-tool-accent-soft text-tool-accent"
                          : "text-secondary hover:text-app"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </ToolCard>

            {/* Dual mono panes with swap arrow */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
              <ToolCard
                title="Input stream"
                subtitle={b64Mode === "encode" ? "plaintext" : "base64"}
              >
                <div className="mb-3 flex items-center justify-end">
                  <button
                    onClick={() => navigator.clipboard?.writeText(b64Input)}
                    className="rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    copy
                  </button>
                </div>
                <textarea
                  value={b64Input}
                  onChange={(e) => {
                    setB64Input(e.target.value);
                    setB64Out(
                      b64Mode === "encode"
                        ? b64Encode(e.target.value)
                        : b64Decode(e.target.value)
                    );
                  }}
                  spellCheck={false}
                  className="w-full min-h-[260px] resize-y break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
                  placeholder={b64Mode === "encode" ? "paste plain text..." : "paste base64..."}
                />
                <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
                  <span>{b64Input.length.toLocaleString()} chars</span>
                  <span>{b64Mode === "encode" ? "utf-8" : "b64"}</span>
                </div>
              </ToolCard>

              <div className="flex items-center justify-center lg:px-1">
                <button
                  onClick={() => {
                    const next = b64Mode === "encode" ? "decode" : "encode";
                    setB64Mode(next);
                    setB64Input(b64Out);
                    setB64Out(next === "encode" ? b64Encode(b64Out) : b64Decode(b64Out));
                  }}
                  title="Swap: send output → input and flip mode"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                >
                  <span className="hidden lg:inline">⇄</span>
                  <span className="lg:hidden">⇅</span>
                </button>
              </div>

              <ToolCard
                title="Output stream"
                subtitle={b64Mode === "encode" ? "base64" : "plaintext"}
              >
                <div className="mb-3 flex items-center justify-end">
                  <button
                    onClick={() => navigator.clipboard?.writeText(b64Out)}
                    className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent hover:text-app-elevated"
                  >
                    copy
                  </button>
                </div>
                <pre className="min-h-[260px] max-h-[400px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app">
                  {b64Out}
                </pre>
                <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
                  <span>{b64Out.length.toLocaleString()} chars</span>
                  <span>{b64Mode === "encode" ? "b64" : "utf-8"}</span>
                </div>
              </ToolCard>
            </div>
          </div>
        )}
      </ToolShell>
    </div>
  );
}
