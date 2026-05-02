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

interface WebhookDelivery {
  id: number;
  event: string;
  webhook_url: string;
  status: "success" | "timeout" | "network_error" | "non_2xx" | "signing_skipped" | "unknown";
  http_status: number | null;
  response_excerpt: string | null;
  signed: boolean;
  attempted_at: string;
  duration_ms: number | null;
}

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

  // Custom subdomain + brand color state
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [subdomainDraft, setSubdomainDraft] = useState("");
  const [subEditing, setSubEditing] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const [brandColor, setBrandColor] = useState<string | null>(null);
  const [brandBusy, setBrandBusy] = useState(false);

  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  // Per-link expanded state for the webhook deliveries panel
  const [openDeliveriesFor, setOpenDeliveriesFor] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [deliveriesLoading, setDeliveriesLoading] = useState<string | null>(null);

  async function toggleDeliveries(linkId: string) {
    if (openDeliveriesFor === linkId) {
      setOpenDeliveriesFor(null);
      return;
    }
    setOpenDeliveriesFor(linkId);
    if (!deliveries[linkId]) {
      setDeliveriesLoading(linkId);
      try {
        const res = await fetch(`/api/share/links/${linkId}/deliveries`, {
          cache: "no-store",
        });
        const j = await res.json();
        setDeliveries((d) => ({ ...d, [linkId]: Array.isArray(j.deliveries) ? j.deliveries : [] }));
      } catch {
        setDeliveries((d) => ({ ...d, [linkId]: [] }));
      } finally {
        setDeliveriesLoading(null);
      }
    }
  }

  useEffect(() => {
    fetch(`/api/share/subdomain?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        setSubdomain(typeof j.subdomain === "string" ? j.subdomain : null);
        setSubdomainDraft(typeof j.subdomain === "string" ? j.subdomain : "");
        setBrandColor(typeof j.brandColor === "string" ? j.brandColor : null);
        setWebhookSecret(typeof j.webhookSecret === "string" ? j.webhookSecret : null);
      })
      .catch(() => {});
  }, [workspaceId]);

  async function saveBrandColor(value: string | null) {
    setBrandBusy(true);
    try {
      const res = await fetch("/api/share/subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, brandColor: value }),
      });
      const j = await res.json();
      if (res.ok) {
        setBrandColor(j.brandColor ?? null);
      }
    } finally {
      setBrandBusy(false);
    }
  }

  async function rotateWebhookSecret() {
    if (!confirm(
      "Rotate the webhook signing secret? Existing webhook receivers using the old secret will start rejecting requests until you update them with the new secret."
    )) {
      return;
    }
    setSecretBusy(true);
    try {
      const res = await fetch("/api/share/subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, rotateWebhookSecret: true }),
      });
      const j = await res.json();
      if (res.ok && typeof j.webhookSecret === "string") {
        setWebhookSecret(j.webhookSecret);
        setSecretRevealed(true);
      }
    } finally {
      setSecretBusy(false);
    }
  }

  async function copySecret() {
    if (!webhookSecret) return;
    try {
      await navigator.clipboard.writeText(webhookSecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 1500);
    } catch {}
  }

  async function saveSubdomain(value: string | null) {
    setSubError(null);
    setSubBusy(true);
    try {
      const res = await fetch("/api/share/subdomain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, subdomain: value }),
      });
      const j = await res.json();
      if (!res.ok) {
        setSubError(j.error ?? "Failed to update");
        return;
      }
      setSubdomain(j.subdomain ?? null);
      setSubdomainDraft(j.subdomain ?? "");
      setSubEditing(false);
    } finally {
      setSubBusy(false);
    }
  }

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

      {/* Brand defaults panel — accent color applied to every link */}
      <div className="rounded-lg border border-app bg-app-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Brand defaults</div>
            <div className="mt-0.5 text-xs text-faint">
              Accent color + workspace logo are applied to every link minted from this workspace
              (unless the link's own settings override them).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-app">
              <span>Accent</span>
              <input
                type="color"
                value={brandColor ?? "#0f172a"}
                onChange={(e) => setBrandColor(e.target.value)}
                onBlur={() => brandColor && saveBrandColor(brandColor)}
                disabled={brandBusy}
                className="h-7 w-10 cursor-pointer rounded border border-app bg-app"
                aria-label="Brand color"
              />
            </label>
            <span
              className="inline-block h-7 w-7 rounded border border-app"
              style={{ backgroundColor: brandColor ?? "transparent" }}
              title={brandColor ?? "no color set"}
            />
            {brandColor ? (
              <button
                type="button"
                onClick={() => {
                  setBrandColor(null);
                  saveBrandColor(null);
                }}
                disabled={brandBusy}
                className="h-7 rounded-md border border-app bg-app px-2 text-xs text-app hover:border-tool-accent disabled:opacity-50"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Custom subdomain panel */}
      <div className="rounded-lg border border-app bg-app-elevated p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Custom subdomain</div>
            <div className="mt-0.5 text-xs text-faint">
              {subdomain
                ? `Your links resolve at ${subdomain}.share.example.com by default.`
                : "Claim a subdomain so your links live at your-name.share.example.com instead of the apex."}
            </div>
          </div>
          {!subEditing ? (
            <button
              type="button"
              onClick={() => setSubEditing(true)}
              className="h-8 shrink-0 rounded-md border border-app bg-app px-3 text-xs text-app hover:border-tool-accent"
            >
              {subdomain ? "Change" : "Claim"}
            </button>
          ) : null}
        </div>

        {subEditing ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-1 text-sm">
              <input
                type="text"
                value={subdomainDraft}
                onChange={(e) =>
                  setSubdomainDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="acme"
                maxLength={32}
                autoFocus
                className="h-9 max-w-[160px] rounded-md border border-app bg-app px-2 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
              />
              <span className="font-mono text-sm text-faint">.share.example.com</span>
            </div>
            <p className="text-[0.7rem] text-faint">
              3–32 chars · letters, digits, hyphens · must start with a letter.
            </p>
            {subError ? (
              <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-200">
                {subError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => saveSubdomain(subdomainDraft || null)}
                disabled={subBusy}
                className="h-8 rounded-md bg-tool-accent px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                {subBusy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubEditing(false);
                  setSubdomainDraft(subdomain ?? "");
                  setSubError(null);
                }}
                className="h-8 rounded-md border border-app bg-app px-3 text-xs text-app"
              >
                Cancel
              </button>
              {subdomain ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Release this subdomain? Existing links will revert to the apex share.example.com URL.")) {
                      saveSubdomain(null);
                    }
                  }}
                  disabled={subBusy}
                  className="ml-auto h-8 rounded-md border border-red-300 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
                >
                  Release
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Webhook signing secret panel — only shown to admin/owner (the
          API only returns the secret for those roles). */}
      {webhookSecret ? (
        <div className="rounded-lg border border-app bg-app-elevated p-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Webhook signing secret</div>
                <div className="mt-0.5 text-xs text-faint">
                  Every webhook fired from this workspace is signed with HMAC-SHA256.
                  Receivers should verify by computing the same hash on the request body
                  and comparing the <code>X-Share-Signature</code> header.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={secretRevealed ? "text" : "password"}
                readOnly
                value={webhookSecret}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-app bg-app px-2 py-1.5 font-mono text-xs text-app"
              />
              <button
                type="button"
                onClick={() => setSecretRevealed((v) => !v)}
                className="h-8 rounded-md border border-app bg-app px-2 text-xs text-app hover:border-tool-accent"
              >
                {secretRevealed ? "Hide" : "Reveal"}
              </button>
              <button
                type="button"
                onClick={copySecret}
                className="h-8 rounded-md border border-app bg-app px-2 text-xs text-app hover:border-tool-accent"
              >
                {secretCopied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={rotateWebhookSecret}
                disabled={secretBusy}
                className="h-8 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
              >
                {secretBusy ? "Rotating…" : "Rotate"}
              </button>
            </div>
            <details className="text-xs text-faint">
              <summary className="cursor-pointer">Verification snippet (Node.js)</summary>
              <pre className="mt-2 overflow-x-auto rounded bg-app p-2 text-[0.7rem]">
{`import crypto from "crypto";

function verify(req, secret) {
  const sig = req.headers["x-share-signature"]?.replace(/^sha256=/, "");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");
  return sig && crypto.timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(expected, "hex"),
  );
}`}
              </pre>
            </details>
          </div>
        </div>
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
                      onClick={() => toggleDeliveries(link.id)}
                      className="h-7 rounded-md border border-app bg-app-elevated px-2 text-xs text-app hover:border-tool-accent"
                      title="Recent webhook deliveries"
                    >
                      Webhooks
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

                {openDeliveriesFor === link.id ? (
                  <div className="mt-3 border-t border-app pt-3">
                    <div className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-faint mb-2">
                      Recent webhook deliveries
                    </div>
                    {deliveriesLoading === link.id ? (
                      <div className="text-xs text-faint">Loading…</div>
                    ) : (deliveries[link.id]?.length ?? 0) === 0 ? (
                      <div className="text-xs text-faint">
                        No webhook attempts recorded for this link yet.
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        {deliveries[link.id]!.map((d) => (
                          <li
                            key={d.id}
                            className="flex flex-wrap items-center gap-2 rounded border border-app bg-app px-2 py-1.5 text-xs"
                          >
                            <span
                              className={`inline-flex h-5 items-center rounded-full px-1.5 text-[0.65rem] font-medium ${
                                d.status === "success"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                  : d.status === "non_2xx"
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                              }`}
                            >
                              {d.status === "success"
                                ? `${d.http_status ?? 200}`
                                : d.status === "non_2xx"
                                  ? `${d.http_status ?? "?"}`
                                  : d.status}
                            </span>
                            <span className="font-mono text-[0.65rem] text-faint">
                              {d.event}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-app">
                              {d.webhook_url}
                            </span>
                            {d.signed ? (
                              <span title="HMAC signed">🔒</span>
                            ) : (
                              <span title="Unsigned (no workspace secret)" className="opacity-40">·</span>
                            )}
                            {typeof d.duration_ms === "number" ? (
                              <span className="text-[0.65rem] text-faint tabular-nums">
                                {d.duration_ms}ms
                              </span>
                            ) : null}
                            <span className="text-[0.65rem] text-faint" title={new Date(d.attempted_at).toISOString()}>
                              {new Date(d.attempted_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                            {d.response_excerpt ? (
                              <details className="basis-full">
                                <summary className="cursor-pointer text-[0.6rem] text-faint">
                                  Response
                                </summary>
                                <pre className="mt-1 overflow-x-auto rounded bg-app-elevated p-1.5 text-[0.65rem] text-app">
{d.response_excerpt}
                                </pre>
                              </details>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
