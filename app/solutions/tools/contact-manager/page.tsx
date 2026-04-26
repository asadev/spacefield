"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { Field, Stat, inputCls } from "../../_components/ToolCard";
import WorkspaceSwitcher from "@/components/solutions/WorkspaceSwitcher";
import {
  loadWorkspaceDataClient,
  useWorkspace,
} from "@/lib/workspaces/client";
import { saveWorkspaceData } from "@/lib/workspaces/server";

type Status = "lead" | "qualified" | "customer" | "lost";
type ViewMode = "list" | "grid" | "recent";

interface Contact {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  tags: string[];
  owner: string;
  source: string;
  status: Status;
  notes: string;
  createdAt: string;
}

interface ContactsState {
  contacts: Contact[];
}

const LS_KEY = "solutions:contact-manager:v1";
const VIEW_LS_KEY = "solutions:contact-manager:view:v1";
const NAMESPACE = "contacts";
const DATA_KEY = "current";
const SAVE_DEBOUNCE_MS = 700;

const STATUSES: Status[] = ["lead", "qualified", "customer", "lost"];

const uid = () => Math.random().toString(36).slice(2, 9);

// Levenshtein distance for fuzzy duplicate matching
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) dp[j] = prev;
      else dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Returns similarity 0..1; 1 = identical
function similarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (!la && !lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(la, lb) / maxLen;
}

// Pull activity counts from activity-timeline localStorage (if present)
function getActivityCountsFromTimeline(): Map<string, { count: number; lastAt: string }> {
  const map = new Map<string, { count: number; lastAt: string }>();
  try {
    const raw = localStorage.getItem("solutions:activity-timeline:v1");
    if (!raw) return map;
    const s = JSON.parse(raw) as {
      activities?: { contact: string; at: string }[];
    };
    (s.activities || []).forEach((a) => {
      const key = (a.contact || "").toLowerCase().trim();
      if (!key) return;
      const cur = map.get(key) || { count: 0, lastAt: "" };
      cur.count++;
      if (!cur.lastAt || a.at > cur.lastAt) cur.lastAt = a.at;
      map.set(key, cur);
    });
  } catch {}
  return map;
}

// Relationship strength: recency × frequency × volume
// Returns 0..100.
function relationshipStrength(
  activityCount: number,
  lastAtIso: string | undefined
): { score: number; label: string; cls: string } {
  if (!activityCount) return { score: 0, label: "Cold", cls: "text-faint" };
  const freq = Math.min(1, activityCount / 15); // saturate at 15+ activities

  let recency = 0;
  if (lastAtIso) {
    const days = Math.max(0, (Date.now() - new Date(lastAtIso).getTime()) / 86400000);
    if (days < 7) recency = 1;
    else if (days < 30) recency = 0.8;
    else if (days < 90) recency = 0.5;
    else if (days < 180) recency = 0.2;
    else recency = 0.05;
  }
  const volume = Math.min(1, activityCount / 25);
  const raw = (recency * 0.5 + freq * 0.3 + volume * 0.2) * 100;
  const score = Math.round(raw);
  if (score >= 70) return { score, label: "Strong", cls: "text-emerald-500" };
  if (score >= 40) return { score, label: "Active", cls: "text-tool-accent" };
  if (score >= 15) return { score, label: "Warm", cls: "text-amber-500" };
  return { score, label: "Cold", cls: "text-faint" };
}

