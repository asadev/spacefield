/* ─────────────────────────────────────────────────────────────────────────
 * CRM template registry — the two real templates that ship in v1.
 *
 *   - `general`    → minimal vertical-agnostic stack for consultants,
 *                    agencies, freelancers, SaaS founders.
 *   - `real-estate`→ Property Sales + Property Rentals pipelines, deep
 *                    custom-field set keyed off Dubai's market vocab,
 *                    section relabels (Inventory → Properties,
 *                    Companies → Developers).
 *
 * Adding a third template = drop it into CRM_TEMPLATES below + ensure the
 * profession ids in `matchProfessions` actually appear in
 * `app/tools/_data/professions.ts` if you want auto-apply on onboarding.
 *
 * Colors use Tailwind 500-tier hex so kanban cards / pills render
 * predictably in light + dark themes.
 * ───────────────────────────────────────────────────────────────────── */

import type { CrmTemplate } from "./types";

const COLORS = {
  slate: "#94a3b8",
  sky: "#0ea5e9",
  indigo: "#6366f1",
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#ef4444",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  pink: "#ec4899",
} as const;

/* ── general ─────────────────────────────────────────────────────────── */
const general: CrmTemplate = {
  id: "general",
  name: "General CRM",
  description:
    "A vertical-agnostic starter: a single sales pipeline, a small custom-field set, and a few tags. Best when you don't fit a specific industry yet.",
  matchProfessions: [
    "general",
    "consultant",
    "agency",
    "saas",
    "freelancer",
  ],
  pipelines: [
    {
      name: "Sales pipeline",
      is_default: true,
      stages: [
        { name: "Lead", kind: "open", probability: 10, rot_days: 30, color: COLORS.slate },
        { name: "Qualified", kind: "open", probability: 30, rot_days: 14, color: COLORS.sky },
        { name: "Proposal", kind: "open", probability: 60, rot_days: 7, color: COLORS.indigo },
        { name: "Negotiation", kind: "open", probability: 85, rot_days: 7, color: COLORS.amber },
        { name: "Won", kind: "won", probability: 100, rot_days: 0, color: COLORS.emerald },
        { name: "Lost", kind: "lost", probability: 0, rot_days: 0, color: COLORS.rose },
      ],
    },
  ],
  customFields: [
    { record_type: "contact", field_key: "linkedin_url", label: "LinkedIn", field_type: "url", sort_order: 10 },
    { record_type: "contact", field_key: "notes_summary", label: "Notes summary", field_type: "textarea", sort_order: 11 },
    { record_type: "company", field_key: "domain", label: "Domain", field_type: "url", sort_order: 10 },
    { record_type: "company", field_key: "industry", label: "Industry", field_type: "text", sort_order: 11 },
    {
      record_type: "deal",
      field_key: "source",
      label: "Source",
      field_type: "select",
      options: ["Inbound", "Outbound", "Referral", "Website", "Other"],
      sort_order: 10,
    },
    {
      record_type: "deal",
      field_key: "priority",
      label: "Priority",
      field_type: "select",
      options: ["Low", "Medium", "High", "Critical"],
      sort_order: 11,
    },
    {
      record_type: "lead",
      field_key: "source",
      label: "Source",
      field_type: "select",
      options: ["Inbound", "Outbound", "Referral", "Website", "Other"],
      sort_order: 10,
    },
    { record_type: "lead", field_key: "score", label: "Score", field_type: "number", sort_order: 11 },
    { record_type: "inventory", field_key: "sku", label: "SKU", field_type: "text", sort_order: 10 },
    { record_type: "inventory", field_key: "category", label: "Category", field_type: "text", sort_order: 11 },
  ],
  tags: [
    { name: "Hot", color: COLORS.rose },
    { name: "Cold", color: COLORS.sky },
    { name: "Follow-up", color: COLORS.amber },
    { name: "VIP", color: COLORS.violet },
  ],
};

