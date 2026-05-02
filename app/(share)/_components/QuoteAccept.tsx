"use client";

/* QuoteAccept — Accept-this-quote panel rendered inside the quote viewer.
 *
 * Collects signer name (+ optional email + company), POSTs to /api/share/accept,
 * shows a confirmation block on success.
 */

import { useState } from "react";

interface Props {
  linkId: string;
  acceptCtaLabel?: string;
  brandColor?: string;
  totalDisplay: string;
}

export default function QuoteAccept({ linkId, acceptCtaLabel, brandColor, totalDisplay }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = brandColor ?? "#0f172a";

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please enter your name to accept.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/share/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          signerName: name.trim(),
          signerEmail: email.trim(),
          signerCompany: company.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to record acceptance.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accent }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900">
              Quote accepted
            </div>
            <div className="text-xs text-emerald-800">
              {name} · {totalDisplay} · {new Date().toLocaleString()}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-emerald-900">
          The sender has been notified. They'll be in touch with next steps shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={accept} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="text-sm font-semibold tracking-tight">Accept this quote</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">
            Your name <span className="text-red-500">*</span>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">
          Company
        </span>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
        />
      </label>
      <p className="text-xs text-slate-500">
        By clicking accept you confirm the line items and total of <strong>{totalDisplay}</strong>.
        This is recorded with a timestamp.
      </p>
      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {busy ? "Recording…" : acceptCtaLabel ?? "Accept quote"}
      </button>
    </form>
  );
}
