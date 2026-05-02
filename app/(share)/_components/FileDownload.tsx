"use client";

/* Client-side file download flow with password gate. */

import { useState } from "react";
import type { FilePayload } from "@/lib/toshare/types";

interface Props {
  linkId: string;
  payload: FilePayload;
  passwordRequired: boolean;
  brandColor?: string;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function FileDownload({ linkId, payload, passwordRequired, brandColor }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = brandColor ?? "#0f172a";

  async function download(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // We hit the API as a normal anchor navigation so the browser handles
      // the redirect → downloaded blob naturally.
      const url = `/api/toshare/download/${linkId}${password ? `?p=${encodeURIComponent(password)}` : ""}`;

      // First, do a HEAD-style fetch to surface password errors before navigating.
      const probe = await fetch(url, { method: "GET", redirect: "manual" });
      if (probe.status === 401) {
        setError("Wrong password.");
        return;
      }
      if (probe.status === 410) {
        setError("This link has expired or hit its download limit.");
        return;
      }
      if (probe.status === 404) {
        setError("File not found.");
        return;
      }
      // 0 = opaqueredirect (browser will follow). Trigger an anchor click to
      // get the actual download.
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: accent }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{payload.fileName}</div>
          <div className="text-xs text-slate-500">
            {payload.mimeType} · {fmtBytes(payload.fileSize)}
            {typeof payload.maxDownloads === "number"
              ? ` · ${Math.max(0, payload.maxDownloads - (payload.downloadCount ?? 0))} downloads left`
              : ""}
          </div>
        </div>
      </div>

      {passwordRequired ? (
        <form onSubmit={download} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Password required
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {busy ? "Downloading…" : "Download"}
          </button>
        </form>
      ) : (
        <>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => download()}
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            <svg className="mr-1.5 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {busy ? "Starting download…" : "Download file"}
          </button>
        </>
      )}
    </div>
  );
}
