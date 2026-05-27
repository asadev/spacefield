"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * InventoryWhatsAppComposer
 *
 * Modal that turns one inventory row into a WhatsApp blast:
 *   1. Live preview of the item (image + name + price).
 *   2. AI caption generator with language + tone + length pickers.
 *      Returns N variants; user picks one, edits it, or types from
 *      scratch. Per-send language override defaults to the workspace
 *      locale and can switch on the fly without re-fetching.
 *   3. Target picker — defaults to a contact list pulled from the CRM
 *      contacts endpoint, but also offers WhatsApp Lists / Groups if
 *      Agent A's endpoints are available. Tolerates partial deploys.
 *   4. Send button → POST /api/whatsapp/send (Agent A's endpoint).
 *      Shows a throttle estimate for list/group sends and a success
 *      toast on completion.
 *
 * Currency rule: everything currency-related uses the item's currency
 * (which itself defaults to the workspace currency in the DB). No
 * hardcoded codes anywhere in this file.
 *
 * Mobile-first: the modal collapses to a full-height drawer below
 * 640 px.
 * ─────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";

/* ─── Public types ────────────────────────────────────────────────── */

export interface ComposerItem {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  quantity: number | null;
  unit: string | null;
  /** Optional image URL — when present we preview it. */
  image_url?: string | null;
  /** Optional storage path so the WA send can reference the same
   *  asset. */
  image_id?: string | null;
  custom?: Record<string, unknown> | null;
}

interface Props {
  itemId: string;
  workspaceId: string;
  item: ComposerItem;
  onClose: () => void;
}

/* ─── Language + tone constants ───────────────────────────────────── */

const LANGUAGE_OPTIONS = [
  { value: "__workspace__", label: "Workspace default" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Español" },
  { value: "Arabic", label: "العربية" },
  { value: "French", label: "Français" },
  { value: "Portuguese", label: "Português" },
  { value: "German", label: "Deutsch" },
  { value: "Roman Urdu", label: "Roman Urdu" },
  { value: "Urdu", label: "اردو" },
  { value: "Hindi", label: "हिन्दी" },
  { value: "Bengali", label: "বাংলা" },
  { value: "Chinese", label: "中文" },
  { value: "Indonesian", label: "Indonesian" },
  { value: "Turkish", label: "Türkçe" },
] as const;

const TONE_OPTIONS = [
  { value: "casual", label: "Casual" },
  { value: "professional", label: "Professional" },
  { value: "urgent", label: "Urgent" },
  { value: "friendly", label: "Friendly" },
] as const;

const LENGTH_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
] as const;

const WA_SOFT_LIMIT = 1024; // WA caption sweet-spot
const WA_HARD_LIMIT = 4096; // text message hard ceiling

/* ─── Locale read (best-effort) ───────────────────────────────────── */

function readLocaleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)spacefield-locale=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function localeToLanguage(loc: string | null): string {
  if (!loc) return "English";
  const head = loc.split(/[-_]/)[0]?.toLowerCase() ?? "";
  switch (head) {
    case "ar":
      return "Arabic";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "pt":
      return "Portuguese";
    case "ur":
      return "Urdu";
    case "hi":
      return "Hindi";
    case "zh":
      return "Chinese";
    case "id":
      return "Indonesian";
    case "tr":
      return "Turkish";
    case "en":
    default:
      return "English";
  }
}

/* ─── Currency formatter ──────────────────────────────────────────── */

function formatPrice(price: number | null, currency: string): string {
  if (price == null || !Number.isFinite(price)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    // Bad currency code — fall back to plain "<amount> <code>" so we
    // never lose the data.
    return `${price.toLocaleString()} ${currency}`;
  }
}

/* ─── Target types ────────────────────────────────────────────────── */

type TargetKind = "contact" | "list" | "group";