/* ── real-estate ─────────────────────────────────────────────────────── */
const realEstate: CrmTemplate = {
  id: "real-estate",
  name: "Real estate",
  description:
    "Two pipelines (Property Sales + Property Rentals), property-specific inventory fields, buyer/developer custom fields, and section relabels: Inventory becomes Properties, Companies becomes Developers.",
  matchProfessions: [
    "real-estate-broker",
    "real-estate-agent",
    "real-estate",
    "broker",
    "realtor",
    "property-manager",
    "property-developer",
  ],
  sectionLabels: {
    inventory: "Properties",
    companies: "Developers",
  },
  pipelines: [
    {
      name: "Property Sales",
      is_default: true,
      stages: [
        { name: "New Inquiry", kind: "open", probability: 5, rot_days: 14, color: COLORS.slate },
        { name: "Qualified Lead", kind: "open", probability: 15, rot_days: 14, color: COLORS.sky },
        { name: "Property Tour", kind: "open", probability: 35, rot_days: 7, color: COLORS.indigo },
        { name: "Offer Made", kind: "open", probability: 55, rot_days: 7, color: COLORS.violet },
        { name: "Offer Accepted", kind: "open", probability: 75, rot_days: 7, color: COLORS.amber },
        { name: "In Escrow", kind: "open", probability: 90, rot_days: 14, color: COLORS.teal },
        { name: "Closed Won", kind: "won", probability: 100, rot_days: 0, color: COLORS.emerald },
        { name: "Closed Lost", kind: "lost", probability: 0, rot_days: 0, color: COLORS.rose },
      ],
    },
    {
      name: "Property Rentals",
      is_default: false,
      stages: [
        { name: "New Inquiry", kind: "open", probability: 5, rot_days: 7, color: COLORS.slate },
        { name: "Viewing Scheduled", kind: "open", probability: 30, rot_days: 3, color: COLORS.sky },
        { name: "Application", kind: "open", probability: 65, rot_days: 3, color: COLORS.amber },
        { name: "Lease Signed", kind: "won", probability: 100, rot_days: 0, color: COLORS.emerald },
        { name: "Withdrawn", kind: "lost", probability: 0, rot_days: 0, color: COLORS.rose },
      ],
    },
  ],
  customFields: [
    /* inventory — properties */
    { record_type: "inventory", field_key: "bedrooms", label: "Bedrooms", field_type: "number", sort_order: 10 },
    { record_type: "inventory", field_key: "bathrooms", label: "Bathrooms", field_type: "number", sort_order: 11 },
    { record_type: "inventory", field_key: "area_sqft", label: "Area (sqft)", field_type: "number", sort_order: 12 },
    {
      record_type: "inventory",
      field_key: "listing_type",
      label: "Listing type",
      field_type: "select",
      options: ["Sale", "Rent"],
      sort_order: 13,
    },
    { record_type: "inventory", field_key: "price", label: "Price", field_type: "currency", sort_order: 14 },
    { record_type: "inventory", field_key: "service_charge", label: "Service charge", field_type: "currency", sort_order: 15 },
    { record_type: "inventory", field_key: "address", label: "Address", field_type: "text", sort_order: 16 },
    { record_type: "inventory", field_key: "community", label: "Community", field_type: "text", sort_order: 17 },
    { record_type: "inventory", field_key: "developer", label: "Developer", field_type: "text", sort_order: 18 },
    {
      record_type: "inventory",
      field_key: "payment_plan",
      label: "Payment plan",
      field_type: "select",
      options: ["Cash", "Mortgage", "Off-plan", "1%", "Custom"],
      sort_order: 19,
    },
    { record_type: "inventory", field_key: "handover_date", label: "Handover date", field_type: "date", sort_order: 20 },
    {
      record_type: "inventory",
      field_key: "view_type",
      label: "View",
      field_type: "select",
      options: ["Sea", "City", "Park", "Burj", "Pool", "Garden", "Other"],
      sort_order: 21,
    },
    /* contact — buyer profile */
    {
      record_type: "contact",
      field_key: "buyer_type",
      label: "Buyer type",
      field_type: "select",
      options: ["Cash", "Finance", "Investor", "End-user"],
      sort_order: 10,
    },
    {
      record_type: "contact",
      field_key: "preferred_areas",
      label: "Preferred areas",
      field_type: "multiselect",
      options: [
        "Downtown",
        "Marina",
        "JVC",
        "Palm Jumeirah",
        "Business Bay",
        "JBR",
        "Arabian Ranches",
        "Emirates Hills",
        "Other",
      ],
      sort_order: 11,
    },
    { record_type: "contact", field_key: "budget_min", label: "Budget min", field_type: "currency", sort_order: 12 },
    { record_type: "contact", field_key: "budget_max", label: "Budget max", field_type: "currency", sort_order: 13 },
    { record_type: "contact", field_key: "nationality", label: "Nationality", field_type: "text", sort_order: 14 },
    {
      record_type: "contact",
      field_key: "lead_source",
      label: "Lead source",
      field_type: "select",
      options: [
        "Property Finder",
        "Bayut",
        "Dubizzle",
        "Referral",
        "Walk-in",
        "Website",
        "Social Media",
        "Other",
      ],
      sort_order: 15,
    },
    /* company — developer / brokerage */
    { record_type: "company", field_key: "license_number", label: "License number", field_type: "text", sort_order: 10 },
    {
      record_type: "company",
      field_key: "developer_type",
      label: "Developer type",
      field_type: "select",
      options: ["Master", "Sub", "Property Mgmt", "Brokerage"],
      sort_order: 11,
    },
    /* deal */
    { record_type: "deal", field_key: "unit_number", label: "Unit number", field_type: "text", sort_order: 10 },
    { record_type: "deal", field_key: "commission_pct", label: "Commission (%)", field_type: "number", sort_order: 11 },
    /* lead */
    { record_type: "lead", field_key: "interested_in", label: "Interested in", field_type: "text", sort_order: 10 },
    {
      record_type: "lead",
      field_key: "urgency",
      label: "Urgency",
      field_type: "select",
      options: ["Immediate", "1-3 months", "3-6 months", "Just looking"],
      sort_order: 11,
    },
  ],
  tags: [
    { name: "First-time buyer", color: COLORS.sky },
    { name: "Investor", color: COLORS.violet },
    { name: "Off-plan", color: COLORS.amber },
    { name: "Resale", color: COLORS.teal },
    { name: "Commercial", color: COLORS.indigo },
    { name: "Distressed", color: COLORS.rose },
    { name: "VIP", color: COLORS.pink },
    { name: "Cash buyer", color: COLORS.emerald },
  ],
};

export const CRM_TEMPLATES: Record<string, CrmTemplate> = {
  general,
  "real-estate": realEstate,
};

export const DEFAULT_TEMPLATE_ID = "general";

/** List in display order (general first, then verticals). */
export function listTemplates(): CrmTemplate[] {
  return [general, realEstate];
}

/** Resolve a profession id → matching template id, or null if no match. */
export function templateForProfession(profession: string | null): CrmTemplate | null {
  if (!profession) return null;
  const lower = profession.toLowerCase();
  for (const t of listTemplates()) {
    if (t.matchProfessions.some((p) => p.toLowerCase() === lower)) return t;
  }
  return null;
}
