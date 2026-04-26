export type PropertyType =
  | "ready-apartment"
  | "ready-villa"
  | "offplan"
  | "rental-investment"
  | "commercial";

export type Category = "legal" | "financial" | "physical" | "operational";

export type Priority = "critical" | "important" | "recommended";

export interface ChecklistItem {
  id: string;
  title: string;
  why: string;
  category: Category;
  priority: Priority;
  estimatedDays: number;
}

export const PROPERTY_TYPES: { value: PropertyType; label: string; description: string }[] = [
  {
    value: "ready-apartment",
    label: "Ready Apartment",
    description: "A completed apartment being purchased from the secondary market or developer.",
  },
  {
    value: "ready-villa",
    label: "Ready Villa / Townhouse",
    description: "A completed villa or townhouse with its own title deed.",
  },
  {
    value: "offplan",
    label: "Off-plan",
    description: "Under-construction unit purchased directly from a developer.",
  },
  {
    value: "rental-investment",
    label: "Buy-to-Let Investment",
    description: "Property bought specifically to rent out long- or short-term.",
  },
  {
    value: "commercial",
    label: "Commercial",
    description: "Office, retail, or warehouse space with a commercial license.",
  },
];

// Shared base items
const base: ChecklistItem[] = [
  {
    id: "title-deed",
    title: "Verify title deed with Dubai Land Department (DLD)",
    why: "Confirms the seller is the legal owner and the property has no disputes registered.",
    category: "legal",
    priority: "critical",
    estimatedDays: 1,
  },
  {
    id: "noc",
    title: "Obtain developer NOC before transfer",
    why: "Developer must certify no unpaid service charges or outstanding obligations before DLD transfer.",
    category: "legal",
    priority: "critical",
    estimatedDays: 5,
  },
  {
    id: "mortgage-status",
    title: "Check for existing mortgage or charge on the property",
    why: "If the seller has a mortgage, it must be cleared and released prior to transfer.",
    category: "legal",
    priority: "critical",
    estimatedDays: 2,
  },
  {
    id: "service-charge-history",
    title: "Review 3 years of service charge payment history",
    why: "Reveals the real running cost and any arrears that might transfer to you.",
    category: "financial",
    priority: "important",
    estimatedDays: 2,
  },
  {
    id: "all-fees",
    title: "Calculate total transaction costs (DLD 4%, agency 2%, trustee, NOC)",
    why: "Hidden fees typically add 7–8% on top of the headline price — budget for them.",
    category: "financial",
    priority: "important",
    estimatedDays: 1,
  },
];

const readyInspection: ChecklistItem[] = [
  {
    id: "snag",
    title: "Commission an independent snagging / inspection report",
    why: "Finds defects in AC, plumbing, finishes, and leaks before you commit — leverage for negotiation.",
    category: "physical",
    priority: "recommended",
    estimatedDays: 2,
  },
  {
    id: "view-hours",
    title: "Visit the property at different times of day",
    why: "Morning sun, afternoon noise, and evening traffic can change the experience dramatically.",
    category: "physical",
    priority: "recommended",
    estimatedDays: 2,
  },
  {
    id: "building-age",
    title: "Check building age, developer, and maintenance record",
    why: "Older buildings often mean higher service charges and deferred maintenance.",
    category: "physical",
    priority: "recommended",
    estimatedDays: 1,
  },
  {
    id: "utilities",
    title: "Confirm DEWA, chiller, and gas account status",
    why: "Unpaid utilities can block your move-in and transfer of accounts.",
    category: "operational",
    priority: "recommended",
    estimatedDays: 1,
  },
];

