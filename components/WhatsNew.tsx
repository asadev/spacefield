"use client";

import { useEffect, useState } from "react";

import {
  entriesSince,
  LATEST_VERSION,
  type ChangelogEntry,
} from "@/lib/changelog/entries";
import {
  WHATS_NEW_COOKIE,
  WHATS_NEW_MAX_AGE_SECONDS,
} from "@/lib/changelog/cookie";

/**
 * "What's new" modal.
 *
 * Auto-shows on first mount per browser/session when there are entries
 * newer than the user's last-seen cookie. Dismissing writes
 * `LATEST_VERSION` to the cookie so the modal stays quiet until the
 * next entry ships. Also listens for the
 * `spacefield:open-whats-new` window event so the command palette can
 * trigger it manually.
 *
 * `lastSeen` is passed from the root layout (which read the cookie at
 * SSR time) to avoid a render flash. If the cookie was absent we still
 * pass `null` and rely on `entriesSince(null)` returning a single
 * latest entry.
 *
 * Mounted once in `app/layout.tsx`.
 */
export default function WhatsNew({ lastSeen }: { lastSeen: string | null }) {
  // Initial computed visibility from SSR-passed value. We confirm on
  // mount with the actual document.cookie too, since SSR can race with
  // a client-side dismiss done seconds earlier on another tab.
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    // Re-read the cookie on the client — SSR's value can be stale if
    // another tab dismissed seconds ago. The mount-time setState here
    // is the intended behaviour (we can't derive `open` during render
    // without hitting an SSR/CSR hydration mismatch since the cookie
    // changes per-browser).
    const clientSeen = readCookie(WHATS_NEW_COOKIE) ?? lastSeen;
    const due = entriesSince(clientSeen);
    if (due.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntries(due);
      setOpen(true);
    }

    // Manual open trigger (command palette) — show every entry, since
    // the user explicitly asked to see the full list.
    function onManualOpen() {
      setEntries(entriesAll());
      setOpen(true);
    }
    window.addEventListener("spacefield:open-whats-new", onManualOpen);

    // Esc closes when open. We attach this regardless of `open` so
    // the listener can read state without recreating itself.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen((wasOpen) => {
          if (wasOpen) {
            // Don't write the cookie — Esc is "I'll look later".
            return false;
          }
          return wasOpen;
        });
      }
    }
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("spacefield:open-whats-new", onManualOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [lastSeen]);

  function dismissPersist() {
    writeCookie(WHATS_NEW_COOKIE, LATEST_VERSION, WHATS_NEW_MAX_AGE_SECONDS);
    setOpen(false);
  }

  if (!open || entries.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl rounded-xl border border-[var(--chrome-border,#0001)] bg-[var(--chrome-solid-bg,#ffffff)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--chrome-border,#0001)] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-app">
              What&apos;s new in Space Field
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {entries.length === 1
                ? "1 new release since your last visit."
                : `${entries.length} new releases since your last visit.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded text-muted transition-colors hover:text-app focus:outline-none focus:ring-1 focus:ring-app"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {entries.map((e) => (
            <article key={e.version} className="mb-5 last:mb-0">
              <header className="mb-2 flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold text-app">{e.title}</h3>
                <span className="rounded border border-app bg-app-elevated px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-muted">
                  {e.version}
                </span>
                <span className="text-[11px] text-muted">{e.date}</span>
              </header>
              <ul className="ms-4 list-disc space-y-1 text-sm leading-relaxed text-app">
                {e.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--chrome-border,#0001)] px-5 py-3">
          <a
            href="/changelog"
            className="text-xs text-muted underline hover:text-app"
          >
            Full changelog
          </a>
          <button
            type="button"
            onClick={dismissPersist}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function entriesAll(): ChangelogEntry[] {
  // Re-import statically to avoid bundler hassle.
  // We just call entriesSince("0") to get everything.
  return entriesSince("0");
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = `${name}=`;
  const parts = document.cookie.split(/;\s*/);
  for (const part of parts) {
    if (part.startsWith(target)) {
      return decodeURIComponent(part.slice(target.length)) || null;
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}` +
    `; samesite=lax${secure}`;
}
