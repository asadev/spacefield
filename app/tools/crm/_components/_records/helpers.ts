/* ─────────────────────────────────────────────────────────────────────────
 * CRM records — shared utilities.
 * Pure helpers used by ContactsView / CompaniesView / InventoryView /
 * RecordTable / RecordDetail. No React imports — keeps the helpers easy
 * to unit-test and reusable across SSR + CSR boundaries.
 * ───────────────────────────────────────────────────────────────────── */

import type {
  CrmCompany,
  CrmContact,
  CrmCustomField,
  CrmCustomValues,
  CrmInventoryItem,
} from "../../types";

/** Format a UTC ISO timestamp as a relative phrase (e.g. "5m ago"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

/** Locale-aware number formatting that keeps tabular figures aligned. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return "—";
  }
  const code = (currency ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${formatNumber(amount)}`;
  }
}

/** Initials from first + last name (or fallback to email/sku). */
export function initialsFor(parts: Array<string | null | undefined>): string {
  const txt = parts
    .map((p) => (p ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  if (!txt) return "??";
  const segs = txt.split(/\s+/);
  if (segs.length === 1) return segs[0].slice(0, 2).toUpperCase();
  return (segs[0][0] + segs[segs.length - 1][0]).toUpperCase();
}

/** Combined display name for a contact (fallback to email or "Unnamed"). */
export function contactDisplayName(c: CrmContact): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (c.email) return c.email;
  return "Unnamed contact";
}

export function companyDisplayName(c: CrmCompany): string {
  return c.name?.trim() || "Unnamed company";
}

export function inventoryDisplayName(i: CrmInventoryItem): string {
  return i.name?.trim() || i.sku || "Unnamed item";
}

/** Render a custom-field value for read-only display. Type-aware. */
export function renderCustomValue(
  field: CrmCustomField,
  raw: unknown
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  switch (field.type) {
    case "number":
      return typeof raw === "number" ? formatNumber(raw) : String(raw);
    case "currency":
      return typeof raw === "number" ? formatCurrency(raw, "USD") : String(raw);
    case "date":
      return typeof raw === "string" ? relativeTime(raw) : String(raw);
    case "boolean":
      return raw ? "Yes" : "No";
    case "multiselect": {
      if (!Array.isArray(raw)) return String(raw);
      const labels = raw
        .map((v) => {
          const opt = field.options.find((o) => o.value === v);
          return opt?.label ?? String(v);
        })
        .join(", ");
      return labels || "—";
    }
    case "select": {
      const opt = field.options.find((o) => o.value === raw);
      return opt?.label ?? String(raw);
    }
    case "url":
    case "text":
    case "user":
    case "file":
    default:
      return String(raw);
  }
}

/** Tiny fuzzy filter for client-side search inside loaded rows. */
export function clientFilter<T>(rows: T[], q: string, getText: (r: T) => string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => getText(r).toLowerCase().includes(needle));
}

/** Sort helper preserving stable original ordering for equal keys. */
export function sortRows<T>(
  rows: T[],
  getKey: (r: T) => string | number | null | undefined,
  direction: "asc" | "desc"
): T[] {
  const decorated = rows.map((row, idx) => ({ row, idx, key: getKey(row) }));
  decorated.sort((a, b) => {
    const av = a.key;
    const bv = b.key;
    if (av === bv) return a.idx - b.idx;
    if (av === null || av === undefined) return direction === "asc" ? -1 : 1;
    if (bv === null || bv === undefined) return direction === "asc" ? 1 : -1;
    if (av < bv) return direction === "asc" ? -1 : 1;
    return direction === "asc" ? 1 : -1;
  });
  return decorated.map((d) => d.row);
}

/** Read a value from a record's `custom` jsonb keyed by field.key. */
export function readCustom(
  custom: CrmCustomValues | null | undefined,
  key: string
): unknown {
  if (!custom) return undefined;
  return (custom as Record<string, unknown>)[key];
}
