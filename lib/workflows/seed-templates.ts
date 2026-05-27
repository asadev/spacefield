/**
 * Industry workspace template seed data.
 *
 * Each template lists rows keyed by destination table. The SQL
 * `apply_workspace_template` RPC inserts them in the order given (JSONB
 * preserves key order) and resolves cross-row references by NAME — so
 * `crm_deals.pipeline_name` looks up the freshly-inserted pipeline.
 *
 * The bodies live in TypeScript (not the migration) so we can tweak
 * copy without writing a new migration each time. The admin /admin/
 * templates page reads from here and patches the row in
 * `workspace_templates.body` before calling the RPC.
 */

export interface TemplateBody {
  summary: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}

export interface SeedTemplate {
  slug: string;
  name: string;
  industry: string;
  description: string;
  icon: string;
  body: TemplateBody;
}

/* ─────────────────────── Real Estate Brokerage ─────────────────────── */
const realEstate: SeedTemplate = {
  slug: "real-estate-brokerage",
  name: "Real Estate Brokerage",
  industry: "real_estate",
  description:
    "Sales pipeline, lead intake, property poster templates, and three sample listings to demo the CRM.",
  icon: "home",
  body: {
    summary:
      "Pipeline: New → Qualified → Viewing → Offer → Closed Won/Lost. Three sample property listings as deals.",
    tables: {
      // Order matters — pipeline must exist before stages/deals.
      crm_pipelines: [
        { name: "Sales Pipeline", is_default: true, position: 0 },
      ],
      crm_pipeline_stages: [
        { pipeline_name: "Sales Pipeline", name: "New Lead", kind: "open", position: 0, probability: 10, color: "#94a3b8" },
        { pipeline_name: "Sales Pipeline", name: "Qualified", kind: "open", position: 1, probability: 30, color: "#60a5fa" },
        { pipeline_name: "Sales Pipeline", name: "Viewing Scheduled", kind: "open", position: 2, probability: 50, color: "#a78bfa" },
        { pipeline_name: "Sales Pipeline", name: "Offer Made", kind: "open", position: 3, probability: 75, color: "#fbbf24" },
        { pipeline_name: "Sales Pipeline", name: "Closed Won", kind: "won", position: 4, probability: 100, color: "#34d399" },
        { pipeline_name: "Sales Pipeline", name: "Closed Lost", kind: "lost", position: 5, probability: 0, color: "#f87171" },
      ],
      crm_companies: [
        { name: "Marina Heights Realty", industry: "real_estate", city: "Dubai", country: "AE", notes: "Off-plan partnership" },
      ],
      crm_contacts: [
        { first_name: "Aisha", last_name: "Hassan", email: "aisha@example.com", phone: "+971-50-000-0001", job_title: "Buyer", notes: "Looking 2BR Marina" },
        { first_name: "Omar", last_name: "Khalid", email: "omar@example.com", phone: "+971-50-000-0002", job_title: "Investor", notes: "ROI focus" },
        { first_name: "Sara", last_name: "Mansour", email: "sara@example.com", phone: "+971-50-000-0003", job_title: "Buyer", notes: "Family villa" },
      ],
      crm_leads: [
        { first_name: "Khalid", last_name: "Al Rashid", email: "khalid.lead@example.com", phone: "+971-50-111-0001", source: "Property Finder", status: "new", notes: "Inquired about Marina 2BR" },
        { first_name: "Layla", last_name: "Najjar", email: "layla.lead@example.com", phone: "+971-50-111-0002", source: "Bayut", status: "working", notes: "Visa in progress, looking JLT" },
      ],
      crm_deals: [
        { pipeline_name: "Sales Pipeline", stage_name: "Qualified", name: "Marina 2BR Apt — Aisha", amount: 1450000, currency: "AED", status: "open" },
        { pipeline_name: "Sales Pipeline", stage_name: "Viewing Scheduled", name: "Downtown Studio — Omar", amount: 980000, currency: "AED", status: "open" },
        { pipeline_name: "Sales Pipeline", stage_name: "Offer Made", name: "JVC Villa — Sara", amount: 3200000, currency: "AED", status: "open" },
      ],
      crm_activities: [
        { kind: "note", subject: "Property Poster Template — Marina 2BR", body: "Standard 1080x1350 poster, AED price, 3 photos, agent badge." },
        { kind: "note", subject: "Property Poster Template — Downtown Studio", body: "Vertical poster, hide price, mention ROI estimate." },
      ],
    },
  },
};