interface TargetOption {
  kind: TargetKind;
  id: string;
  label: string;
  /** Optional secondary line (phone, member count). */
  detail?: string;
  /** Count of recipients — used to render throttle estimate. */
  recipientCount?: number;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

/* ─── Throttle estimate ───────────────────────────────────────────── */

function throttleEstimate(count: number | undefined): string | null {
  if (!count || count <= 1) return null;
  // Assume ~60s between messages for unofficial-API safe throttling.
  const seconds = count * 60;
  if (seconds < 90) return `~${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`;
  const hours = seconds / 3600;
  return `~${hours.toFixed(1)} hours`;
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function InventoryWhatsAppComposer({
  itemId,
  workspaceId,
  item,
  onClose,
}: Props) {
  const workspaceDefaultLanguage = useMemo(
    () => localeToLanguage(readLocaleCookie()),
    []
  );

  const [language, setLanguage] = useState<string>("__workspace__");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]["value"]>(
    "casual"
  );
  const [length, setLength] = useState<
    (typeof LENGTH_OPTIONS)[number]["value"]
  >("medium");

  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariantIdx, setActiveVariantIdx] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [target, setTarget] = useState<TargetOption | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [lists, setLists] = useState<TargetOption[]>([]);
  const [groups, setGroups] = useState<TargetOption[]>([]);
  const [targetQuery, setTargetQuery] = useState("");
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [targetMode, setTargetMode] = useState<"contacts" | "lists" | "groups">(
    "contacts"
  );

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /* ─── Lock background scroll while modal is open ─────────────── */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ─── Escape to close ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* ─── Load targets ───────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingTargets(true);
      try {
        // Contacts via the CRM (we know this endpoint exists).
        const r = await fetch(
          `/api/crm/contacts?workspace_id=${encodeURIComponent(
            workspaceId
          )}&limit=200`
        );
        if (r.ok) {
          const j = (await r.json()) as { items?: ContactRow[] };
          if (!cancelled) setContacts(j.items ?? []);
        }
      } catch {
        /* tolerate */
      }
      // Best-effort lists from Agent A's endpoint.
      try {
        const r = await fetch(
          `/api/whatsapp/lists?workspace_id=${encodeURIComponent(workspaceId)}`
        );
        if (r.ok) {
          const j = (await r.json()) as {
            lists?: { id: string; name: string; recipient_count?: number }[];
          };
          if (!cancelled) {
            setLists(
              (j.lists ?? []).map((l) => ({
                kind: "list",
                id: l.id,
                label: l.name,
                detail: l.recipient_count
                  ? `${l.recipient_count} contacts`
                  : undefined,
                recipientCount: l.recipient_count,
              }))
            );
          }
        }
      } catch {
        /* tolerate */
      }
      try {
        const r = await fetch(
          `/api/whatsapp/groups?workspace_id=${encodeURIComponent(workspaceId)}`
        );
        if (r.ok) {
          const j = (await r.json()) as {
            groups?: { id: string; name: string; member_count?: number }[];
          };
          if (!cancelled) {
            setGroups(
              (j.groups ?? []).map((g) => ({
                kind: "group",
                id: g.id,
                label: g.name,
                detail: g.member_count
                  ? `${g.member_count} members`
                  : undefined,
                recipientCount: g.member_count,
              }))
            );
          }
        }
      } catch {
        /* tolerate */
      }
      if (!cancelled) setLoadingTargets(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  /* ─── Generate captions ──────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const lang =
        language === "__workspace__" ? workspaceDefaultLanguage : language;
      const r = await fetch(
        `/api/inventory/${encodeURIComponent(itemId)}/whatsapp-caption?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: lang,
            tone,
            length,
            variantCount: 3,
          }),
        }
      );
      const j = (await r.json()) as {
        variants?: string[];
        error?: string;
        message?: string;
      };
      if (!r.ok) {
        if (r.status === 402) {
          setGenError(
            j.message ??
              "AI caption generation requires Pro. Refer friends to unlock."
          );
        } else {
          setGenError(j.message ?? j.error ?? "Generation failed.");
        }
        return;
      }
      const vs = j.variants ?? [];
      setVariants(vs);
      if (vs.length > 0) {
        setActiveVariantIdx(0);
        setMessage(vs[0]);
      }
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [itemId, workspaceId, language, tone, length, workspaceDefaultLanguage]);

  /* ─── Send ──────────────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    if (!target) {
      setSendError("Pick a contact, list, or group first.");
      return;
    }
    if (!message.trim()) {
      setSendError("Caption is empty.");
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          target_type: target.kind,
          target_id: target.id,
          message: message.trim(),
          media_url: item.image_url ?? null,
        }),
      });
      if (!r.ok) {
        if (r.status === 404) {
          setSendError(
            "WhatsApp send endpoint isn't live yet. Try again in a moment."
          );
          return;
        }
        const j = (await r.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setSendError(j.message ?? j.error ?? `Send failed (HTTP ${r.status}).`);
        return;
      }
      const count = target.recipientCount ?? 1;
      const noun = target.kind === "contact" ? "contact" : `${target.kind}`;
      if (count > 1) {
        toast.success(
          `Queued for ${count} ${count === 1 ? noun : noun + " recipients"} — track progress in WhatsApp → Jobs.`
        );
      } else {
        toast.success(`Sent to ${target.label}.`);
      }
      onClose();
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [target, message, workspaceId, item.image_url, onClose]);

  /* ─── Filtered target list ───────────────────────────────────── */
  const targetList: TargetOption[] = useMemo(() => {
    const q = targetQuery.trim().toLowerCase();
    let pool: TargetOption[] = [];
    if (targetMode === "contacts") {
      pool = contacts
        .filter((c) => !!c.phone)
        .map((c) => {
          const name =
            [c.first_name, c.last_name].filter(Boolean).join(" ") ||
            c.phone ||
            c.email ||
            "Unknown";
          return {
            kind: "contact" as const,
            id: c.id,
            label: name,
            detail: c.phone ?? undefined,
            recipientCount: 1,
          };
        });
    } else if (targetMode === "lists") {
      pool = lists;
    } else {
      pool = groups;
    }
    if (!q) return pool.slice(0, 80);
    return pool.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 80);
  }, [targetMode, targetQuery, contacts, lists, groups]);

