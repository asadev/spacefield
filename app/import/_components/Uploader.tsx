"use client";

import { useCallback, useRef, useState } from "react";

import { MAX_BYTES, parseCsv, type ParsedCsv } from "@/lib/import/csv";

export interface UploaderProps {
  onParsed: (csv: ParsedCsv, fileName: string) => void;
}

/**
 * Step 1 — drag-drop or paste a CSV. Parses the *full* file client-side
 * so the next steps don't need to re-upload. We cap at 10MB which is
 * already enforced inside `parseCsv`.
 */
export default function Uploader({ onParsed }: UploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_BYTES) {
        setError(`File too large — cap is ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
        return;
      }
      try {
        const text = await file.text();
        const csv = parseCsv(text);
        if (csv.headers.length === 0) {
          setError("No headers detected. First row must contain column names.");
          return;
        }
        onParsed(csv, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV.");
      }
    },
    [onParsed]
  );

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
          dragOver
            ? "border-tool-accent bg-tool-accent/5"
            : "border-app hover:border-tool-accent/60"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ""; // allow re-selecting same file
          }}
        />
        <div className="text-3xl" aria-hidden>📥</div>
        <div className="mt-2 text-sm font-medium text-app">
          Drop a CSV here, or click to choose
        </div>
        <p className="mt-1 text-xs text-muted">
          First row must be column names. Up to 10 MB / 50,000 rows.
        </p>
      </div>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          className="text-muted hover:text-app"
        >
          {pasteOpen ? "Hide paste box" : "Or paste CSV text"}
        </button>
        {error && (
          <span className="text-rose-500" role="alert">
            {error}
          </span>
        )}
      </div>

      {pasteOpen && (
        <div className="space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={"name,email,phone\nJane Doe,jane@x.com,+1234567890"}
            className="h-40 w-full rounded-lg border border-app bg-app-elevated p-3 font-mono text-xs text-app"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setError(null);
                try {
                  const csv = parseCsv(pasted);
                  if (csv.headers.length === 0) {
                    setError("No headers detected.");
                    return;
                  }
                  onParsed(csv, "pasted.csv");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Parse failed.");
                }
              }}
              disabled={!pasted.trim()}
              className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Parse pasted CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