/* ─────────────────────── Marketing Agency ─────────────────────── */
const marketingAgency: SeedTemplate = {
  slug: "marketing-agency",
  name: "Marketing Agency",
  industry: "marketing",
  description:
    "Client pipeline, project kickoff checklist, and a sample retainer project to demo task flow.",
  icon: "megaphone",
  body: {
    summary:
      "Client pipeline (Discovery → Proposal → Retainer) + one sample 'Acme Retainer' project with onboarding tasks.",
    tables: {
      crm_pipelines: [
        { name: "Agency Pipeline", is_default: true, position: 0 },
      ],
      crm_pipeline_stages: [
        { pipeline_name: "Agency Pipeline", name: "Discovery Call", kind: "open", position: 0, probability: 15, color: "#94a3b8" },
        { pipeline_name: "Agency Pipeline", name: "Proposal Sent", kind: "open", position: 1, probability: 40, color: "#60a5fa" },
        { pipeline_name: "Agency Pipeline", name: "Negotiation", kind: "open", position: 2, probability: 65, color: "#a78bfa" },
        { pipeline_name: "Agency Pipeline", name: "Signed Retainer", kind: "won", position: 3, probability: 100, color: "#34d399" },
        { pipeline_name: "Agency Pipeline", name: "Passed", kind: "lost", position: 4, probability: 0, color: "#f87171" },
      ],
      crm_companies: [
        { name: "Acme Coffee Co.", industry: "f&b", city: "Dubai", country: "AE", notes: "12-month retainer, SMM + content" },
        { name: "Northwind Fitness", industry: "fitness", city: "Riyadh", country: "SA", notes: "Discovery stage" },
      ],
      crm_contacts: [
        { first_name: "James", last_name: "Carter", email: "james@acmecoffee.example", phone: "+971-50-200-0001", job_title: "Founder" },
        { first_name: "Mira", last_name: "Salah", email: "mira@northwind.example", phone: "+966-50-200-0002", job_title: "Head of Marketing" },
      ],
      crm_deals: [
        { pipeline_name: "Agency Pipeline", stage_name: "Signed Retainer", name: "Acme Coffee — 12mo retainer", amount: 60000, currency: "USD", status: "won" },
        { pipeline_name: "Agency Pipeline", stage_name: "Discovery Call", name: "Northwind Fitness — discovery", amount: 24000, currency: "USD", status: "open" },
      ],
      projects: [
        { name: "Acme Coffee Retainer", slug: "acme-retainer", description: "12-month SMM + content retainer.", status: "active" },
      ],
      tasks: [
        { project_name: "Acme Coffee Retainer", title: "Kickoff call + access checklist", description: "Confirm logins for IG, Meta Ads, GA4.", status: "In Progress", priority: "high" },
        { project_name: "Acme Coffee Retainer", title: "Brand voice + tone doc (1-pager)", description: "Pull from discovery call notes.", status: "Todo", priority: "high" },
        { project_name: "Acme Coffee Retainer", title: "Content pillar plan (Q1)", description: "Three pillars, 12 posts/mo each.", status: "Todo", priority: "normal" },
        { project_name: "Acme Coffee Retainer", title: "Asset library handover", description: "Drive folder, brand fonts, logo pack.", status: "Todo", priority: "normal" },
      ],
    },
  },
};