  const charCount = message.length;
  const charsWarn = charCount > WA_SOFT_LIMIT;
  const charsHard = charCount > WA_HARD_LIMIT;
  const throttleHint = throttleEstimate(target?.recipientCount);

  const backdropRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Send via WhatsApp"
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-app sm:h-[min(720px,90vh)] sm:max-w-3xl sm:rounded-xl sm:border sm:border-app sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-app px-4 py-3">
          <div>
            <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-faint">
              WhatsApp blast
            </div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-app">
              {item.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-secondary hover:bg-app-elevated hover:text-app"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden sm:grid-cols-5">
          {/* ─── Item preview ─── */}
          <aside className="border-b border-app bg-app-elevated p-4 sm:col-span-2 sm:border-b-0 sm:border-r">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-app bg-surface">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-faint">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {item.sku && (
                <div className="font-mono text-[0.55rem] uppercase tracking-[0.16em] text-faint">
                  {item.sku}
                </div>
              )}
              <div className="text-sm font-semibold text-app">{item.name}</div>
              {item.category && (
                <div className="text-xs text-secondary">{item.category}</div>
              )}
              {item.price != null && (
                <div className="font-mono text-base font-semibold tabular-nums text-tool-accent">
                  {formatPrice(item.price, item.currency)}
                </div>
              )}
              {item.quantity != null && (
                <div className="font-mono text-[0.65rem] text-faint">
                  {item.quantity.toLocaleString()} {item.unit ?? ""} available
                </div>
              )}
              {item.description && (
                <p className="mt-2 line-clamp-4 text-xs text-secondary">
                  {item.description}
                </p>
              )}
            </div>
          </aside>

          {/* ─── Composer ─── */}
          <section className="flex flex-col overflow-y-auto p-4 sm:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-1 flex-wrap gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-faint">
                  Language
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-8 rounded-md border border-app bg-app-elevated px-2 text-xs text-app focus:border-tool-accent focus:outline-none"
                  >
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-faint">
                  Tone
                  <select
                    value={tone}
                    onChange={(e) =>
                      setTone(
                        e.target.value as (typeof TONE_OPTIONS)[number]["value"]
                      )
                    }
                    className="h-8 rounded-md border border-app bg-app-elevated px-2 text-xs text-app focus:border-tool-accent focus:outline-none"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-faint">
                  Length
                  <select
                    value={length}
                    onChange={(e) =>
                      setLength(
                        e.target
                          .value as (typeof LENGTH_OPTIONS)[number]["value"]
                      )
                    }
                    className="h-8 rounded-md border border-app bg-app-elevated px-2 text-xs text-app focus:border-tool-accent focus:outline-none"
                  >
                    {LENGTH_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="h-8 rounded-md bg-tool-accent px-3 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] disabled:opacity-50"
                style={{ color: "var(--bg)" }}
              >
                {generating ? "Generating…" : "Generate captions"}
              </button>
            </div>

            {genError && (
              <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {genError}
              </div>
            )}

            {variants.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {variants.map((v, i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => {
                      setActiveVariantIdx(i);
                      setMessage(v);
                    }}
                    className={`text-left rounded-md border p-2 text-[0.7rem] leading-relaxed ${
                      activeVariantIdx === i
                        ? "border-tool-accent bg-tool-accent/10 text-app"
                        : "border-app bg-app-elevated text-secondary hover:border-tool-accent/50"
                    }`}
                  >
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.16em] text-faint">
                      Variant {i + 1}
                    </div>
                    <p className="mt-1 line-clamp-5 whitespace-pre-wrap">{v}</p>
                  </button>
                ))}
              </div>
            )}

            <label className="mt-3 flex flex-1 flex-col gap-1">
              <span className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-faint">
                Caption
              </span>
              <textarea
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (activeVariantIdx !== null) setActiveVariantIdx(null);
                }}
                placeholder="Write or generate a caption…"
                rows={6}
                className="flex-1 resize-y rounded-md border border-app bg-app-elevated p-3 text-sm text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
              />
              <div
                className={`text-right font-mono text-[0.6rem] ${
                  charsHard
                    ? "text-red-500"
                    : charsWarn
                      ? "text-amber-500"
                      : "text-faint"
                }`}
              >
                {charCount} / {WA_HARD_LIMIT}
                {charsHard && " — over WhatsApp limit"}
              </div>
            </label>

            {/* Targets */}
            <div className="mt-3 rounded-md border border-app">
              <div className="flex items-center gap-1 border-b border-app bg-app-elevated px-2 py-1">
                {(
                  [
                    { key: "contacts", label: `Contacts (${contacts.length})` },
                    { key: "lists", label: `Lists (${lists.length})` },
                    { key: "groups", label: `Groups (${groups.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setTargetMode(tab.key)}
                    className={`rounded-md px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${
                      targetMode === tab.key
                        ? "bg-tool-accent text-[var(--bg)]"
                        : "text-faint hover:text-app"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                <input
                  value={targetQuery}
                  onChange={(e) => setTargetQuery(e.target.value)}
                  placeholder="Search…"
                  className="ml-auto h-7 w-40 rounded-md border border-app bg-app px-2 text-xs text-app placeholder:text-faint focus:border-tool-accent focus:outline-none"
                />
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                {loadingTargets ? (
                  <div className="p-3 text-center text-xs text-faint">
                    Loading…
                  </div>
                ) : targetList.length === 0 ? (
                  <div className="p-3 text-center text-xs text-faint">
                    {targetMode === "contacts"
                      ? "No contacts with a phone number yet."
                      : targetMode === "lists"
                        ? "No WhatsApp lists. Create one in /tools/whatsapp."
                        : "No WhatsApp groups yet."}
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {targetList.map((opt) => (
                      <li key={`${opt.kind}:${opt.id}`}>
                        <button
                          type="button"
                          onClick={() => setTarget(opt)}
                          className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs ${
                            target?.id === opt.id && target.kind === opt.kind
                              ? "bg-tool-accent/10 text-app"
                              : "text-secondary hover:bg-app-elevated"
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          {opt.detail && (
                            <span className="ml-2 shrink-0 font-mono text-[0.55rem] text-faint">
                              {opt.detail}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {throttleHint && (
              <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
                Sending to {target?.recipientCount} recipients will take roughly{" "}
                {throttleHint} (queued in the background).
              </div>
            )}

            {sendError && (
              <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {sendError}
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-md border border-app bg-app-elevated px-3 text-xs text-secondary hover:text-app"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={
                  sending || !target || !message.trim() || charsHard
                }
                className="h-8 rounded-md bg-emerald-500 px-4 font-mono text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-white disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
