"use client";

/* NewShareLinkDialog — modal for creating link types that don't have a
 * dedicated tool (redirect, booking, file, free-form page).
 *
 * Renders inside SharedLinksSection. Type selector at top, per-type form
 * below. Submit hits the appropriate API and surfaces the new URL.
 */

import { useState } from "react";
import { mintShareLink } from "@/lib/toshare/client";

interface Props {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}

type Kind = "redirect" | "booking" | "file" | "page";

const KIND_META: Record<Kind, { label: string; description: string; icon: React.ReactNode }> = {
  redirect: {
    label: "Short link",
    description: "Vanity redirect to any external URL",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  booking: {
    label: "Booking page",
    description: "Calendly-style scheduling page",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  file: {
    label: "File share",
    description: "Upload + share with optional password",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  page: {
    label: "Quick page",
    description: "Simple title + content page",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NewShareLinkDialog({ workspaceId, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<Kind>("redirect");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-app bg-app shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app px-5 py-3">
          <div className="text-sm font-semibold">New share link</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-faint hover:bg-surface"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {doneUrl ? (
            <SuccessView url={doneUrl} onClose={onClose} />
          ) : (
            <>
              {/* Type tabs */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(Object.keys(KIND_META) as Kind[]).map((k) => {
                  const m = KIND_META[k];
                  const active = k === kind;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        setError(null);
                      }}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${
                        active
                          ? "border-tool-accent bg-tool-accent-soft"
                          : "border-app bg-app-elevated hover:border-tool-accent/50"
                      }`}
                    >
                      <span className={`mt-0.5 ${active ? "text-tool-accent" : "text-faint"}`}>
                        {m.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-app">{m.label}</span>
                        <span className="block text-[0.7rem] text-faint">{m.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {kind === "redirect" && (
                <RedirectForm
                  workspaceId={workspaceId}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDone={(u) => {
                    setDoneUrl(u);
                    onCreated();
                  }}
                />
              )}
              {kind === "booking" && (
                <BookingForm
                  workspaceId={workspaceId}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDone={(u) => {
                    setDoneUrl(u);
                    onCreated();
                  }}
                />
              )}
              {kind === "file" && (
                <FileForm
                  workspaceId={workspaceId}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDone={(u) => {
                    setDoneUrl(u);
                    onCreated();
                  }}
                />
              )}
              {kind === "page" && (
                <PageForm
                  workspaceId={workspaceId}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDone={(u) => {
                    setDoneUrl(u);
                    onCreated();
                  }}
                />
              )}

              {error ? (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-200">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessView({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-sm font-medium">Created</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-app bg-app-elevated px-3 py-2 text-sm text-app"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="h-9 rounded-md bg-tool-accent px-3 text-sm font-medium text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app hover:border-tool-accent"
        >
          Open
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-tool-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-app bg-app-elevated px-2 py-1.5 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none";

interface FormProps {
  workspaceId: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  setError: (e: string | null) => void;
  onDone: (url: string) => void;
}

function RedirectForm({ workspaceId, busy, setBusy, setError, onDone }: FormProps) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    setError(null);
    if (!/^https?:\/\//i.test(url)) {
      setError("Enter a valid URL starting with http:// or https://");
      return;
    }
    setBusy(true);
    const result = await mintShareLink({
      type: "redirect",
      sourceTool: "new-share-dialog",
      workspaceId,
      payload: { url, notes },
    });
    setBusy(false);
    if (!result.ok || !result.url) {
      setError(result.error ?? "Could not create link");
      return;
    }
    onDone(result.url);
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">Destination URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/long/path?utm=..."
          className={inputCls}
          autoFocus
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">Notes (private)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal note"
          className={inputCls}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !url}
        className="h-9 rounded-md bg-tool-accent px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create short link"}
      </button>
    </div>
  );
}

function BookingForm({ workspaceId, busy, setBusy, setError, onDone }: FormProps) {
  const [title, setTitle] = useState("Intro call");
  const [duration, setDuration] = useState(30);
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [tz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    if (days.size === 0) {
      setError("Pick at least one day");
      return;
    }
    if (endHour <= startHour) {
      setError("End time must be after start");
      return;
    }
    setBusy(true);
    const windows = Array.from(days).map((dow) => ({
      dayOfWeek: dow,
      startMinute: startHour * 60,
      endMinute: endHour * 60,
    }));
    const result = await mintShareLink({
      type: "booking",
      sourceTool: "new-share-dialog",
      workspaceId,
      payload: {
        title,
        durationMinutes: duration,
        windows,
        timezone: tz,
        bookableHorizonDays: 30,
        notifyEmail: notifyEmail || undefined,
      },
    });
    setBusy(false);
    if (!result.ok || !result.url) {
      setError(result.error ?? "Could not create");
      return;
    }
    onDone(result.url);
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">Duration</span>
          <select
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className={inputCls}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">Start hour</span>
          <input
            type="number"
            min={0}
            max={23}
            value={startHour}
            onChange={(e) => setStartHour(parseInt(e.target.value, 10) || 0)}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">End hour</span>
          <input
            type="number"
            min={1}
            max={24}
            value={endHour}
            onChange={(e) => setEndHour(parseInt(e.target.value, 10) || 0)}
            className={inputCls}
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className="text-xs font-medium text-app">Available days</span>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((label, i) => {
            const on = days.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-8 w-12 rounded-md border text-xs font-medium ${
                  on
                    ? "border-tool-accent bg-tool-accent text-white"
                    : "border-app bg-app-elevated text-app hover:border-tool-accent/50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">
          Email me on each booking <span className="text-faint">(optional)</span>
        </span>
        <input
          type="email"
          value={notifyEmail}
          onChange={(e) => setNotifyEmail(e.target.value)}
          placeholder="you@company.com"
          className={inputCls}
        />
      </label>
      <p className="text-[0.65rem] text-faint">Timezone: {tz}</p>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="h-9 rounded-md bg-tool-accent px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create booking page"}
      </button>
    </div>
  );
}

function FileForm({ workspaceId, busy, setBusy, setError, onDone }: FormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");

  async function submit() {
    setError(null);
    if (!file) {
      setError("Pick a file");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("File too large (100MB max)");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    if (workspaceId) fd.set("workspaceId", workspaceId);
    if (password) fd.set("password", password);
    if (maxDownloads && /^\d+$/.test(maxDownloads)) fd.set("maxDownloads", maxDownloads);
    if (expiresInDays && /^\d+$/.test(expiresInDays)) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(expiresInDays, 10));
      fd.set("expiresAt", d.toISOString());
    }
    try {
      const res = await fetch("/api/toshare/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Upload failed");
        setBusy(false);
        return;
      }
      onDone(j.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">File (max 100MB)</span>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-app file:mr-3 file:rounded-md file:border file:border-app file:bg-app-elevated file:px-3 file:py-1.5 file:text-sm file:text-app hover:file:border-tool-accent"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">
            Password <span className="text-faint">(optional)</span>
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">
            Max downloads <span className="text-faint">(optional)</span>
          </span>
          <input
            type="number"
            min={1}
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">
          Expires in N days <span className="text-faint">(optional)</span>
        </span>
        <input
          type="number"
          min={1}
          max={365}
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(e.target.value)}
          className={inputCls}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !file}
        className="h-9 rounded-md bg-tool-accent px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Upload + share"}
      </button>
    </div>
  );
}

function PageForm({ workspaceId, busy, setBusy, setError, onDone }: FormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");

  async function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Title required");
      return;
    }
    setBusy(true);
    const blocks: { kind: string; text?: string }[] = [];
    if (body.trim()) {
      for (const para of body.split(/\n\n+/)) {
        const t = para.trim();
        if (t) blocks.push({ kind: "paragraph", text: t });
      }
    }
    const result = await mintShareLink({
      type: "page",
      sourceTool: "new-share-dialog",
      workspaceId,
      payload: {
        title,
        blocks,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaHref: ctaHref.trim() || undefined,
      },
    });
    setBusy(false);
    if (!result.ok || !result.url) {
      setError(result.error ?? "Could not create");
      return;
    }
    onDone(result.url);
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's this page about?"
          className={inputCls}
          autoFocus
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-app">
          Body <span className="text-faint">(blank line for paragraph break)</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">CTA label</span>
          <input
            type="text"
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="e.g. Book a call"
            className={inputCls}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-app">CTA link</span>
          <input
            type="url"
            value={ctaHref}
            onChange={(e) => setCtaHref(e.target.value)}
            placeholder="https://..."
            className={inputCls}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={busy || !title.trim()}
        className="h-9 rounded-md bg-tool-accent px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create page"}
      </button>
    </div>
  );
}