/* ─────────────────────── Co-working Space ─────────────────────── */
const coworking: SeedTemplate = {
  slug: "coworking-space",
  name: "Co-working Space",
  industry: "coworking",
  description:
    "Member roster, bookable rooms, and three sample bookings so the day-pass flow works on day one.",
  icon: "building",
  body: {
    summary:
      "Five seed members (employees), three sample 'bookable spaces' captured as activities until a real bookings table exists.",
    tables: {
      // No bookings table yet — we use `employees` for members and
      // `crm_activities` (kind='meeting') for sample bookings so the
      // template lights up real surfaces without requiring schema not
      // yet in main. When booking tables land we update the template.
      employees: [
        { full_name: "Hassan Riaz", email: "hassan@member.example", job_title: "Member — Hot Desk", department: "Members", employment_type: "contractor", status: "active" },
        { full_name: "Yasmin Chen", email: "yasmin@member.example", job_title: "Member — Dedicated Desk", department: "Members", employment_type: "contractor", status: "active" },
        { full_name: "David Park", email: "david@member.example", job_title: "Member — Private Office", department: "Members", employment_type: "contractor", status: "active" },
        { full_name: "Priya Iyer", email: "priya@member.example", job_title: "Member — Day Pass", department: "Members", employment_type: "contractor", status: "active" },
        { full_name: "Carlos Mendes", email: "carlos@member.example", job_title: "Member — Hot Desk", department: "Members", employment_type: "contractor", status: "active" },
      ],
      projects: [
        { name: "Spaces & Bookings", slug: "spaces-bookings", description: "Holds tasks for room maintenance + day-of-booking ops.", status: "active" },
      ],
      tasks: [
        { project_name: "Spaces & Bookings", title: "Meeting Room A — daily cleanup", description: "After 6pm.", status: "Todo", priority: "normal" },
        { project_name: "Spaces & Bookings", title: "Phone Booth #2 — fix flickering bulb", description: "Reported 2026-05-15.", status: "Todo", priority: "high" },
        { project_name: "Spaces & Bookings", title: "Coffee bar restock", description: "Weekly. Order Monday AM.", status: "Todo", priority: "normal" },
      ],
      crm_activities: [
        { kind: "meeting", subject: "Booking — Meeting Room A — Hassan", body: "2026-05-19 10:00–11:00 · 6 ppl · projector requested" },
        { kind: "meeting", subject: "Booking — Phone Booth #1 — Yasmin", body: "2026-05-19 14:00–14:45 · solo call" },
        { kind: "meeting", subject: "Booking — Event Space — David", body: "2026-05-21 18:00–22:00 · launch party · 40 ppl" },
      ],
    },
  },
};

