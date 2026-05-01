"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Format Converters — Native Desktop Workspace App
   ───────────────────────────────────────────────────────────────────────────
   Consolidates Base64, URL, JWT, Hash and QR Code utilities into a single
   sidebar-driven app. Logic ported verbatim from the source tools; the
   marketing-style ToolShell chrome (hero, breadcrumbs, footer) is dropped
   in favour of an OS-native two-column layout sized for the workspace
   window. Foundation tokens only.
═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { NativeAppProps } from "../../../tools/_data/tools-list";

/* ───────────────────────── Shared mini primitives ───────────────────────── */

function Section({
  label,
  meta,
  children,
}: {
  label: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-app bg-app-elevated">
      <div className="flex items-center justify-between border-b border-app bg-app px-3 py-2">
        <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-tool-accent">
          {label}
        </div>
        {meta && (
          <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
            {meta}
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-app bg-app px-2.5 py-1.5 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent";
const textareaCls =
  "w-full resize-y rounded-lg border border-app bg-app p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent";
const btnPrimary =
  "rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent transition-colors hover:bg-tool-accent";
const btnSecondary =
  "rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent";

const copyText = (t: string) => {
  if (typeof navigator !== "undefined") navigator.clipboard?.writeText(t);
};

/* ═══════════════════════════════════════════════════════════════════════════
   Base64 pane
═══════════════════════════════════════════════════════════════════════════ */

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromUrlSafe(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return b64;
}
function looksLikeBase64(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 4) return false;
  if (!/^[A-Za-z0-9+/\-_]+=*$/.test(trimmed)) return false;
  const std = fromUrlSafe(trimmed);
  if (std.length % 4 !== 0) return false;
  try {
    atob(std);
    return true;
  } catch {
    return false;
  }
}
function textToHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0") + " ";
  return out.trim();
}
function textToBin(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(2).padStart(8, "0") + " ";
  return out.trim();
}
function textToDec(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes).join(" ");
}

type B64OutFmt = "base64" | "hex" | "binary" | "decimal";

function Base64Pane() {
  const [text, setText] = useState("hello, world!");
  const [mode, setMode] = useState<"auto" | "encode" | "decode">("auto");
  const [urlSafe, setUrlSafe] = useState(false);
  const [outFmt, setOutFmt] = useState<B64OutFmt>("base64");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileB64, setFileB64] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  const output = useMemo(() => {
    const src = text;
    if (!src) return { kind: "empty" as const };
    const detected = looksLikeBase64(src);
    const effectiveMode = mode === "auto" ? (detected ? "decode" : "encode") : mode;
    try {
      if (effectiveMode === "encode") {
        let result: string;
        switch (outFmt) {
          case "base64": {
            const b64 = utf8ToBase64(src);
            result = urlSafe ? toUrlSafe(b64) : b64;
            break;
          }
          case "hex":
            result = textToHex(src);
            break;
          case "binary":
            result = textToBin(src);
            break;
          case "decimal":
            result = textToDec(src);
            break;
        }
        return { kind: "ok" as const, action: `encode (${outFmt})`, result, effectiveMode };
      } else {
        const std = fromUrlSafe(src.trim());
        const decoded = base64ToUtf8(std);
        return { kind: "ok" as const, action: "decode", result: decoded, effectiveMode };
      }
    } catch (e) {
      return { kind: "err" as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [text, mode, urlSafe, outFmt]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileErr(null);
    if (f.size > 10 * 1024 * 1024) {
      setFileErr("File too large (>10 MB). Try smaller.");
      return;
    }
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.slice(i, i + chunk));
    }
    const b64 = btoa(bin);
    setFileName(f.name);
    setFileMime(f.type || "application/octet-stream");
    setFileB64(urlSafe ? toUrlSafe(b64) : b64);
  };

  const effectiveMode =
    mode === "auto" ? (looksLikeBase64(text) ? "decode" : "encode") : mode;

  return (
    <div className="space-y-4">
      {/* Options */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
          {(["auto", "encode", "decode"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                mode === m
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
          <input
            type="checkbox"
            checked={urlSafe}
            onChange={(e) => setUrlSafe(e.target.checked)}
            className="accent-current"
          />
          url-safe
        </label>

        {effectiveMode === "encode" && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              output:
            </span>
            {(["base64", "hex", "binary", "decimal"] as B64OutFmt[]).map((f) => (
              <button
                key={f}
                onClick={() => setOutFmt(f)}
                className={`rounded-md border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  outFmt === f
                    ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                    : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-tool-accent"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <Section
        label="input.stream"
        meta={effectiveMode === "decode" ? "encoded" : "plaintext"}
      >
        <div className="mb-2 flex justify-end">
          <button onClick={() => copyText(text)} className={btnSecondary}>
            copy
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className={`${textareaCls} min-h-[160px]`}
          placeholder="paste text or base64..."
        />
        <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
          <span>{text.length.toLocaleString()} chars</span>
          <span>
            {mode === "auto"
              ? looksLikeBase64(text)
                ? "auto → decode"
                : "auto → encode"
              : mode}
          </span>
        </div>
      </Section>

      {/* Swap */}
      <div className="flex justify-center">
        <button
          onClick={() => {
            if (output.kind === "ok") setText(output.result);
            setMode((m) =>
              m === "encode"
                ? "decode"
                : m === "decode"
                ? "encode"
                : looksLikeBase64(text)
                ? "encode"
                : "decode"
            );
          }}
          title="Swap output to input"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent transition-colors hover:bg-tool-accent"
        >
          ⇅
        </button>
      </div>

      {/* Output */}
      <Section
        label="output.stream"
        meta={
          output.kind === "ok"
            ? output.action
            : output.kind === "err"
            ? "error"
            : "idle"
        }
      >
        {output.kind === "ok" && (
          <>
            <div className="mb-2 flex justify-end">
              <button onClick={() => copyText(output.result)} className={btnPrimary}>
                copy
              </button>
            </div>
            <pre className="min-h-[140px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
              {output.result}
            </pre>
            <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
              <span>{output.result.length.toLocaleString()} chars</span>
              <span>{effectiveMode === "encode" ? outFmt : "utf-8"}</span>
            </div>
          </>
        )}
        {output.kind === "err" && (
          <div className="min-h-[140px] rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-500">
            {output.error}
          </div>
        )}
        {output.kind === "empty" && (
          <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-app bg-app font-mono text-[0.6rem] uppercase tracking-[0.22em] text-faint">
            awaiting input...
          </div>
        )}
      </Section>

      {/* File */}
      <Section label="binary.upload" meta="file → base64 (≤10 MB)">
        <input
          type="file"
          onChange={handleFile}
          className="block w-full text-xs text-secondary file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-tool-accent file:bg-tool-accent-soft file:px-3 file:py-1.5 file:font-mono file:text-[0.6rem] file:uppercase file:tracking-[0.18em] file:text-tool-accent hover:file:bg-tool-accent"
        />
        {fileName && (
          <div className="mt-2 font-mono text-[0.6rem] text-secondary">
            <span className="text-tool-accent">{fileName}</span>
            <span className="text-muted"> · {fileMime}</span>
          </div>
        )}
        {fileErr && (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-500">
            {fileErr}
          </div>
        )}
        {fileB64 && (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                raw base64
              </span>
              <button onClick={() => copyText(fileB64)} className={btnSecondary}>
                copy
              </button>
            </div>
            <pre className="max-h-[140px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-[0.6rem] text-secondary">
              {fileB64}
            </pre>
            <div className="mt-1 font-mono text-[0.6rem] text-muted">
              {fileB64.length.toLocaleString()} chars
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   URL pane
═══════════════════════════════════════════════════════════════════════════ */

type UrlParam = { key: string; value: string };
type UrlTab = "parse" | "encode" | "qs-builder";

const URL_SAMPLE =
  "https://example.com:8443/search/results?q=hello%20world&lang=en-US&utm_source=newsletter#top";

function parseUrlString(raw: string) {
  try {
    const u = new URL(raw.trim());
    const params: UrlParam[] = [];
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
  params: UrlParam[],
  hash: string
): string {
  const proto = protocol || "https";
  const base = `${proto}://${host}${port ? `:${port}` : ""}${path.startsWith("/") ? path : "/" + path}`;
  const qs = params
    .filter((p) => p.key !== "" || p.value !== "")
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
  return `${base}${qs ? "?" + qs : ""}${hash ? "#" + hash : ""}`;
}

function UrlPane() {
  const [tab, setTab] = useState<UrlTab>("parse");
  const [input, setInput] = useState(URL_SAMPLE);
  const [parsed, setParsed] = useState(() => parseUrlString(URL_SAMPLE));

  const [protocol, setProtocol] = useState("https");
  const [host, setHost] = useState("example.com");
  const [port, setPort] = useState("");
  const [path, setPath] = useState("/");
  const [hash, setHash] = useState("");
  const [params, setParams] = useState<UrlParam[]>([]);

  const [rawText, setRawText] = useState("Hello World / foo=bar&baz=qux");
  const [encoded, setEncoded] = useState(() =>
    encodeURIComponent("Hello World / foo=bar&baz=qux")
  );

  const [qsBase, setQsBase] = useState("https://example.com/search");
  const [qsParams, setQsParams] = useState<UrlParam[]>([
    { key: "q", value: "hello world" },
    { key: "lang", value: "en" },
    { key: "utm_source", value: "newsletter" },
  ]);

  useEffect(() => {
    const r = parseUrlString(input);
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

  const updateParam = (i: number, patch: Partial<UrlParam>) =>
    setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addParam = () => setParams((p) => [...p, { key: "", value: "" }]);
  const removeParam = (i: number) => setParams((p) => p.filter((_, idx) => idx !== i));

  const tabs: { k: UrlTab; label: string }[] = [
    { k: "parse", label: "Parse" },
    { k: "encode", label: "Encode" },
    { k: "qs-builder", label: "QS builder" },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
              tab === t.k
                ? "bg-tool-accent-soft text-tool-accent"
                : "text-secondary hover:text-app"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "parse" && (
        <div className="space-y-3">
          <Section label="uri.input" meta={`${input.length} chars`}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className={`${textareaCls} min-h-[64px] break-all`}
              placeholder="https://..."
            />
            {!parsed.ok && (
              <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 font-mono text-xs text-rose-500">
                {parsed.error}
              </div>
            )}
          </Section>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Section label="scheme">
              <input
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                className={inputCls}
              />
            </Section>
            <Section label="host">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputCls}
              />
            </Section>
            <Section label="port">
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="(default)"
                className={inputCls}
              />
            </Section>
            <Section label="path">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className={inputCls}
              />
            </Section>
          </div>

          <Section
            label="query.params"
            meta={`${params.length} pair${params.length === 1 ? "" : "s"}`}
          >
            <div className="mb-2 flex justify-end">
              <button onClick={addParam} className={btnPrimary}>
                + add pair
              </button>
            </div>
            {params.length === 0 ? (
              <div className="rounded-lg border border-dashed border-app bg-app p-3 text-center font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                no parameters
              </div>
            ) : (
              <div className="space-y-1">
                {params.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                    <input
                      value={p.key}
                      onChange={(e) => updateParam(i, { key: e.target.value })}
                      placeholder="key"
                      className={inputCls}
                    />
                    <input
                      value={p.value}
                      onChange={(e) => updateParam(i, { value: e.target.value })}
                      placeholder="value"
                      className={inputCls}
                    />
                    <button
                      onClick={() => removeParam(i)}
                      className="rounded-md border border-app bg-app-elevated px-2 font-mono text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section label="fragment">
            <input
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="(empty)"
              className={inputCls}
            />
          </Section>

          <Section label="uri.rebuilt" meta={`${rebuilt.length} chars`}>
            <div className="mb-2 flex justify-end">
              <button onClick={() => copyText(rebuilt)} className={btnPrimary}>
                copy URL
              </button>
            </div>
            <pre className="break-all rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
              {rebuilt}
            </pre>
          </Section>
        </div>
      )}

      {tab === "encode" && (
        <div className="space-y-3">
          <Section label="decoded.view" meta="plaintext">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setEncoded(encodeURIComponent(rawText))}
                className={btnPrimary}
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
              className={`${textareaCls} min-h-[140px]`}
              placeholder="paste raw text..."
            />
            <div className="mt-1 font-mono text-[0.6rem] text-muted">
              {rawText.length.toLocaleString()} chars · utf-8
            </div>
          </Section>

          <div className="flex justify-center">
            <button
              onClick={() => {
                try {
                  setRawText(decodeURIComponent(encoded));
                } catch {
                  /* leave as-is */
                }
              }}
              title="decode → raw"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent transition-colors hover:bg-tool-accent"
            >
              ⇅
            </button>
          </div>

          <Section label="encoded.view" meta="percent-encoded">
            <div className="mb-2 flex justify-end">
              <button onClick={() => copyText(encoded)} className={btnSecondary}>
                copy
              </button>
            </div>
            <textarea
              value={encoded}
              onChange={(e) => setEncoded(e.target.value)}
              spellCheck={false}
              className={`${textareaCls} min-h-[140px] break-all`}
              placeholder="encoded output..."
            />
            <div className="mt-1 font-mono text-[0.6rem] text-muted">
              {encoded.length.toLocaleString()} chars · %xx
            </div>
          </Section>
        </div>
      )}

      {tab === "qs-builder" &&
        (() => {
          const qs = qsParams
            .filter((p) => p.key !== "" || p.value !== "")
            .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
            .join("&");
          const full = `${qsBase}${qs ? "?" + qs : ""}`;
          const update = (i: number, patch: Partial<UrlParam>) =>
            setQsParams((prev) =>
              prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p))
            );
          const add = () => setQsParams((p) => [...p, { key: "", value: "" }]);
          const remove = (i: number) =>
            setQsParams((p) => p.filter((_, idx) => idx !== i));
          return (
            <div className="space-y-3">
              <Section label="base.url">
                <input
                  value={qsBase}
                  onChange={(e) => setQsBase(e.target.value)}
                  className={inputCls}
                />
              </Section>
              <Section
                label="query.pairs"
                meta={`${qsParams.length} pair${qsParams.length === 1 ? "" : "s"}`}
              >
                <div className="mb-2 flex justify-end">
                  <button onClick={add} className={btnPrimary}>
                    + add pair
                  </button>
                </div>
                <div className="space-y-1">
                  {qsParams.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                      <input
                        value={p.key}
                        onChange={(e) => update(i, { key: e.target.value })}
                        placeholder="key"
                        className={inputCls}
                      />
                      <input
                        value={p.value}
                        onChange={(e) => update(i, { value: e.target.value })}
                        placeholder="value"
                        className={inputCls}
                      />
                      <button
                        onClick={() => remove(i)}
                        className="rounded-md border border-app bg-app-elevated px-2 font-mono text-sm text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
              <Section label="full.url" meta={`${full.length} chars`}>
                <div className="mb-2 flex justify-end">
                  <button onClick={() => copyText(full)} className={btnPrimary}>
                    copy URL
                  </button>
                </div>
                <pre className="break-all rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
                  {full}
                </pre>
              </Section>
            </div>
          );
        })()}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   JWT pane
═══════════════════════════════════════════════════════════════════════════ */

type JwtDecoded =
  | {
      ok: true;
      header: Record<string, unknown>;
      payload: Record<string, unknown>;
      signature: string;
      headerRaw: string;
      payloadRaw: string;
    }
  | { ok: false; error: string };

function jwtBase64UrlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("Invalid base64url encoding");
  }
}

function decodeJwt(token: string): JwtDecoded {
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
    const headerRaw = jwtBase64UrlDecode(parts[0]);
    const payloadRaw = jwtBase64UrlDecode(parts[1]);
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

const JWT_SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsZXggVGhvbXBzb24iLCJpYXQiOjE3NjUwMDAwMDAsImV4cCI6MTc2NTAwMzYwMH0.DjwRbDB5Y1tE4V4sFK1ll7d0cGq0LKd3LR-AkFGTbL0";

const CLAIM_DESCRIPTIONS: Record<string, string> = {
  iss: "Issuer.",
  sub: "Subject.",
  aud: "Audience.",
  exp: "Expiration (epoch sec).",
  nbf: "Not-before (epoch sec).",
  iat: "Issued-at (epoch sec).",
  jti: "JWT ID.",
  azp: "Authorized party.",
  scope: "OAuth scopes.",
  email: "Email.",
  email_verified: "Email verified.",
  name: "Name.",
  preferred_username: "OIDC username.",
  roles: "Roles.",
  permissions: "Permissions.",
};

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

type JwtSegment = "header" | "payload" | "signature";

function JwtPane() {
  const [token, setToken] = useState(JWT_SAMPLE);
  const [secret, setSecret] = useState("");
  const [verify, setVerify] = useState<null | { ok: boolean; checked: boolean }>(null);
  const [segment, setSegment] = useState<JwtSegment>("payload");

  const decoded = useMemo(() => decodeJwt(token), [token]);
  const algorithm =
    decoded.ok && typeof decoded.header["alg"] === "string"
      ? (decoded.header["alg"] as string)
      : "";
  const expMs =
    decoded.ok && typeof decoded.payload["exp"] === "number"
      ? (decoded.payload["exp"] as number) * 1000
      : null;
  const nbfMs =
    decoded.ok && typeof decoded.payload["nbf"] === "number"
      ? (decoded.payload["nbf"] as number) * 1000
      : null;

  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expired = now !== null && expMs !== null && expMs < now;
  const notYet = now !== null && nbfMs !== null && nbfMs > now;
  const expRemaining = now !== null && expMs !== null ? expMs - now : null;

  useEffect(() => {
    setVerify(null);
  }, [token, secret]);

  const runVerify = async () => {
    if (!decoded.ok) return;
    try {
      if (algorithm === "HS256" && secret) {
        const ok = await verifyHs256(token, secret);
        setVerify({ ok, checked: true });
      }
    } catch {
      setVerify({ ok: false, checked: true });
    }
  };

  const tokenParts = token.split(".");

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

  const segments: { k: JwtSegment; label: string }[] = [
    { k: "header", label: "Header" },
    { k: "payload", label: "Payload" },
    { k: "signature", label: "Signature" },
  ];

  const activeCode = decoded.ok
    ? segment === "header"
      ? JSON.stringify(decoded.header, null, 2)
      : segment === "payload"
      ? JSON.stringify(decoded.payload, null, 2)
      : decoded.signature
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${status.tone}`}
        >
          {status.label}
        </span>
        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
          alg:{algorithm || "none"}
        </span>
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
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setToken(JWT_SAMPLE)} className={btnSecondary}>
            sample
          </button>
          <button onClick={() => setToken("")} className={btnSecondary}>
            clear
          </button>
        </div>
      </div>

      <Section label="token.input" meta={`${token.length} chars`}>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="header.payload.signature"
          className={`${textareaCls} min-h-[100px] break-all`}
          spellCheck={false}
        />
        {decoded.ok && (
          <div className="mt-2 break-all rounded-lg border border-app bg-app p-2 font-mono text-[0.65rem] leading-relaxed">
            <span className="text-tool-accent">{tokenParts[0]}</span>
            <span className="text-faint">.</span>
            <span className="text-app">{tokenParts[1]}</span>
            <span className="text-faint">.</span>
            <span className="text-secondary">{tokenParts[2]}</span>
          </div>
        )}
      </Section>

      {!decoded.ok ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 font-mono text-xs text-rose-500">
          <div className="mb-1 text-[0.6rem] uppercase tracking-[0.22em]">
            decode.error
          </div>
          {decoded.error}
        </div>
      ) : (
        <>
          {(expired || notYet) && (
            <div
              className={`rounded-xl border p-3 font-mono text-xs ${
                expired
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-500"
              }`}
            >
              <span className="text-muted">{"// "}</span>
              {expired
                ? `Token expired at ${epochToLocal((decoded.payload.exp as number) || 0)}.`
                : `Token not valid until ${epochToLocal((decoded.payload.nbf as number) || 0)}.`}
            </div>
          )}

          {/* Internal segment tabs */}
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

          <Section label={segment} meta={`${activeCode.length} chars`}>
            <div className="mb-2 flex justify-end">
              <button onClick={() => copyText(activeCode)} className={btnSecondary}>
                copy
              </button>
            </div>
            <pre
              className={`overflow-auto rounded-lg border border-app bg-app p-3 font-mono text-[0.7rem] leading-relaxed text-app ${
                segment === "signature" ? "whitespace-pre-wrap break-all" : ""
              }`}
            >
              {activeCode}
            </pre>
          </Section>

          <Section label="claims.reference" meta="rfc 7519 + common">
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-app text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    <th className="px-2 py-1.5 text-left">claim</th>
                    <th className="px-2 py-1.5 text-left">value</th>
                    <th className="px-2 py-1.5 text-left">meaning</th>
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
                      <tr key={k} className="border-t border-app align-top">
                        <td className="px-2 py-1.5 text-tool-accent">{k}</td>
                        <td className="px-2 py-1.5 max-w-[200px] break-all text-app">
                          {display}
                        </td>
                        <td className="px-2 py-1.5 text-[0.7rem] text-secondary">
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
          </Section>

          <Section label="signature.verify" meta={algorithm || "—"}>
            {algorithm === "HS256" ? (
              <>
                <label className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-tool-accent">
                  shared_secret
                </label>
                <input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="your-secret"
                  type="password"
                  className={`${inputCls} mt-2`}
                  spellCheck={false}
                />
                <button
                  onClick={runVerify}
                  disabled={!secret}
                  className="mt-3 w-full rounded-lg bg-tool-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--bg)" }}
                >
                  verify.signature()
                </button>
                {verify?.checked && (
                  <div
                    className={`mt-3 flex items-center gap-2 rounded-lg border p-2 font-mono text-xs ${
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
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-xs text-amber-500">
                {`HS256 verification only — got alg=${algorithm || "none"}.`}
              </div>
            )}
            <p className="mt-3 border-t border-app pt-3 font-mono text-[0.6rem] leading-relaxed text-amber-500">
              <span className="font-semibold">{"// WARN:"}</span> verify runs in your
              browser only — never paste production secrets.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hash pane
═══════════════════════════════════════════════════════════════════════════ */

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

  const len = bytes.length;
  const nBlocks = Math.floor((len + 8) / 64) + 1;
  const padded = new Uint8Array(nBlocks * 64);
  padded.set(bytes);
  padded[len] = 0x80;
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
    const out = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return out.map((bb) => bb.toString(16).padStart(2, "0")).join("");
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

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
  for (let i = 0; i < bytes.length; i++)
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xff];
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

async function hmacHex(
  secret: string,
  bytes: Uint8Array,
  algo: "SHA-1" | "SHA-256" | "SHA-512"
): Promise<string> {
  const enc = new TextEncoder();
  const keyBuf = enc.encode(secret).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: algo },
    false,
    ["sign"]
  );
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
    typeof source === "string"
      ? new TextEncoder().encode(source)
      : new Uint8Array(source);
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

function HashPane() {
  const [text, setText] = useState("hello world");
  const [hashes, setHashes] = useState({
    md5: "",
    sha1: "",
    sha256: "",
    sha384: "",
    sha512: "",
    crc32: "",
  });
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
    copyText(t);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
          {fileName ? "FILE" : "TEXT"}
        </span>
        <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
          {inputBytes}b
        </span>
        <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
          {busy ? "hashing…" : "live"}
        </span>
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

      <Section
        label={`${activeAlgo}.featured`}
        meta={`${inputBytes} byte${inputBytes === 1 ? "" : "s"}`}
      >
        <div className="break-all rounded-lg border border-app bg-app px-3 py-2 font-mono text-xs leading-relaxed text-app">
          {featured?.[1] || <span className="text-faint">— awaiting input —</span>}
        </div>
      </Section>

      <Section label="input" meta={fileName ? `file: ${fileName}` : "text mode"}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={6}
          className={textareaCls}
          placeholder="hello world"
        />
      </Section>

      <Section label="digests" meta="hex · lowercase · live">
        <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
          <div className="divide-y divide-[var(--border)]">
            {rows.map(([algo, hex]) => (
              <div
                key={algo}
                className={`grid grid-cols-[5rem_1fr_auto] items-center gap-2 px-3 py-2 ${
                  algo === activeAlgo ? "bg-tool-accent-soft/40" : ""
                }`}
              >
                <button
                  onClick={() => setActiveAlgo(algo)}
                  className={`text-left font-mono text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${
                    algo === activeAlgo
                      ? "text-tool-accent"
                      : "text-secondary hover:text-tool-accent"
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
                  className="shrink-0 rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                >
                  {copied === algo ? "✓" : "copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section label="hmac · keyed digest" meta="webhook signatures">
        <input
          type="password"
          placeholder="paste shared secret…"
          value={hmacSecret}
          onChange={(e) => setHmacSecret(e.target.value)}
          className={inputCls}
        />
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
                  className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 px-3 py-2"
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
                    className="shrink-0 rounded-md border border-app bg-app px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent disabled:opacity-40"
                  >
                    {copied === algo ? "✓" : "copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   QR Code pane
═══════════════════════════════════════════════════════════════════════════ */

type QrMode = "url" | "text" | "vcard" | "wifi" | "sms" | "geo" | "email";

function escapeMecard(v: string) {
  return v.replace(/([\\;,:])/g, "\\$1");
}
function escapeWifi(v: string) {
  return v.replace(/([\\;,":])/g, "\\$1");
}

function QrPane() {
  const [mode, setMode] = useState<QrMode>("url");
  const [text, setText] = useState("https://spacefield.co");
  const [size, setSize] = useState("320");
  const [margin, setMargin] = useState("2");
  const [ecl, setEcl] = useState<"L" | "M" | "Q" | "H">("M");
  const [dark, setDark] = useState("#0a0a0a");
  const [light, setLight] = useState("#ffffff");
  const [svg, setSvg] = useState("");
  const [dataUrl, setDataUrl] = useState("");

  const [vName, setVName] = useState("Alex Thompson");
  const [vOrg, setVOrg] = useState("Acme Inc");
  const [vTitle, setVTitle] = useState("Head of Growth");
  const [vPhone, setVPhone] = useState("+1 555 123 4567");
  const [vEmail, setVEmail] = useState("alex@acme.com");
  const [vUrl, setVUrl] = useState("https://acme.com");

  const [wifiSsid, setWifiSsid] = useState("My Network");
  const [wifiPw, setWifiPw] = useState("correct-horse");
  const [wifiEnc, setWifiEnc] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);

  const [smsNum, setSmsNum] = useState("+15551234567");
  const [smsBody, setSmsBody] = useState("Hello from a QR code");

  const [geoLat, setGeoLat] = useState("24.4539");
  const [geoLng, setGeoLng] = useState("54.3773");

  const [emailAddr, setEmailAddr] = useState("hello@example.com");
  const [emailSub, setEmailSub] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const payload = useMemo(() => {
    switch (mode) {
      case "url":
      case "text":
        return text;
      case "vcard": {
        const parts = [
          `N:${escapeMecard(vName)}`,
          vOrg ? `ORG:${escapeMecard(vOrg)}` : "",
          vTitle ? `TITLE:${escapeMecard(vTitle)}` : "",
          vPhone ? `TEL:${escapeMecard(vPhone)}` : "",
          vEmail ? `EMAIL:${escapeMecard(vEmail)}` : "",
          vUrl ? `URL:${escapeMecard(vUrl)}` : "",
        ].filter(Boolean);
        return `MECARD:${parts.join(";")};;`;
      }
      case "wifi": {
        const parts = [
          `T:${wifiEnc}`,
          `S:${escapeWifi(wifiSsid)}`,
          wifiEnc !== "nopass" ? `P:${escapeWifi(wifiPw)}` : "",
          wifiHidden ? "H:true" : "",
        ].filter(Boolean);
        return `WIFI:${parts.join(";")};;`;
      }
      case "sms":
        return `SMSTO:${smsNum}:${smsBody}`;
      case "geo":
        return `geo:${geoLat},${geoLng}`;
      case "email": {
        const qs: string[] = [];
        if (emailSub) qs.push(`subject=${encodeURIComponent(emailSub)}`);
        if (emailBody) qs.push(`body=${encodeURIComponent(emailBody)}`);
        return `mailto:${emailAddr}${qs.length ? "?" + qs.join("&") : ""}`;
      }
    }
  }, [
    mode,
    text,
    vName,
    vOrg,
    vTitle,
    vPhone,
    vEmail,
    vUrl,
    wifiSsid,
    wifiPw,
    wifiEnc,
    wifiHidden,
    smsNum,
    smsBody,
    geoLat,
    geoLng,
    emailAddr,
    emailSub,
    emailBody,
  ]);

  useEffect(() => {
    let cancelled = false;
    const input = (payload || "").trim() || " ";
    const stringOpts = {
      errorCorrectionLevel: ecl,
      margin: parseInt(margin) || 0,
      width: parseInt(size) || 320,
      color: { dark, light },
      type: "svg" as const,
    };
    const dataUrlOpts = {
      errorCorrectionLevel: ecl,
      margin: parseInt(margin) || 0,
      width: parseInt(size) || 320,
      color: { dark, light },
    };
    const run = async () => {
      try {
        const [s, baseDataUrl] = await Promise.all([
          QRCode.toString(input, stringOpts),
          QRCode.toDataURL(input, dataUrlOpts),
        ]);
        if (cancelled) return;
        setSvg(s);
        setDataUrl(baseDataUrl);
      } catch {
        if (!cancelled) {
          setSvg("");
          setDataUrl("");
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [payload, size, margin, ecl, dark, light]);

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr.svg";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr.png";
    a.click();
  };

  const modes: { k: QrMode; label: string }[] = [
    { k: "url", label: "URL" },
    { k: "text", label: "Text" },
    { k: "vcard", label: "vCard" },
    { k: "wifi", label: "Wi-Fi" },
    { k: "sms", label: "SMS" },
    { k: "email", label: "Email" },
    { k: "geo", label: "Geo" },
  ];

  const eclLevels: { k: "L" | "M" | "Q" | "H"; label: string; pct: string }[] = [
    { k: "L", label: "L", pct: "7%" },
    { k: "M", label: "M", pct: "15%" },
    { k: "Q", label: "Q", pct: "25%" },
    { k: "H", label: "H", pct: "30%" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
          {modes.map((m) => (
            <button
              key={m.k}
              onClick={() => setMode(m.k)}
              className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                mode === m.k
                  ? "bg-tool-accent-soft text-tool-accent"
                  : "text-secondary hover:text-app"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={downloadPng}
            className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
            style={{ color: "var(--bg)" }}
          >
            PNG
          </button>
          <button onClick={downloadSvg} className={btnSecondary}>
            SVG
          </button>
        </div>
      </div>

      <Section label={`preview · ${mode}`} meta={`ECC ${ecl}`}>
        <div
          className="relative mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center rounded-xl border border-app p-4"
          style={{ backgroundColor: light }}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR code" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-muted">No content yet</span>
          )}
        </div>
      </Section>

      <Section label="content" meta={mode.toUpperCase()}>
        {(mode === "url" || mode === "text") && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${textareaCls} min-h-[80px]`}
          />
        )}
        {mode === "vcard" && (
          <div className="space-y-2">
            <input
              value={vName}
              onChange={(e) => setVName(e.target.value)}
              placeholder="Name"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={vOrg}
                onChange={(e) => setVOrg(e.target.value)}
                placeholder="Organization"
                className={inputCls}
              />
              <input
                value={vTitle}
                onChange={(e) => setVTitle(e.target.value)}
                placeholder="Title"
                className={inputCls}
              />
            </div>
            <input
              value={vPhone}
              onChange={(e) => setVPhone(e.target.value)}
              placeholder="Phone"
              className={inputCls}
            />
            <input
              value={vEmail}
              onChange={(e) => setVEmail(e.target.value)}
              placeholder="Email"
              className={inputCls}
            />
            <input
              value={vUrl}
              onChange={(e) => setVUrl(e.target.value)}
              placeholder="URL"
              className={inputCls}
            />
          </div>
        )}
        {mode === "wifi" && (
          <div className="space-y-2">
            <input
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              placeholder="SSID"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={wifiEnc}
                onChange={(e) => setWifiEnc(e.target.value as "WPA" | "WEP" | "nopass")}
                className={inputCls}
              >
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">Open</option>
              </select>
              <select
                value={wifiHidden ? "yes" : "no"}
                onChange={(e) => setWifiHidden(e.target.value === "yes")}
                className={inputCls}
              >
                <option value="no">Visible</option>
                <option value="yes">Hidden</option>
              </select>
            </div>
            {wifiEnc !== "nopass" && (
              <input
                value={wifiPw}
                onChange={(e) => setWifiPw(e.target.value)}
                placeholder="Password"
                className={inputCls}
              />
            )}
          </div>
        )}
        {mode === "sms" && (
          <div className="space-y-2">
            <input
              value={smsNum}
              onChange={(e) => setSmsNum(e.target.value)}
              placeholder="+1..."
              className={inputCls}
            />
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              placeholder="Message"
              className={`${textareaCls} min-h-[60px]`}
            />
          </div>
        )}
        {mode === "email" && (
          <div className="space-y-2">
            <input
              value={emailAddr}
              onChange={(e) => setEmailAddr(e.target.value)}
              placeholder="Email"
              className={inputCls}
            />
            <input
              value={emailSub}
              onChange={(e) => setEmailSub(e.target.value)}
              placeholder="Subject (optional)"
              className={inputCls}
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Body (optional)"
              className={`${textareaCls} min-h-[60px]`}
            />
          </div>
        )}
        {mode === "geo" && (
          <div className="grid grid-cols-2 gap-2">
            <input
              value={geoLat}
              onChange={(e) => setGeoLat(e.target.value)}
              placeholder="Latitude"
              className={inputCls}
            />
            <input
              value={geoLng}
              onChange={(e) => setGeoLng(e.target.value)}
              placeholder="Longitude"
              className={inputCls}
            />
          </div>
        )}
      </Section>

      <Section label="encoded.payload">
        <pre className="max-h-[100px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-2 font-mono text-[0.7rem] text-app">
          {payload}
        </pre>
      </Section>

      <Section label="dimensions">
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              <span>Size</span>
              <span>{size} px</span>
            </div>
            <input
              type="range"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              min={64}
              max={1024}
              step={16}
              className="w-full"
              style={{ accentColor: "var(--tool-accent)" }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                Size (px)
              </div>
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className={inputCls}
                min={64}
                max={1024}
                step={16}
              />
            </div>
            <div>
              <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
                Margin
              </div>
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                className={inputCls}
                min={0}
                max={10}
                step={1}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section label="colors">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              Foreground
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className="h-9 w-10 cursor-pointer rounded-md border border-app bg-transparent p-1"
              />
              <input
                value={dark}
                onChange={(e) => setDark(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              Background
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className="h-9 w-10 cursor-pointer rounded-md border border-app bg-transparent p-1"
              />
              <input
                value={light}
                onChange={(e) => setLight(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section label="error correction">
        <div className="grid grid-cols-4 gap-1.5">
          {eclLevels.map(({ k, label, pct }) => (
            <button
              key={k}
              onClick={() => setEcl(k)}
              className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                ecl === k
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-app bg-app-elevated text-secondary hover:border-tool-accent hover:text-app"
              }`}
            >
              <div className="text-sm font-bold">{label}</div>
              <div className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-wider opacity-70">
                {pct}
              </div>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sidebar + main shell
═══════════════════════════════════════════════════════════════════════════ */

type Converter = "base64" | "url" | "jwt" | "hash" | "qr";

const CONVERTERS: {
  k: Converter;
  name: string;
  icon: string;
  hint: string;
}[] = [
  { k: "base64", name: "Base64", icon: "b64", hint: "encode / decode" },
  { k: "url", name: "URL", icon: "?=", hint: "parse / encode" },
  { k: "jwt", name: "JWT", icon: "{ }", hint: "decode / verify" },
  { k: "hash", name: "Hash", icon: "#", hint: "MD5 · SHA · CRC" },
  { k: "qr", name: "QR Code", icon: "▦", hint: "generate / download" },
];

export default function FormatConvertersApp(_props: NativeAppProps) {
  const [active, setActive] = useState<Converter>("base64");
  const narrow = (_props.width ?? 0) < 640;

  return (
    <div
      data-tool-theme="data"
      data-tool="format-converters"
      className="flex h-full w-full overflow-hidden bg-app text-app"
      style={{
        height: _props.height ?? "100%",
      }}
    >
      {/* Sidebar */}
      <aside
        className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-app bg-app-elevated p-2"
        style={{ width: narrow ? 96 : 220 }}
      >
        <div className="mb-1 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
          {narrow ? "fmt" : "format converters"}
        </div>
        {CONVERTERS.map((c) => {
          const isActive = active === c.k;
          return (
            <button
              key={c.k}
              onClick={() => setActive(c.k)}
              className={`group flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                isActive
                  ? "border-tool-accent bg-tool-accent-soft text-tool-accent"
                  : "border-transparent bg-transparent text-secondary hover:border-app hover:bg-app hover:text-app"
              }`}
              title={c.name}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[0.6rem] font-semibold ${
                  isActive
                    ? "border-tool-accent bg-tool-accent text-app-elevated"
                    : "border-app bg-app text-secondary group-hover:border-tool-accent group-hover:text-tool-accent"
                }`}
                style={isActive ? { color: "var(--bg)" } : undefined}
              >
                {c.icon}
              </span>
              {!narrow && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{c.name}</div>
                  <div className="truncate font-mono text-[0.55rem] uppercase tracking-[0.16em] text-muted">
                    {c.hint}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </aside>

      {/* Right pane */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-[820px]">
          {active === "base64" && <Base64Pane />}
          {active === "url" && <UrlPane />}
          {active === "jwt" && <JwtPane />}
          {active === "hash" && <HashPane />}
          {active === "qr" && <QrPane />}
        </div>
      </main>
    </div>
  );
}