export const CHECKLISTS: Record<PropertyType, ChecklistItem[]> = {
  "ready-apartment": [
    ...base,
    ...readyInspection,
    {
      id: "oa-minutes",
      title: "Review Owners Association minutes and upcoming reserve-fund works",
      why: "Spots planned special assessments (façade, chiller replacement) that will hit future bills.",
      category: "financial",
      priority: "important",
      estimatedDays: 2,
    },
    {
      id: "chiller-type",
      title: "Identify chiller type (centralised, individual, or district)",
      why: "District cooling (Empower, Emicool) is billed separately and can be a major hidden cost.",
      category: "operational",
      priority: "recommended",
      estimatedDays: 1,
    },
  ],

  "ready-villa": [
    ...base,
    ...readyInspection,
    {
      id: "land-use",
      title: "Verify plot size, land use, and community building rules",
      why: "Extensions, pools, and modifications may require community and municipality approvals.",
      category: "legal",
      priority: "important",
      estimatedDays: 3,
    },
    {
      id: "structural",
      title: "Inspect structure, roof, and waterproofing",
      why: "Villa repairs are the owner's problem — a roof or leak issue can cost six figures to fix.",
      category: "physical",
      priority: "recommended",
      estimatedDays: 2,
    },
    {
      id: "sewage-septic",
      title: "Confirm mains sewage vs septic tank",
      why: "Septic tanks mean recurring maintenance costs and potential community restrictions.",
      category: "operational",
      priority: "recommended",
      estimatedDays: 1,
    },
  ],

  offplan: [
    {
      id: "escrow",
      title: "Confirm project is registered with RERA and funds go to an escrow account",
      why: "RERA escrow is the only thing protecting your deposit if the developer defaults.",
      category: "legal",
      priority: "critical",
      estimatedDays: 1,
    },
    {
      id: "spa-clauses",
      title: "Review SPA for delay penalties, handover specs, and exit clauses",
      why: "Most disputes with developers are written into clauses buyers never read carefully.",
      category: "legal",
      priority: "critical",
      estimatedDays: 3,
    },
    {
      id: "developer-track",
      title: "Verify developer's delivery history and financial health",
      why: "Past delays and cancellations are the strongest predictor of future ones.",
      category: "legal",
      priority: "important",
      estimatedDays: 2,
    },
    {
      id: "payment-plan",
      title: "Map the full payment plan against your cash flow",
      why: "Construction-linked payments can squeeze you if other income changes mid-project.",
      category: "financial",
      priority: "important",
      estimatedDays: 1,
    },
    {
      id: "rera-progress",
      title: "Check RERA construction progress report",
      why: "Independent verification of how complete the project actually is — not the marketing version.",
      category: "financial",
      priority: "important",
      estimatedDays: 1,
    },
    {
      id: "handover-reality",
      title: "Inspect a built-out comparable or previous phase of the same project",
      why: "Renders rarely match reality — see the developer's actual finish quality in person.",
      category: "physical",
      priority: "recommended",
      estimatedDays: 2,
    },
    {
      id: "snag-handover",
      title: "Budget for professional snagging at handover",
      why: "Developers fix snags free during the defect-liability period — but only if you list them fast.",
      category: "physical",
      priority: "recommended",
      estimatedDays: 1,
    },
    {
      id: "oqood",
      title: "Confirm Oqood (interim registration) is issued in your name",
      why: "Without Oqood, your off-plan interest is not legally recorded with DLD.",
      category: "legal",
      priority: "critical",
      estimatedDays: 3,
    },
  ],

  "rental-investment": [
    ...base,
    {
      id: "existing-tenant",
      title: "Check if a tenant is in place and review the existing tenancy contract",
      why: "Ejari-registered tenants have strong rights — you may inherit the rent and terms.",
      category: "legal",
      priority: "critical",
      estimatedDays: 2,
    },
    {
      id: "market-rent",
      title: "Validate rent against RERA rental index and 3 recent Ejari contracts",
      why: "Listed rent is marketing — actual achievable rent is what matters for yield.",
      category: "financial",
      priority: "important",
      estimatedDays: 2,
    },
    {
      id: "furnishing",
      title: "Decide furnished vs unfurnished strategy and cost it out",
      why: "Furnished can boost rent 10–20% but adds capex, wear-and-tear, and turnover.",
      category: "financial",
      priority: "important",
      estimatedDays: 1,
    },
    {
      id: "short-term",
      title: "Confirm community and building rules on short-term / holiday lets",
      why: "Some towers and communities ban DTCM short-term leasing regardless of your license.",
      category: "legal",
      priority: "important",
      estimatedDays: 2,
    },
    {
      id: "tenant-risk",
      title: "Budget for vacancy (6–8 weeks/year) and turnover costs",
      why: "100% occupancy is a marketing number, not reality — plan for the gap.",
      category: "financial",
      priority: "important",
      estimatedDays: 1,
    },
    {
      id: "property-mgmt",
      title: "Decide self-manage vs property management (8–10% of rent)",
      why: "Outsourcing is the difference between passive income and a second job.",
      category: "operational",
      priority: "recommended",
      estimatedDays: 1,
    },
  ],

  commercial: [
    {
      id: "zoning",
      title: "Verify zoning, permitted use, and municipality licence alignment",
      why: "A commercial unit must match the tenant's trade licence — wrong zoning kills the deal.",
      category: "legal",
      priority: "critical",
      estimatedDays: 3,
    },
    {
      id: "ejari-commercial",
      title: "Check existing Ejari and lease terms (remaining years, escalations)",
      why: "Commercial tenants often lock in long leases — favourable or punitive to you as new owner.",
      category: "legal",
      priority: "critical",
      estimatedDays: 2,
    },
    {
      id: "fit-out",
      title: "Assess fit-out condition and who owns the improvements",
      why: "Tenant improvements may be removable at lease end — you could inherit a shell.",
      category: "physical",
      priority: "recommended",
      estimatedDays: 1,
    },
    {
      id: "parking",
      title: "Confirm allocated parking bays and visitor access",
      why: "Retail and office tenants will walk if parking is inadequate.",
      category: "physical",
      priority: "recommended",
      estimatedDays: 1,
    },
    {
      id: "service-charge-commercial",
      title: "Benchmark service charges against other commercial units in the building",
      why: "Commercial service charges often exceed AED 50/sqft — materially affects net yield.",
      category: "financial",
      priority: "important",
      estimatedDays: 2,
    },
    {
      id: "vat-fee",
      title: "Confirm VAT treatment on rent and purchase",
      why: "5% VAT on commercial rent changes the effective yield calculation — must be modelled.",
      category: "financial",
      priority: "important",
      estimatedDays: 1,
    },
    {
      id: "exit-liquidity",
      title: "Review comparable commercial sales in the last 12 months",
      why: "Commercial resale is far less liquid than residential — thin market = big discount at exit.",
      category: "operational",
      priority: "recommended",
      estimatedDays: 3,
    },
  ],
};

export const CATEGORY_META: Record<Category, { label: string; description: string }> = {
  legal: {
    label: "Legal",
    description: "Title, contracts, and regulatory compliance.",
  },
  financial: {
    label: "Financial",
    description: "True cost of ownership and deal economics.",
  },
  physical: {
    label: "Physical",
    description: "Condition of the asset and construction risk.",
  },
  operational: {
    label: "Operational",
    description: "Living, running, or renting out the property day-to-day.",
  },
};
