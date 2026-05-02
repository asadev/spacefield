/* ─────────────────────────────────────────────────────────────────────────
 * toShare link type system.
 *
 * Each link has a `type` that determines which viewer renders it. The
 * payload schema is type-specific — see ToShareLinkPayload below.
 * ───────────────────────────────────────────────────────────────────── */

export const TOSHARE_TYPES = ["form", "page", "quote", "booking", "redirect", "file"] as const;
export type ToShareType = (typeof TOSHARE_TYPES)[number];

export const TOSHARE_TYPE_PREFIX: Record<ToShareType, string> = {
  form: "f",
  page: "p",
  quote: "q",
  booking: "b",
  redirect: "r",
  file: "d",  // 'd' for download (f is taken)
};

export const TOSHARE_PREFIX_TO_TYPE: Record<string, ToShareType> = Object.fromEntries(
  Object.entries(TOSHARE_TYPE_PREFIX).map(([type, prefix]) => [prefix, type as ToShareType])
);

// ─── Per-type payload shapes ────────────────────────────────────────────

export interface FormPayload {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  successMessage?: string;
  webhookUrl?: string;        // optional outbound on submit
  notifyEmail?: string;       // optional email notification
  brandColor?: string;        // hex
  brandLogo?: string;         // optional logo URL
}

export interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "textarea" | "select" | "checkbox" | "date" | "url";
  required?: boolean;
  placeholder?: string;
  options?: string[];         // for select
}

export interface PagePayload {
  title: string;
  hero?: { kind: "image"; src: string; alt?: string } | { kind: "video"; src: string };
  blocks: PageBlock[];
  ctaLabel?: string;
  ctaHref?: string;
  brandColor?: string;
  brandLogo?: string;
}

export type PageBlock =
  | { kind: "heading"; text: string; level?: 1 | 2 | 3 }
  | { kind: "paragraph"; text: string }
  | { kind: "image"; src: string; alt?: string; caption?: string }
  | { kind: "gallery"; items: { src: string; alt?: string }[] }
  | { kind: "stats"; items: { label: string; value: string }[] }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "video"; src: string }
  | { kind: "embed"; html: string }
  | { kind: "spacer"; size?: "sm" | "md" | "lg" };

export interface QuotePayload {
  title: string;
  recipientName?: string;
  recipientCompany?: string;
  issuedDate: string;       // ISO date
  validUntil?: string;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  currency: string;
  notes?: string;
  termsHtml?: string;
  acceptCtaLabel?: string;
  brandColor?: string;
  brandLogo?: string;
  /** Email address notified when someone accepts the quote. Optional. */
  notifyEmail?: string;
  /** Webhook fired on accept. Optional. */
  webhookUrl?: string;
}

export interface BookingPayload {
  title: string;
  description?: string;
  durationMinutes: number;
  windows: { dayOfWeek: number; startMinute: number; endMinute: number }[]; // 0=Sun
  timezone: string;
  buffer?: number;
  notifyEmail?: string;
  brandColor?: string;
}

export interface RedirectPayload {
  url: string;
  notes?: string;
}

export interface FilePayload {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;       // supabase storage path
  passwordHash?: string;     // optional password gate
  maxDownloads?: number;
  downloadCount?: number;
}

export type ToShareLinkPayload =
  | { type: "form"; data: FormPayload }
  | { type: "page"; data: PagePayload }
  | { type: "quote"; data: QuotePayload }
  | { type: "booking"; data: BookingPayload }
  | { type: "redirect"; data: RedirectPayload }
  | { type: "file"; data: FilePayload };

// ─── Row shape (matches DB) ─────────────────────────────────────────────

export interface ToShareLinkRow {
  id: string;
  workspace_id: string | null;
  owner_user_id: string | null;
  type: ToShareType;
  slug: string;
  custom_subdomain: string | null;
  payload: Record<string, unknown>;
  status: "active" | "paused" | "expired" | "disabled";
  view_count: number;
  submit_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  source_tool: string | null;
}

// ─── URL builder ────────────────────────────────────────────────────────

export const TOSHARE_DOMAIN = "toshare.net";

export function buildToShareUrl(row: Pick<ToShareLinkRow, "type" | "slug" | "custom_subdomain">): string {
  const prefix = TOSHARE_TYPE_PREFIX[row.type];
  const host = row.custom_subdomain
    ? `${row.custom_subdomain}.${TOSHARE_DOMAIN}`
    : TOSHARE_DOMAIN;
  return `https://${host}/${prefix}/${row.slug}`;
}

export function parseToSharePath(pathname: string): { type: ToShareType; slug: string } | null {
  const m = pathname.match(/^\/([a-z])\/([a-z0-9-]+)\/?$/i);
  if (!m) return null;
  const type = TOSHARE_PREFIX_TO_TYPE[m[1].toLowerCase()];
  if (!type) return null;
  return { type, slug: m[2].toLowerCase() };
}
