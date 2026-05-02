"use client";

import { useState } from "react";
import type { FormPayload } from "@/lib/toshare/types";

interface Props {
  payload: FormPayload;
  linkId: string;
  slug: string;
  subdomain: string | null;
}

export default function FormRenderer({ payload, linkId, slug, subdomain }: Props) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = payload.brandColor ?? "#0f172a";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // simple client-side required check
    for (const f of payload.fields) {
      if (f.required && !values[f.id]) {
        setError(`Please fill in: ${f.label}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/toshare/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, values }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Submission failed.");
      }
      const params = new URLSearchParams();
      params.set("submitted", "1");
      if (subdomain) params.set("ws", subdomain);
      window.location.href = `/f/${slug}?${params.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" style={{ ["--accent" as string]: accent }}>
      {payload.brandLogo ? (
        <img src={payload.brandLogo} alt="" className="h-10 w-10 rounded-lg object-cover" />
      ) : null}

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{payload.title}</h1>
        {payload.description ? (
          <p className="text-sm text-slate-500">{payload.description}</p>
        ) : null}
      </header>

      <div className="space-y-4">
        {payload.fields.map((f) => (
          <label key={f.id} className="block space-y-1.5">
            <span className="text-sm font-medium">
              {f.label}
              {f.required ? <span className="ml-1 text-red-500">*</span> : null}
            </span>

            {f.type === "textarea" ? (
              <textarea
                placeholder={f.placeholder}
                required={f.required}
                value={String(values[f.id] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            ) : f.type === "select" ? (
              <select
                required={f.required}
                value={String(values[f.id] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Choose…</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={Boolean(values[f.id])}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.checked }))}
                className="h-5 w-5 rounded border-slate-300"
              />
            ) : (
              <input
                type={f.type === "phone" ? "tel" : f.type}
                placeholder={f.placeholder}
                required={f.required}
                value={String(values[f.id] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            )}
          </label>
        ))}
      </div>

      {/* Honeypot — bots fill, humans don't see */}
      <input
        type="text"
        name="_hp_company"
        tabIndex={-1}
        autoComplete="off"
        value={String(values._hp_company ?? "")}
        onChange={(e) => setValues((v) => ({ ...v, _hp_company: e.target.value }))}
        aria-hidden="true"
        className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
      />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: accent }}
      >
        {submitting ? "Sending…" : payload.submitLabel ?? "Submit"}
      </button>
    </form>
  );
}