/* ─────────────────────── Clothing & Fashion Retail ─────────────────────── */
//
// 2026-05-27 Agent E — boutique / apparel / fabric / accessories.
// Currency-agnostic, country-agnostic, religion-agnostic. The sample
// data uses generic product names ("Wide-leg trousers", "Silk scarf")
// that work for any clothing business in any locale. NO PKR or AED, NO
// Urdu strings, NO bridal-only framing. Workspaces in any country can
// apply this template and only need to tweak prices.
//
// Pairs naturally with: poster-creator (for product flyers), whatsapp
// (the Send-via-WhatsApp button on each inventory row), crm.
const clothingRetail: SeedTemplate = {
  slug: "clothing-retail",
  name: "Clothing & Fashion Retail",
  industry: "clothing_retail",
  description:
    "Boutique, apparel, fabric, fashion accessories — works for any clothing business, any country, any currency. Sales pipeline + customer tags + inventory categories tuned for fashion retail.",
  icon: "shopping-bag",
  body: {
    summary:
      "Walk-In → Browsing → Tried On → Purchased → Repeat / Lost pipeline. Five sample customers, ten sample inventory items in clothing categories. WhatsApp + Poster Creator are the recommended companion apps.",
    tables: {
      crm_pipelines: [
        { name: "Sales", is_default: true, position: 0 },
      ],
      crm_pipeline_stages: [
        { pipeline_name: "Sales", name: "Walked In",       kind: "open", position: 0, probability: 10, color: "#94a3b8" },
        { pipeline_name: "Sales", name: "Browsing",        kind: "open", position: 1, probability: 25, color: "#60a5fa" },
        { pipeline_name: "Sales", name: "Tried On",        kind: "open", position: 2, probability: 55, color: "#a78bfa" },
        { pipeline_name: "Sales", name: "Purchased",       kind: "won",  position: 3, probability: 100, color: "#34d399" },
        { pipeline_name: "Sales", name: "Repeat Customer", kind: "won",  position: 4, probability: 100, color: "#10b981" },
        { pipeline_name: "Sales", name: "Lost",            kind: "lost", position: 5, probability: 0,   color: "#f87171" },
      ],
      crm_companies: [],
      crm_contacts: [
        { first_name: "Maya",   last_name: "Kim",       email: "maya@example.com",     phone: "+1-555-100-0001", job_title: "Customer", notes: "Walk-in, prefers neutrals" },
        { first_name: "Diego",  last_name: "Rivera",    email: "diego@example.com",    phone: "+1-555-100-0002", job_title: "Customer", notes: "Catalogue buyer" },
        { first_name: "Aiko",   last_name: "Sato",      email: "aiko@example.com",     phone: "+1-555-100-0003", job_title: "Customer", notes: "Bridal inquiry — referred" },
        { first_name: "Noah",   last_name: "Williams",  email: "noah@example.com",     phone: "+1-555-100-0004", job_title: "Customer", notes: "Wholesale prospect" },
        { first_name: "Lina",   last_name: "Hassan",    email: "lina@example.com",     phone: "+1-555-100-0005", job_title: "Customer", notes: "Repeat VIP — quarterly" },
      ],
      crm_leads: [
        { first_name: "River",  last_name: "Patel",     email: "river@example.com",    phone: "+1-555-200-0001", source: "instagram", status: "new",     notes: "DM'd about scarf collection" },
        { first_name: "Sasha",  last_name: "Volkov",    email: "sasha@example.com",    phone: "+1-555-200-0002", source: "whatsapp",  status: "working", notes: "Asked about Eid lookbook" },
      ],
      crm_deals: [
        { pipeline_name: "Sales", stage_name: "Tried On",        name: "Maya — denim jacket + trousers", amount: 240, currency: "USD", status: "open" },
        { pipeline_name: "Sales", stage_name: "Purchased",       name: "Lina — quarterly capsule",        amount: 1200, currency: "USD", status: "won"  },
        { pipeline_name: "Sales", stage_name: "Walked In",       name: "Aiko — bridal consult",           amount: 0,    currency: "USD", status: "open" },
      ],
      crm_activities: [
        { kind: "note", subject: "Style preferences — Maya",   body: "Neutrals, size M, prefers wide-leg cuts, no synthetics." },
        { kind: "note", subject: "Repeat customer playbook",   body: "VIP tier: free hemming, early access to new arrivals, hand-written thank-you card with each order." },
        { kind: "note", subject: "Inventory restock — basics", body: "Reorder cotton tees + linen shirts monthly. Limited drops for the rest." },
      ],
      // Inventory items use the workspace's default currency at apply
      // time (the apply RPC reads from the row). Until the RPC adds
      // inventory support these are no-ops; once it lands the template
      // works end-to-end.
      crm_inventory_items: [
        { sku: "TOP-001", name: "Cotton crew tee",          category: "Casual",     price: 28,  currency: "USD", quantity: 80, unit: "pcs", status: "active", custom: { fabric: "100% cotton",     sizes: "XS, S, M, L, XL", color: "white" } },
        { sku: "TOP-002", name: "Linen button-down shirt",  category: "Casual",     price: 78,  currency: "USD", quantity: 32, unit: "pcs", status: "active", custom: { fabric: "100% linen",      sizes: "S, M, L, XL",     color: "cream" } },
        { sku: "BOT-001", name: "Wide-leg trousers",        category: "Casual",     price: 95,  currency: "USD", quantity: 24, unit: "pcs", status: "active", custom: { fabric: "viscose blend",   sizes: "S, M, L",         color: "olive" } },
        { sku: "OUT-001", name: "Denim jacket",             category: "Casual",     price: 145, currency: "USD", quantity: 18, unit: "pcs", status: "active", custom: { fabric: "13oz denim",      sizes: "S, M, L, XL",     color: "indigo" } },
        { sku: "DRE-001", name: "Wrap midi dress",          category: "Formal",     price: 165, currency: "USD", quantity: 14, unit: "pcs", status: "active", custom: { fabric: "silk-blend",      sizes: "XS, S, M, L",     color: "black" } },
        { sku: "DRE-002", name: "Embroidered evening gown", category: "Bridal",     price: 480, currency: "USD", quantity: 4,  unit: "pcs", status: "active", custom: { fabric: "tulle + sequins", sizes: "S, M, L",         color: "champagne" } },
        { sku: "KID-001", name: "Kids' striped tee (pack of 2)", category: "Kids", price: 32,  currency: "USD", quantity: 40, unit: "pcs", status: "active", custom: { fabric: "cotton",          sizes: "2T, 3T, 4T, 5T",  color: "multi" } },
        { sku: "ACC-001", name: "Silk scarf",               category: "Accessories", price: 65,  currency: "USD", quantity: 36, unit: "pcs", status: "active", custom: { fabric: "100% silk",       sizes: "90cm × 90cm",     color: "rust" } },
        { sku: "ACC-002", name: "Leather tote",             category: "Accessories", price: 220, currency: "USD", quantity: 12, unit: "pcs", status: "active", custom: { material: "full-grain leather", sizes: "one size",   color: "tan" } },
        { sku: "FOO-001", name: "Suede loafers",            category: "Footwear",   price: 180, currency: "USD", quantity: 16, unit: "pcs", status: "active", custom: { material: "suede",         sizes: "6–11 (US)",       color: "camel" } },
      ],
      crm_tags: [
        { name: "VIP",            color: "#fbbf24" },
        { name: "New Customer",   color: "#60a5fa" },
        { name: "Repeat",         color: "#34d399" },
        { name: "Wholesale",      color: "#a78bfa" },
        { name: "Wedding",        color: "#f472b6" },
        { name: "Seasonal",       color: "#fb923c" },
        { name: "Catalogue Buyer", color: "#22d3ee" },
        { name: "Walk-in",        color: "#94a3b8" },
        { name: "Online",         color: "#818cf8" },
        { name: "Referral",       color: "#10b981" },
      ],
      crm_lead_sources: [
        { kind: "form",     name: "Walk-in form",      slug: "walk-in" },
        { kind: "whatsapp", name: "WhatsApp inquiries", slug: "whatsapp" },
        { kind: "form",     name: "Instagram DM",      slug: "instagram" },
        { kind: "form",     name: "Facebook lead",     slug: "facebook" },
        { kind: "form",     name: "Referral",          slug: "referral" },
        { kind: "form",     name: "Online store",      slug: "online-store" },
        { kind: "form",     name: "Market visit",      slug: "market-visit" },
      ],
    },
  },
};

export const SEED_TEMPLATES: SeedTemplate[] = [
  realEstate,
  marketingAgency,
  coworking,
  clothingRetail,
];

/**
 * Apps that pair naturally with each template's industry. The
 * onboarding flow + template picker can render these as one-click
 * "install with template" pills. Slugs match `app/tools/_data/tools-list.ts`.
 *
 * Kept as a parallel map rather than a field on `SeedTemplate` so
 * existing callers (apply_workspace_template, /admin/templates) don't
 * have to learn a new key.
 */
export const TEMPLATE_RECOMMENDED_APPS: Record<string, string[]> = {
  "real-estate-brokerage": ["poster-creator", "crm"],
  "marketing-agency":      ["crm", "social-posts"],
  "coworking-space":       ["crm"],
  "clothing-retail":       ["poster-creator", "whatsapp", "crm"],
};

export function findSeedTemplate(slug: string): SeedTemplate | undefined {
  return SEED_TEMPLATES.find((t) => t.slug === slug);
}