function defaultState(): ContactsState {
  return {
    contacts: [
      {
        id: uid(),
        name: "Jane Doe",
        company: "Acme Co",
        title: "VP Sales",
        email: "jane@acme.co",
        phone: "+1 555 0100",
        tags: ["inbound", "enterprise"],
        owner: "Asad",
        source: "Website",
        status: "qualified",
        notes: "Met at SaaStr. Expanding EMEA team, needs pipeline tooling.",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

// RFC 4180-ish CSV parser
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function escapeCsv(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// vCard export — single multi-contact .vcf
function toVCard(contacts: Contact[]): string {
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return contacts
    .map((c) => {
      const lines = ["BEGIN:VCARD", "VERSION:3.0"];
      const parts = c.name.trim().split(/\s+/);
      const last = parts.length > 1 ? parts[parts.length - 1] : "";
      const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : c.name;
      lines.push(`N:${esc(last)};${esc(first)};;;`);
      lines.push(`FN:${esc(c.name)}`);
      if (c.company) lines.push(`ORG:${esc(c.company)}`);
      if (c.title) lines.push(`TITLE:${esc(c.title)}`);
      if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
      if (c.phone) lines.push(`TEL;TYPE=CELL:${esc(c.phone)}`);
      if (c.tags.length) lines.push(`CATEGORIES:${c.tags.map(esc).join(",")}`);
      if (c.notes) lines.push(`NOTE:${esc(c.notes)}`);
      lines.push("END:VCARD");
      return lines.join("\r\n");
    })
    .join("\r\n");
}

export default function ContactManagerPage() {
  return (
    <ToolShell
      category="CRM & Sales Ops"
      title="Contact Manager"
      description="A lightweight CRM contact database. Filter, tag, merge duplicates, and import or export CSV. Team mode shares the book across your workspace."
    >
      <div data-tool-theme="crm" data-tool="contact-manager">
        <Inner />
      </div>
    </ToolShell>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusTone(s: Status): string {
  switch (s) {
    case "customer":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-500";
    case "qualified":
      return "border-tool-accent bg-tool-accent-soft text-tool-accent";
    case "lost":
      return "border-rose-500/40 bg-rose-500/15 text-rose-500";
    default:
      return "border-app bg-app-elevated text-secondary";
  }
}

function Inner() {
  const { current, loading: wsLoading } = useWorkspace();
  const [state, setState] = useState<ContactsState>(defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSig = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    if (wsLoading) return;
    let cancelled = false;
    (async () => {
      setHydrated(false);
      if (current.kind === "team") {
        const data = await loadWorkspaceDataClient<ContactsState>(
          current.id,
          NAMESPACE,
          DATA_KEY
        );
        if (cancelled) return;
        setState(data && Array.isArray(data.contacts) ? data : defaultState());
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY);
          setState(raw ? (JSON.parse(raw) as ContactsState) : defaultState());
        } catch {
          setState(defaultState());
        }
      }
      try {
        const v = localStorage.getItem(VIEW_LS_KEY);
        if (v === "list" || v === "grid" || v === "recent") setView(v);
      } catch {}
      lastSig.current = null;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [current, wsLoading]);

  useEffect(() => {
    if (!hydrated) return;
    const sig = JSON.stringify(state);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (current.kind === "team") {
        setSyncing(true);
        const res = await saveWorkspaceData(current.id, NAMESPACE, DATA_KEY, state);
        setSyncing(false);
        if (res.ok) setSyncedAt(new Date().toLocaleTimeString());
      } else {
        try {
          localStorage.setItem(LS_KEY, sig);
          setSyncedAt(new Date().toLocaleTimeString());
        } catch {}
      }
    }, SAVE_DEBOUNCE_MS);
  }, [state, hydrated, current]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(VIEW_LS_KEY, view);
    } catch {}
  }, [view, hydrated]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    state.contacts.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = state.contacts.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterTag !== "all" && !c.tags.includes(filterTag)) return false;
      if (!q) return true;
      return [c.name, c.company, c.email, c.title, c.phone, c.notes]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    if (view === "recent") {
      list = [...list].sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );
    }
    return list;
  }, [state, query, filterTag, filterStatus, view]);

  const selectedContact = selected
    ? state.contacts.find((c) => c.id === selected)
    : null;

  const stats = useMemo(() => {
    const by = { lead: 0, qualified: 0, customer: 0, lost: 0 };
    state.contacts.forEach((c) => {
      by[c.status]++;
    });
    return by;
  }, [state]);

  const addContact = () => {
    const c: Contact = {
      id: uid(),
      name: "New contact",
      company: "",
      title: "",
      email: "",
      phone: "",
      tags: [],
      owner: "",
      source: "",
      status: "lead",
      notes: "",
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ contacts: [c, ...s.contacts] }));
    setSelected(c.id);
  };

  const update = (id: string, patch: Partial<Contact>) =>
    setState((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

  const remove = (id: string) => {
    if (!confirm("Delete this contact?")) return;
    setState((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }));
    if (selected === id) setSelected(null);
  };

  const mergeDuplicates = () => {
    const byKey = new Map<string, Contact[]>();
    state.contacts.forEach((c) => {
      const key =
        c.email.trim().toLowerCase() ||
        `${c.name.trim().toLowerCase()}|${c.company.trim().toLowerCase()}`;
      if (!key) return;
      const arr = byKey.get(key) || [];
      arr.push(c);
      byKey.set(key, arr);
    });
    const merged: Contact[] = [];
    let mergedCount = 0;
    byKey.forEach((group) => {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        mergedCount += group.length - 1;
        const base = { ...group[0] };
        group.slice(1).forEach((g) => {
          base.tags = Array.from(new Set([...base.tags, ...g.tags]));
          base.notes = [base.notes, g.notes].filter(Boolean).join("\n---\n");
          base.email = base.email || g.email;
          base.phone = base.phone || g.phone;
          base.company = base.company || g.company;
          base.title = base.title || g.title;
          base.owner = base.owner || g.owner;
          base.source = base.source || g.source;
        });
        merged.push(base);
      }
    });
    setState({ contacts: merged });
    alert(`Merged ${mergedCount} exact duplicate${mergedCount === 1 ? "" : "s"}.`);
  };

  // Fuzzy duplicates candidates — show pairs above threshold, user confirms merge.
  const fuzzyCandidates = useMemo(() => {
    const pairs: { a: Contact; b: Contact; score: number }[] = [];
    const threshold = 0.82; // fairly tight to avoid false positives
    for (let i = 0; i < state.contacts.length; i++) {
      for (let j = i + 1; j < state.contacts.length; j++) {
        const a = state.contacts[i];
        const b = state.contacts[j];
        // Skip exact-email duplicates (exact merge already catches them)
        if (
          a.email &&
          b.email &&
          a.email.toLowerCase() === b.email.toLowerCase()
        )
          continue;
        const nameSim = similarity(a.name, b.name);
        const companySim = a.company && b.company ? similarity(a.company, b.company) : 0;
        const score = (nameSim * 0.7 + companySim * 0.3);
        if (nameSim >= threshold || score >= threshold) {
          pairs.push({ a, b, score });
        }
      }
    }
    pairs.sort((x, y) => y.score - x.score);
    return pairs.slice(0, 10);
  }, [state.contacts]);

  const mergePair = (aId: string, bId: string) => {
    setState((s) => {
      const a = s.contacts.find((c) => c.id === aId);
      const b = s.contacts.find((c) => c.id === bId);
      if (!a || !b) return s;
      const merged: Contact = {
        ...a,
        tags: Array.from(new Set([...a.tags, ...b.tags])),
        notes: [a.notes, b.notes].filter(Boolean).join("\n---\n"),
        email: a.email || b.email,
        phone: a.phone || b.phone,
        company: a.company || b.company,
        title: a.title || b.title,
        owner: a.owner || b.owner,
        source: a.source || b.source,
      };
      return {
        contacts: s.contacts
          .filter((c) => c.id !== bId)
          .map((c) => (c.id === aId ? merged : c)),
      };
    });
  };

  // Activity counts pulled from activity-timeline LS
  const [activityCounts, setActivityCounts] = useState<
    Map<string, { count: number; lastAt: string }>
  >(new Map());

  useEffect(() => {
    if (!hydrated) return;
    setActivityCounts(getActivityCountsFromTimeline());
    // Refresh every 30s so a user editing activities nearby sees updates
    const iv = setInterval(() => {
      setActivityCounts(getActivityCountsFromTimeline());
    }, 30_000);
    return () => clearInterval(iv);
  }, [hydrated]);

  const relFor = (c: Contact) => {
    const entry = activityCounts.get(c.name.toLowerCase().trim());
    return relationshipStrength(entry?.count || 0, entry?.lastAt);
  };

  const exportCsv = () => {
    const headers = [
      "name",
      "company",
      "title",
      "email",
      "phone",
      "tags",
      "owner",
      "source",
      "status",
      "notes",
    ];
    const lines = [headers.join(",")];
    state.contacts.forEach((c) => {
      lines.push(
        [
          c.name,
          c.company,
          c.title,
          c.email,
          c.phone,
          c.tags.join("|"),
          c.owner,
          c.source,
          c.status,
          c.notes,
        ]
          .map(escapeCsv)
          .join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVcf = () => {
    const blob = new Blob([toVCard(state.contacts)], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.vcf";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const rows = parseCsv(text);
      if (rows.length < 2) {
        alert("CSV must have a header and at least one row.");
        return;
      }
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (k: string) => headers.indexOf(k);
      const add: Contact[] = rows.slice(1).map((r) => ({
        id: uid(),
        name: r[idx("name")] || "",
        company: r[idx("company")] || "",
        title: r[idx("title")] || "",
        email: r[idx("email")] || "",
        phone: r[idx("phone")] || "",
        tags: (r[idx("tags")] || "")
          .split(/[|,]/)
          .map((t) => t.trim())
          .filter(Boolean),
        owner: r[idx("owner")] || "",
        source: r[idx("source")] || "",
        status: (STATUSES.includes(r[idx("status")] as Status)
          ? r[idx("status")]
          : "lead") as Status,
        notes: r[idx("notes")] || "",
        createdAt: new Date().toISOString(),
      }));
      setState((s) => ({ contacts: [...add, ...s.contacts] }));
      alert(`Imported ${add.length} contacts.`);
    };
    reader.readAsText(file);
  };

  // vCard import — accepts a single .vcf with one or more BEGIN:VCARD blocks
  const importVcf = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const blocks = text
        .split(/BEGIN:VCARD/i)
        .slice(1)
        .map((b) => b.split(/END:VCARD/i)[0]);
      const add: Contact[] = blocks.map((blk) => {
        const lines = blk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const get = (key: RegExp) => {
          const ln = lines.find((l) => key.test(l));
          if (!ln) return "";
          const idx = ln.indexOf(":");
          return idx >= 0 ? ln.slice(idx + 1).replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";") : "";
        };
        const tagsRaw = get(/^CATEGORIES/i);
        return {
          id: uid(),
          name: get(/^FN/i),
          company: get(/^ORG/i),
          title: get(/^TITLE/i),
          email: get(/^EMAIL/i),
          phone: get(/^TEL/i),
          tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [],
          owner: "",
          source: "vCard",
          status: "lead" as Status,
          notes: get(/^NOTE/i),
          createdAt: new Date().toISOString(),
        };
      }).filter((c) => c.name);
      if (!add.length) {
        alert("No vCards found in file.");
        return;
      }
      setState((s) => ({ contacts: [...add, ...s.contacts] }));
      alert(`Imported ${add.length} contact${add.length === 1 ? "" : "s"} from vCard.`);
    };
    reader.readAsText(file);
  };

  const selectedRel = selectedContact ? relFor(selectedContact) : null;
  const selectedActivity = selectedContact
    ? activityCounts.get(selectedContact.name.toLowerCase().trim())
    : undefined;

  return (
    <>
      <WorkspaceSwitcher />

      {/* ============================== MASTHEAD ============================== */}
      <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
        {/* console chrome */}
        <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
          <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-tool-accent">
            CRM
          </span>
          <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
            {current.kind === "team" ? "team · synced" : "personal · device"}
          </span>
          <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            <span className="text-tool-accent">▸</span>
            contacts.book
            <span className="text-faint">/</span>
            <span className="text-secondary">
              {state.contacts.length} record{state.contacts.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="font-mono text-[0.6rem] text-muted">
            {syncing ? "◉ saving…" : syncedAt ? `◉ saved ${syncedAt}` : hydrated ? "◉ ready" : ""}
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                Contact directory · CRM book
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                {state.contacts.length} contact
                {state.contacts.length === 1 ? "" : "s"} on the book
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {stats.lead}L · {stats.qualified}Q · {stats.customer}C · {stats.lost}X
                </span>
                <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-secondary">
                  {allTags.length} tag{allTags.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label className="cursor-pointer rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCsv(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent">
                Import vCard
                <input
                  type="file"
                  accept=".vcf,text/vcard,text/x-vcard"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importVcf(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={exportCsv}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Export CSV
              </button>
              <button
                onClick={exportVcf}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Export vCard
              </button>
              <button
                onClick={mergeDuplicates}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Merge dupes
              </button>
              <button
                onClick={addContact}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + New contact
              </button>
            </div>
          </div>
        </div>

        {/* sub-tab strip — view segmented control */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
            {(
              [
                { k: "list", label: "List" },
                { k: "grid", label: "Grid" },
                { k: "recent", label: "Recent" },
              ] as { k: ViewMode; label: string }[]
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setView(t.k)}
                className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                  view === t.k
                    ? "bg-tool-accent-soft text-tool-accent"
                    : "text-secondary hover:text-app"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
            {filtered.length} shown · {state.contacts.length} total
          </div>
        </div>
      </section>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total" value={String(state.contacts.length)} accent />
        <Stat label="Leads" value={String(stats.lead)} />
        <Stat label="Qualified" value={String(stats.qualified)} />
        <Stat label="Customers" value={String(stats.customer)} />
        <Stat label="Lost" value={String(stats.lost)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left rail: searchable contact list */}
        <aside className="flex flex-col rounded-xl border border-app bg-app-elevated">
          <div className="space-y-2 border-b border-app p-3">
            <input
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={inputCls()}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={inputCls()}
              >
                <option value="all">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className={inputCls()}
              >
                <option value="all">All tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              <span>{filtered.length} shown</span>
              <span>{state.contacts.length} total</span>
            </div>
          </div>

          {view === "grid" ? (
            <div className="grid max-h-[640px] grid-cols-2 gap-2 overflow-y-auto p-3">
              {filtered.map((c) => {
                const rel = relFor(c);
                const active = selected === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c.id)}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-tool-accent bg-tool-accent-soft"
                        : "border-app bg-app hover:border-tool-accent"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-tool-accent-soft font-mono text-xs font-semibold text-tool-accent">
                      {initials(c.name || "?")}
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="truncate text-sm font-medium text-app">
                        {c.name || "Untitled"}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {c.company || "—"}
                      </div>
                      <div className={`mt-1 font-mono text-[0.55rem] uppercase tracking-[0.14em] ${rel.cls}`}>
                        {rel.label} · {rel.score}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-2 rounded-xl border border-dashed border-app bg-app p-6 text-center text-sm text-muted">
                  No contacts match.
                </div>
              )}
            </div>
          ) : (
            <ul className="max-h-[640px] divide-y divide-app overflow-y-auto">
              {filtered.map((c) => {
                const rel = relFor(c);
                const entry = activityCounts.get(c.name.toLowerCase().trim());
                const active = selected === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                        active
                          ? "bg-tool-accent-soft"
                          : "hover:bg-app"
                      }`}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-tool-accent-soft font-mono text-xs font-semibold text-tool-accent">
                        {initials(c.name || "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm font-medium ${
                              active ? "text-app" : "text-app"
                            }`}
                          >
                            {c.name || "Untitled"}
                          </span>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.14em] ${statusTone(c.status)}`}
                          >
                            {c.status}
                          </span>
                        </div>
                        <div className="truncate text-xs text-muted">
                          {c.company || "—"}
                          {c.title ? ` · ${c.title}` : ""}
                        </div>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.14em]">
                          <span className={rel.cls}>
                            {rel.label} · {rel.score}
                          </span>
                          <span className="text-faint">·</span>
                          <span className="text-muted">
                            {entry?.count ?? 0} acts
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="p-8 text-center text-sm text-muted">
                  No contacts match.
                </li>
              )}
            </ul>
          )}
        </aside>

        {/* Main pane: contact card */}
        <section className="rounded-xl border border-app bg-app-elevated">
          {selectedContact && selectedRel ? (
            <div>
              {/* Header */}
              <div className="flex flex-wrap items-start gap-4 border-b border-app p-6">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-tool-accent-soft text-2xl font-semibold text-tool-accent">
                  {initials(selectedContact.name || "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                    {selectedContact.status}
                  </div>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-app">
                    {selectedContact.name || "Untitled contact"}
                  </h3>
                  <div className="text-sm text-secondary">
                    {selectedContact.title || "—"}
                    {selectedContact.company
                      ? ` at ${selectedContact.company}`
                      : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-secondary">
                    {selectedContact.email && (
                      <span className="rounded-md border border-app bg-app px-2 py-0.5">
                        {selectedContact.email}
                      </span>
                    )}
                    {selectedContact.phone && (
                      <span className="rounded-md border border-app bg-app px-2 py-0.5">
                        {selectedContact.phone}
                      </span>
                    )}
                    {selectedContact.source && (
                      <span className="rounded-md border border-app bg-app px-2 py-0.5">
                        via {selectedContact.source}
                      </span>
                    )}
                    {selectedContact.owner && (
                      <span className="rounded-md border border-app bg-app px-2 py-0.5">
                        owner · {selectedContact.owner}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="rounded-xl border border-tool-accent bg-tool-accent-soft px-4 py-3 text-right">
                    <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                      Relationship
                    </div>
                    <div className="text-2xl font-semibold text-app">
                      {selectedRel.score}
                    </div>
                    <div className={`font-mono text-[0.6rem] uppercase tracking-[0.15em] ${selectedRel.cls}`}>
                      {selectedRel.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags + recent activity */}
              <div className="grid grid-cols-1 gap-4 border-b border-app p-6 md:grid-cols-2">
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Tags
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedContact.tags.length === 0 && (
                      <span className="text-xs text-muted">No tags</span>
                    )}
                    {selectedContact.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-tool-accent-soft px-2.5 py-0.5 text-[0.65rem] text-tool-accent"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Recent activity
                  </div>
                  <div className="mt-2 text-sm text-secondary">
                    {selectedActivity ? (
                      <>
                        <span className="font-medium text-app">
                          {selectedActivity.count}
                        </span>{" "}
                        logged event
                        {selectedActivity.count === 1 ? "" : "s"}
                        {selectedActivity.lastAt && (
                          <span className="text-muted">
                            {" · last "}
                            {new Date(selectedActivity.lastAt).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">
                        No activity logged yet — try the Activity Timeline tool.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit fields */}
              <div className="p-6">
                <div className="mb-3 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                  Contact details
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="Name">
                    <input
                      value={selectedContact.name}
                      onChange={(e) =>
                        update(selectedContact.id, { name: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Company">
                    <input
                      value={selectedContact.company}
                      onChange={(e) =>
                        update(selectedContact.id, { company: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Title">
                    <input
                      value={selectedContact.title}
                      onChange={(e) =>
                        update(selectedContact.id, { title: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      value={selectedContact.email}
                      onChange={(e) =>
                        update(selectedContact.id, { email: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={selectedContact.phone}
                      onChange={(e) =>
                        update(selectedContact.id, { phone: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Owner">
                    <input
                      value={selectedContact.owner}
                      onChange={(e) =>
                        update(selectedContact.id, { owner: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Source">
                    <input
                      value={selectedContact.source}
                      onChange={(e) =>
                        update(selectedContact.id, { source: e.target.value })
                      }
                      className={inputCls()}
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={selectedContact.status}
                      onChange={(e) =>
                        update(selectedContact.id, {
                          status: e.target.value as Status,
                        })
                      }
                      className={inputCls()}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Tags (comma-separated)">
                      <input
                        value={selectedContact.tags.join(", ")}
                        onChange={(e) =>
                          update(selectedContact.id, {
                            tags: e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        className={inputCls()}
                      />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Notes">
                      <textarea
                        value={selectedContact.notes}
                        onChange={(e) =>
                          update(selectedContact.id, { notes: e.target.value })
                        }
                        className={inputCls("min-h-[120px]")}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => remove(selectedContact.id)}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center bg-app-elevated p-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-tool-accent-soft">
                <span className="font-mono text-lg font-semibold text-tool-accent">
                  CRM
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-app">
                Pick a contact
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Select someone from the left rail to see their full card —
                title, relationship score, tags, recent activity, and notes.
              </p>
              <button
                onClick={addContact}
                className="mt-4 rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                + Add contact
              </button>
            </div>
          )}
        </section>
      </div>

      {fuzzyCandidates.length > 0 && (
        <ToolCard
          title="Possible duplicates"
          subtitle={`${fuzzyCandidates.length} fuzzy match${fuzzyCandidates.length === 1 ? "" : "es"} · Levenshtein similarity ≥ 82%`}
          className="mt-6"
        >
          <ul className="space-y-2">
            {fuzzyCandidates.map((p, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium text-app">
                    {p.a.name}{" "}
                    <span className="text-muted">
                      ({p.a.company || "—"})
                    </span>
                  </div>
                  <div className="text-secondary">
                    {p.b.name}{" "}
                    <span className="text-muted">
                      ({p.b.company || "—"})
                    </span>
                  </div>
                </div>
                <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-amber-500">
                  {(p.score * 100).toFixed(0)}% match
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Merge "${p.b.name}" into "${p.a.name}"?`)) {
                      mergePair(p.a.id, p.b.id);
                    }
                  }}
                  className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-90"
                  style={{ color: "var(--bg)" }}
                >
                  Merge
                </button>
              </li>
            ))}
          </ul>
        </ToolCard>
      )}
    </>
  );
}
