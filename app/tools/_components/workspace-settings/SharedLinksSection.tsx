"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * SharedLinksSection — manage every share.example.com link minted from this
 * workspace. View counts, submission counts, pause/resume/delete, copy URL,
 * filter by type/source-tool.
 *
 * Lives in System Settings → Workspace → "Shared links" section.
 * ───────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import type { ShareLinkRow, ShareType } from "@/lib/share/types";
import { buildShareUrl, SHARE_TYPE_PREFIX } from "@/lib/share/types";
import NewShareLinkDialog from "./NewShareLinkDialog";

interface Props {
  workspaceId: string;
  workspaceLabel: string;
}

const TYPE_LABEL: Record<ShareType, string> = {
  form: "Form",
  page: "Page",
  quote: "Quote",
  booking: "Booking",
  redirect: "Redirect",
  file: "File",
};

const TYPE_COLOR: Record<ShareType, string> = {
  form: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  page: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  quote: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  booking: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  redirect: "bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200",
  file: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

export default function SharedLinksSection({ workspaceId, workspaceLabel }: Props) {
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ShareType>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch(`/api/share/links?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        setLinks(Array.isArray(j.links) ? j.links : []);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [workspaceId, refreshTick]);

  const filtered = useMemo(() => {
    return links.filter((l) => {
      if (filter !== "all" && l.type !== filter) return false;
      if (search) {
        const hay = `${l.source_tool ?? ""} ${l.slug} ${JSON.stringify(l.payload)}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [links, filter, search]);

  async function copyUrl(link: ShareLinkRow) {
    const url = buildShareUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((c) => (c === link.id ? null : c)), 1500);
    } catch {
      // ignore
    }
  }

  async function toggleStatus(link: ShareLinkRow) {
    setBusy(link.id);
    const newStatus = link.status === "active" ? "paused" : "active";
    const action = newStatus === "active" ? "resume" : "pause";
    try {
      await fetch(`/api/share/links/${link.id}/${action}`, { method: "POST" });
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id ? { ...l, status: newStatus as ShareLinkRow["status"] } : l
        )
      );
    } finally {
      setBusy(null);
    }
  }

  async function destroy(link: ShareLinkRow) {
    if (!confirm(`Delete link share.example.com/${SHARE_TYPE_PREFIX[link.type]}/${link.slug}? This is permanent.`)) {
      return;
    }
    setBusy(link.id);
    try {
      await fetch(`/api/share/links/${link.id}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } finally {
      setBusy(null);
    }
  }

  function getTitle(link: ShareLinkRow): string {
    const p = link.payload as Record<string, unknown>;
    return (
      (typeof p?.title === "string" && p.title) ||
      (typeof p?.name === "string" && p.name) ||
      (typeof p?.fileName === "string" && p.fileName) ||
      `Untitled ${TYPE_LABEL[link.type]}`
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Shared links</h2>
          <p className="text-sm text-faint">
            Public URLs you've created from {workspaceLabel} tools. Each link points to a
            form, page, quote, booking, redirect, or file hosted at share.example.com.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-tool-accent px-3 text-sm font-medium text-white hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New share link
        </button>
      </header>

      {newOpen ? (
        <NewShareLinkDialog
          workspaceId={workspaceId}
          onClose={() => setNewOpen(false)}
          onCreated={() => setRefreshTick((n) => n + 1)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | ShareType)}
          className="h-9 rounded-md border border-app bg-app-elevated px-3 text-sm text-app focus:border-tool-accent focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="form">Forms</option>
          <option value="page">Pages</option>
          <option value="quote">Quotes</option>
          <option value="booking">Bookings</option>
          <option value="redirect">Redirects</option>
          <option value="file">Files</option>
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, slug, source tool…"
          className="h-9 flex-1 min-w-[200px] rounded-md border border-app bg-app-elevated px-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="rounded-lg border border-app bg-app-elevated p-6 text-center text-sm text-faint">
          Loading shared links…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-app bg-app-elevated p-8 text-center text-sm text-faint">
          {links.length === 0
            ? "No shared links yet. Use the 'Share as link' button in any tool to create one."
            : "No links match this filter."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((link) => {
            const url = buildShareUrl(link);
            const created = new Date(link.created_at);
            const copied = copiedId === link.id;
            return (
              <li
                key={link.id}
                className={`rounded-lg border border-app bg-app-elevated p-3 transition ${
                  link.status === "paused" ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${TYPE_COLOR[link.type]}`}
                  >
                    {TYPE_LABEL[link.type]}
                  </span>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="truncate text-sm font-medium text-app">
                      {getTitle(link)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
                      <span className="font-mono">{url.replace(/^https?:\/\//, "")}</span>
                      <span>{link.view_count} views</span>
                      {link.type === "form" && link.submit_count > 0 ? (
                        <span>{link.submit_count} submissions</span>
                      ) : null}
                      {link.type === "quote" && link.submit_count > 0 ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">
                          {link.submit_count} accepted
                        </span>
                      ) : null}
                      {link.source_tool ? <span>via {link.source_tool}</span> : null}
                      <span title={created.toISOString()}>
                        {created.toLocaleDateString()}
                      </span>
                      {link.status === "paused" ? (
                        <span className="rounded bg-amber-100 px-1.5 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          Paused
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyUrl(link)}
                      className="h-7 rounded-md border border-app bg-app-elevated px-2 text-xs text-app hover:border-tool-accent"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="h-7 inline-flex items-center rounded-md border border-app bg-app-elevated px-2 text-xs text-app hover:border-tool-accent"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleStatus(link)}
                      disabled={busy === link.id}
                      className="h-7 rounded-md border border-app bg-app-elevated px-2 text-xs text-app hover:border-tool-accent disabled:opacity-50"
                    >
                      {link.status === "active" ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      onClick={() => destroy(link)}
                      disabled={busy === link.id}
                      className="h-7 rounded-md border border-red-300 bg-red-50 px-2 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
