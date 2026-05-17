"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { EmployeeDocumentKind } from "@/lib/people/types";

/**
 * Document upload widget for the People → Documents tab.
 *
 * Posts multipart form data to `/api/people/documents/upload`. The route
 * handles size + mime validation server-side; we mirror a soft check
 * here so the user gets immediate feedback before the round-trip.
 *
 * Parent is `app/people/[id]/page.tsx`'s DocumentsTab — it decides
 * whether to mount us (only for the employee themselves / admins).
 */

const KINDS: readonly { value: EmployeeDocumentKind; label: string }[] = [
  { value: "emirates_id", label: "Emirates ID" },
  { value: "visa", label: "Visa" },
  { value: "passport", label: "Passport" },
  { value: "contract", label: "Contract" },
  { value: "certification", label: "Certification" },
  { value: "other", label: "Other" },
];

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export default function DocumentUpload({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<EmployeeDocumentKind>("other");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File too large — 10 MB max.");
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      setError("Only PDF, JPG, PNG, or WebP files are allowed.");
      return;
    }
    if (!name.trim()) {
      setError("Give the document a name.");
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    fd.set("employee_id", employeeId);
    fd.set("kind", kind);
    fd.set("name", name.trim());
    if (number.trim()) fd.set("number", number.trim());
    if (expiresAt) fd.set("expires_at", expiresAt);
    if (notes.trim()) fd.set("notes", notes.trim());

    start(async () => {
      try {
        const res = await fetch("/api/people/documents/upload", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          setError(json.error ?? `Upload failed (${res.status}).`);
          return;
        }
        // Reset + refresh server component data.
        setName("");
        setNumber("");
        setExpiresAt("");
        setNotes("");
        setKind("other");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-app bg-app-elevated p-4 space-y-3"
      aria-label="Upload employee document"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          <span>Document kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EmployeeDocumentKind)}
            className="rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app"
            disabled={pending}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          <span>Document name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Passport (2024)"
            className="rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app"
            disabled={pending}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          <span>Number (optional)</span>
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app"
            disabled={pending}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          <span>Expires (optional)</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app"
            disabled={pending}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-md border border-app bg-app px-2 py-1.5 text-sm text-app"
          disabled={pending}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>File (PDF, JPG, PNG, WebP — 10 MB max)</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full text-sm text-app file:me-2 file:rounded-md file:border-0 file:bg-app-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-app hover:file:bg-app-muted/80"
          disabled={pending}
          required
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-500"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
