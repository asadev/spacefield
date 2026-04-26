"use client";

import { useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";

// Robust Base64 encode/decode that handles UTF-8 properly.
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

// Text → hex / binary / decimal conversions.
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

type OutputFmt = "base64" | "hex" | "binary" | "decimal";

export default function Base64EncoderPage() {
  const [text, setText] = useState("hello, world!");
  const [mode, setMode] = useState<"auto" | "encode" | "decode">("auto");
  const [urlSafe, setUrlSafe] = useState(false);
  const [outFmt, setOutFmt] = useState<OutputFmt>("base64");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileB64, setFileB64] = useState<string | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
          case "hex": result = textToHex(src); break;
          case "binary": result = textToBin(src); break;
          case "decimal": result = textToDec(src); break;
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
    const encoded = urlSafe ? toUrlSafe(b64) : b64;
    setFileB64(encoded);
    setFileDataUrl(`data:${f.type || "application/octet-stream"};base64,${b64}`);
  };

  const copy = (t: string) => navigator.clipboard?.writeText(t);

  const effectiveMode =
    mode === "auto" ? (looksLikeBase64(text) ? "decode" : "encode") : mode;

  return (
    <div data-tool-theme="data" data-tool="base64-encoder">
      <ToolShell
        category="Data & Developer"
        title="Base64 Encoder / Decoder"
        description="Encode or decode text and files to Base64 or URL-safe Base64. Auto-detects encoded input. Runs entirely in your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — mode + format chips */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
              mode:{effectiveMode}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              fmt:{effectiveMode === "encode" ? outFmt : "utf-8"}
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              {urlSafe ? "url-safe" : "standard"}
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              bytes.transcoder
              <span className="text-faint">/</span>
              <span className="text-secondary">base64.io</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">◉ client-only</div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Base64 · Bytes Transcoder
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Encode &amp; decode bytes
                </h2>
                <p className="mt-2 max-w-xl text-sm text-secondary">
                  Auto-detect encoded input, switch between base64, hex, binary, decimal, and run files (up to 10 MB) entirely in your browser.
                </p>
              </div>

              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-tool-accent bg-tool-accent-soft font-mono text-sm font-bold text-tool-accent">
                b64
              </div>
            </div>
          </div>

          {/* sub-tab strip — mode pill + url-safe toggle + format pills */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
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

            <label className="ml-1 flex items-center gap-2 rounded-lg border border-app bg-app-elevated px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
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
                {(["base64", "hex", "binary", "decimal"] as OutputFmt[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setOutFmt(f)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
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
        </section>

        {/* Dual mono panes with swap arrow between */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
          {/* Input pane */}
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  input.stream
                </div>
                <div className="text-xs text-muted">
                  {effectiveMode === "decode" ? "encoded" : "plaintext"}
                </div>
              </div>
              <button
                onClick={() => copy(text)}
                className="rounded-lg border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                copy
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[260px] resize-y rounded-lg border border-app bg-app p-3 font-mono text-xs text-app outline-none placeholder:text-faint focus:border-tool-accent"
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
          </div>

          {/* Swap arrow */}
          <div className="flex items-center justify-center lg:px-1">
            <button
              onClick={() => {
                if (output.kind === "ok") setText(output.result);
                setMode((m) => (m === "encode" ? "decode" : m === "decode" ? "encode" : looksLikeBase64(text) ? "encode" : "decode"));
              }}
              title="Swap: send output → input and flip mode"
              className="group flex h-12 w-12 items-center justify-center rounded-full border border-tool-accent bg-tool-accent-soft font-mono text-base text-tool-accent transition-colors hover:bg-tool-accent"
              style={{ }}
            >
              <span className="hidden lg:inline group-hover:text-app-elevated" style={{ }}>⇄</span>
              <span className="lg:hidden">⇅</span>
            </button>
          </div>

          {/* Output pane */}
          <div className="rounded-xl border border-app bg-app-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  output.stream
                </div>
                <div className="text-xs text-muted">
                  {output.kind === "ok"
                    ? output.action
                    : output.kind === "err"
                      ? "error"
                      : "idle"}
                </div>
              </div>
              {output.kind === "ok" && (
                <button
                  onClick={() => copy(output.result)}
                  className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent"
                  style={{ }}
                >
                  copy
                </button>
              )}
            </div>
            {output.kind === "ok" && (
              <>
                <pre className="min-h-[260px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-xs text-app">
                  {output.result}
                </pre>
                <div className="mt-2 flex items-center justify-between font-mono text-[0.6rem] text-muted">
                  <span>{output.result.length.toLocaleString()} chars</span>
                  <span>{effectiveMode === "encode" ? outFmt : "utf-8"}</span>
                </div>
              </>
            )}
            {output.kind === "err" && (
              <div className="min-h-[260px] rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-500">
                {output.error}
              </div>
            )}
            {output.kind === "empty" && (
              <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-app bg-app font-mono text-[0.65rem] uppercase tracking-[0.22em] text-faint">
                awaiting input...
              </div>
            )}
          </div>
        </div>

        {/* File pane */}
        <div className="mt-6 rounded-xl border border-app bg-app-elevated p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                binary.upload
              </div>
              <div className="text-xs text-muted">file → base64 (up to 10 MB)</div>
            </div>
            {fileName && (
              <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-1 font-mono text-[0.6rem] text-tool-accent">
                {fileName}
              </span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            onChange={handleFile}
            className="block w-full text-xs text-secondary file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-tool-accent file:bg-tool-accent-soft file:px-3 file:py-1.5 file:font-mono file:text-[0.6rem] file:uppercase file:tracking-[0.18em] file:text-tool-accent hover:file:bg-tool-accent"
          />
          {fileErr && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-500">
              {fileErr}
            </div>
          )}
          {fileB64 && (
            <div className="mt-4 space-y-3">
              {fileMime?.startsWith("image/") && fileDataUrl && (
                <div className="rounded-lg border border-app bg-app p-3">
                  <div className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    image preview · data url
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileDataUrl} alt="Preview" className="max-h-[180px] rounded" />
                </div>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    raw base64 · {fileMime}
                  </span>
                  <button
                    onClick={() => copy(fileB64)}
                    className="rounded-lg border border-app bg-app px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    copy
                  </button>
                </div>
                <pre className="max-h-[160px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-[0.6rem] text-secondary">
                  {fileB64}
                </pre>
                <div className="mt-1 font-mono text-[0.6rem] text-muted">
                  {fileB64.length.toLocaleString()} chars
                </div>
              </div>
              {fileDataUrl && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                      data url · embeddable
                    </span>
                    <button
                      onClick={() => copy(fileDataUrl)}
                      className="rounded-lg border border-tool-accent bg-tool-accent-soft px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent transition-colors hover:bg-tool-accent"
                    >
                      copy data url
                    </button>
                  </div>
                  <pre className="max-h-[120px] w-full overflow-auto whitespace-pre-wrap break-all rounded-lg border border-app bg-app p-3 font-mono text-[0.6rem] text-secondary">
                    {fileDataUrl}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </ToolShell>
    </div>
  );
}
