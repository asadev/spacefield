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

export const SEED_TEMPLATES: SeedTemplate[] = [
  realEstate,
  marketingAgency,
  coworking,
];

export function findSeedTemplate(slug: string): SeedTemplate | undefined {
  return SEED_TEMPLATES.find((t) => t.slug === slug);
}
