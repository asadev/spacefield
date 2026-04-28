"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * Client island for the hosted form. Renders the field schema, submits
 * to /api/inbound/form/<slug>, and switches to a thank-you state.
 *
 * Each field's `key` becomes the input `name` so the request body maps
 * 1:1 with the schema on the server.
 * ───────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import type { LeadSourceFormField } from "@/lib/crm/lead-sources/types";

interface Props {
  slug: string;
  fields: LeadSourceFormField[];
  thankYouMessage: string;
}

const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2.5 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export default function HostedFormClient({ slug, fields, thankYouMessage }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/inbound/form/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        ok: boolean;
        status?: string;
        reason?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.reason ?? `submission failed (${res.status})`);
      }
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "submission failed");
    }
  };

  if (status === "ok") {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-6 text-center">
        <p className="text-sm text-app">{thankYouMessage}</p>
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-6 text-center">
        <p className="text-sm text-secondary">
          This form has no fields configured yet.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label
            htmlFor={`f-${f.key}`}
            className="block text-xs font-medium text-secondary"
          >
            {f.label}
            {f.required ? <span className="ml-0.5 text-rose-500">*</span> : null}
          </label>
          {f.type === "textarea" ? (
            <textarea
              id={`f-${f.key}`}
              name={f.key}
              required={f.required}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              rows={4}
              className={inputClass}
            />
          ) : f.type === "select" ? (
            <select
              id={`f-${f.key}`}
              name={f.key}
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              className={inputClass}
            >
              <option value="">Select…</option>
              {(f.options ?? []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`f-${f.key}`}
              name={f.key}
              type={
                f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"
              }
              required={f.required}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      ))}
      {error ? (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-500">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full items-center justify-center rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 disabled:opacity-60"
      >
        {status === "sending" ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
