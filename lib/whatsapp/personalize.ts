import "server-only";

/**
 * Shared {{var}} personalization for WhatsApp message bodies.
 *
 * One interpolation contract used by:
 *   - the broadcast runner (per-recipient personalization_template)
 *   - the automation action executor (canned/menu replies)
 *
 * Mirrors the composer's client-side contract in ConversationsTab
 * (regex /\{\{\s*([\w.]+)\s*\}\}/g, keys like contact.firstName). Unknown
 * placeholders fall back to "" (or an explicit per-key fallback) so a
 * missing field never leaks a literal "{{contact.firstName}}" to a customer.
 */

export interface PersonalizeContact {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  city?: string | null;
  lifecycle_stage?: string | null;
  custom?: Record<string, unknown> | null;
}

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Build the interpolation context map from a CRM contact row. */
export function buildPersonalizeContext(
  contact: PersonalizeContact | null,
  extra?: Record<string, string>,
): Record<string, string> {
  const first = (contact?.first_name ?? "").trim();
  const last = (contact?.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ");
  const custom = (contact?.custom ?? {}) as Record<string, unknown>;
  const cityFromCustom =
    typeof custom.city === "string" ? (custom.city as string) : "";

  const ctx: Record<string, string> = {
    "contact.firstName": first,
    "contact.first_name": first,
    "contact.lastName": last,
    "contact.last_name": last,
    "contact.fullName": full,
    "contact.name": full || first,
    "contact.phone": (contact?.phone ?? "").trim(),
    "contact.email": (contact?.email ?? "").trim(),
    "contact.company": (contact?.company ?? "").trim(),
    "contact.lifecycle": (contact?.lifecycle_stage ?? "").trim(),
    city: ((contact?.city ?? "") as string).trim() || cityFromCustom,
  };

  // Expose every custom.* key as {{custom.<key>}} too.
  for (const [k, v] of Object.entries(custom)) {
    if (v == null) continue;
    ctx[`custom.${k}`] = String(v);
  }

  if (extra) Object.assign(ctx, extra);
  return ctx;
}

/**
 * Interpolate a template against a context map. Unknown keys resolve to the
 * empty string (never the literal placeholder). Whitespace inside {{ }} is
 * tolerated. Idempotent on plain text with no placeholders.
 */
export function interpolate(
  template: string,
  ctx: Record<string, string>,
): string {
  if (!template) return "";
  return template.replace(PLACEHOLDER_RE, (_m, key: string) => {
    const v = ctx[key];
    return v == null ? "" : v;
  });
}

/** Convenience: personalize a template directly from a contact row. */
export function personalizeForContact(
  template: string,
  contact: PersonalizeContact | null,
  extra?: Record<string, string>,
): string {
  return interpolate(template, buildPersonalizeContext(contact, extra));
}
