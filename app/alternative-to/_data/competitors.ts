/* Competitor data powering /compare and /alternative-to/[slug].
 *
 * Single source of truth so the comparison table and the SEO landing
 * pages don't drift. Tone: honest. Where Space Field doesn't have parity
 * we say so. Where we have an edge we say what's specifically different,
 * not "the best ever".
 *
 * Used by:
 *   - app/compare/page.tsx           (feature matrix)
 *   - app/alternative-to/[slug]/page.tsx (per-slug pages)
 */

export type FeatureSupport = "yes" | "no" | "partial";

export interface FeatureRow {
  /** Feature label shown in the matrix row. */
  feature: string;
  /** Optional one-line clarifier under the feature label. */
  detail?: string;
  /** Support keyed by competitor slug. "spacefield" is the first column. */
  support: Record<string, FeatureSupport>;
  /** Per-competitor footnote, shown in a tooltip on hover. */
  note?: Record<string, string>;
}

export interface Competitor {
  slug: string;
  /** Display name in the matrix column header and on the alternative page. */
  name: string;
  /** Used in <title> and h1 on /alternative-to/[slug]. */
  shortName: string;
  /** Honest one-line description of what they actually do. */
  positioning: string;
  /** Whether /alternative-to/[slug] is generated for this entry. */
  alternativePage: boolean;
  /** Five-or-so specific reasons people move from this product to Space Field. */
  wins: { title: string; body: string }[];
  /** Two-or-three "you should probably stay with X if..." honest call-outs. */
  honestCallouts: string[];
}

/* ------------------------------------------------------------------ */
/* Competitor catalog                                                  */
/* ------------------------------------------------------------------ */

export const COMPETITORS: Competitor[] = [
  {
    slug: "salesforce",
    name: "Salesforce Sales Cloud",
    shortName: "Salesforce",
    positioning:
      "Enterprise CRM platform with deep customization, AppExchange, and a sales-ops focus.",
    alternativePage: true,
    wins: [
      {
        title: "Set up in an afternoon, not a quarter.",
        body: "Space Field workspaces ship with a Real-Estate or Marketing template — CRM boards, dock, tools, and an AI assistant are configured before your first cup of coffee. No consultant required.",
      },
      {
        title: "One price, every tool included.",
        body: "Sales Cloud + Service Cloud + Marketing Cloud + AppExchange add-ons stack quickly. Space Field is one $9 or $19 seat with 130+ tools and the AI Assistant included.",
      },
      {
        title: "CRM that doesn't feel like database admin.",
        body: "Our CRM has the same boards, pipelines, tasks, and contact records — but the UI is built for a salesperson, not a Salesforce admin. Zero training to land your first deal.",
      },
      {
        title: "AI Assistant baked in, not an upsell.",
        body: "Einstein GPT is a paid add-on. Our AI Assistant ships in every paid seat — drafts emails, summarizes deals, generates listing copy, runs across all your tools.",
      },
      {
        title: "Works offline, syncs when online.",
        body: "Local-first means a flaky 4G signal won't lose your meeting notes. Salesforce Mobile gets brittle the moment you leave a building.",
      },
    ],
    honestCallouts: [
      "If you need 50 custom objects, Apex triggers, and a 200-rep sales floor with regional managers — stay on Salesforce.",
      "Salesforce's AppExchange has thousands of integrations. We have a dozen and counting.",
      "We don't have governance and audit-trail depth at the SOX/HIPAA level yet. Coming.",
    ],
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    shortName: "HubSpot",
    positioning:
      "Inbound marketing + sales hub with strong content marketing and email automation.",
    alternativePage: true,
    wins: [
      {
        title: "More than just sales + marketing.",
        body: "HubSpot makes you stitch a CRM, a marketing hub, a CMS, and ten Zapier flows. Space Field gives you all of that plus tasks, people, files, and 130+ purpose-built tools in one workspace.",
      },
      {
        title: "No contact-tier pricing trap.",
        body: "HubSpot's price jumps as your contact list grows. Space Field charges per seat, not per contact — bring your full database, no penalty.",
      },
      {
        title: "Real-estate-native, not generic SMB.",
        body: "Property valuation, deal scoring, mortgage calculator, poster creator, market pulse — these are real apps in our workspace, not third-party add-ons.",
      },
      {
        title: "An AI Assistant, not just AI features.",
        body: "Our AI runs across every tool — ask it to summarize a deal, draft an offer letter, score a lead, and post a property. HubSpot's AI is per-feature and gated by tier.",
      },
      {
        title: "Templates that actually run your business.",
        body: "Pick the Real Estate or Marketing Agency template and your CRM boards, dock, tools, and tasks appear pre-wired. HubSpot onboarding is a series of empty modules.",
      },
    ],
    honestCallouts: [
      "If your business is inbound content marketing — blog, SEO, landing pages, email nurture — HubSpot's CMS + automation engine is more mature than ours today.",
      "HubSpot Service Hub has more ticketing depth than our help desk.",
      "Their reporting + dashboards library is broader. We cover the basics.",
    ],
  },
  {
    slug: "zoho-one",
    name: "Zoho One",
    shortName: "Zoho One",
    positioning:
      "Bundle of 40+ Zoho apps under one license: CRM, Books, Desk, Mail, Projects, etc.",
    alternativePage: true,
    wins: [
      {
        title: "One product, not 40 disconnected apps.",
        body: "Zoho One is forty different apps that each look and behave differently. Space Field is one workspace with one UI, one dock, one search.",
      },
      {
        title: "Modern UI, not 2013.",
        body: "If you've used Zoho recently you know the UI feels like SaaS from a decade ago. Space Field is a desktop OS in your browser with floating windows and a real dock.",
      },
      {
        title: "AI Assistant is the default, not a feature flag.",
        body: "Zia is good but lives inside specific Zoho apps. Our AI Assistant is a top-level entity that can act across CRM, tasks, files, and tools.",
      },
      {
        title: "Real-estate first.",
        body: "Property valuation, market pulse, poster creator, sales-offer generator — all in the box. Zoho will ask you to install + customize four different apps to get there.",
      },
      {
        title: "Local-first means it's actually fast.",
        body: "Zoho's web apps are server-rendered and feel laggy outside the US. Space Field renders locally — switching tools is instant, no network round-trip.",
      },
    ],
    honestCallouts: [
      "Zoho's breadth (Books, Inventory, Payroll, Recruit, Survey, Sign…) is wider than ours. If you need a full back-office in one bundle, Zoho One wins on coverage.",
      "Zoho's per-seat pricing is hard to beat at scale.",
      "Zoho has been around since 1996 — their stability story is longer than ours.",
    ],
  },
  {
    slug: "notion",
    name: "Notion",
    shortName: "Notion",
    positioning:
      "All-in-one workspace for notes, docs, wikis, and lightweight databases.",
    alternativePage: true,
    wins: [
      {
        title: "Real apps, not databases with formulas.",
        body: "Notion's pattern is 'build it yourself out of a database'. Space Field ships 130+ purpose-built tools — property valuation, mortgage calculator, deal scoring — that already do the work.",
      },
      {
        title: "A CRM that is a CRM.",
        body: "A Notion CRM is a styled database. Ours is a pipeline, deals, contacts, activities, and reports — same depth as a standalone CRM, in your workspace.",
      },
      {
        title: "Multi-window OS, not a single page tree.",
        body: "Drag the mortgage calculator and CRM into split-screen. Pin the AI Assistant. Snap a property poster to one half of the screen. This isn't a Notion workflow.",
      },
      {
        title: "AI that operates, not just drafts.",
        body: "Notion AI rewrites your paragraph. Our AI Assistant generates a property poster, files it in your storage, drafts the listing email, and adds the lead to CRM.",
      },
      {
        title: "Templates that include apps, not just blocks.",
        body: "Our Real Estate template installs eight tools, sets up CRM boards, configures the dock, pre-loads tasks. A Notion template gives you pre-styled pages.",
      },
    ],
    honestCallouts: [
      "If your team's primary need is documentation, wikis, and free-form note-taking — Notion is still the best at that. We have Documents but it's not our flagship.",
      "Notion's database flexibility is unmatched if you genuinely want to model your own data structures.",
      "Notion's editor is more polished than ours for long-form writing.",
    ],
  },
  {
    slug: "monday",
    name: "monday.com",
    shortName: "monday",
    positioning:
      "Visual project management platform with boards, automations, and dashboards.",
    alternativePage: true,
    wins: [
      {
        title: "Tasks + CRM + tools, not just boards.",
        body: "monday gives you colorful boards. Space Field gives you boards plus a CRM, plus 130+ tools, plus an AI Assistant, plus files, plus people — one workspace.",
      },
      {
        title: "No per-board pricing surprise.",
        body: "monday charges by feature tier and seat count. Tasks, CRM, work-docs, dev — separate products. We charge per seat for the lot.",
      },
      {
        title: "Built for actually doing the work.",
        body: "Boards are great for tracking work. Tools are great for doing it. We have both — calculate the ROI in our ROI calculator while updating the deal on the board.",
      },
      {
        title: "An AI Assistant, not AI Blocks.",
        body: "monday AI lives inside columns. Our AI Assistant lives across the whole workspace — it reads your CRM, opens your files, runs tools, drafts emails.",
      },
      {
        title: "Workspace templates that include real apps.",
        body: "Pick a template and you get boards, plus a dock, plus installed tools, plus an AI Assistant tuned for that domain. monday templates are board layouts.",
      },
    ],
    honestCallouts: [
      "If you live and breathe project boards across multiple business units — monday's board flexibility and automations are more mature than ours.",
      "monday's automations builder is broader than our workflow runner today.",
      "monday's dashboards have more widgets than ours.",
    ],
  },
  {
    slug: "clickup",
    name: "ClickUp",
    shortName: "ClickUp",
    positioning:
      "All-in-one productivity platform — tasks, docs, goals, whiteboards, chat.",
    alternativePage: true,
    wins: [
      {
        title: "Doesn't feel like a settings panel.",
        body: "ClickUp's superpower (configurability) is also why every new user spends a week in settings. Space Field opens with a domain template ready to use.",
      },
      {
        title: "Real tools, not just task views.",
        body: "ClickUp views are different ways to look at tasks. Space Field has 130+ purpose-built tools — calculators, generators, dashboards, planners — alongside tasks.",
      },
      {
        title: "AI Assistant that crosses tools.",
        body: "ClickUp AI Brain works inside docs and tasks. Our AI Assistant moves across CRM, files, calendar, tools, and tasks in a single conversation.",
      },
      {
        title: "Desktop OS in your browser.",
        body: "Floating windows, a real dock, multi-workspace switcher. The interaction model is closer to macOS than to a SaaS sidebar.",
      },
      {
        title: "Local-first means it stays fast.",
        body: "ClickUp pages can take a beat to load on large workspaces. We render locally; switching is instant.",
      },
    ],
    honestCallouts: [
      "ClickUp's task-management flexibility (statuses, custom fields, automations, time tracking) is broader than ours.",
      "If you've already invested in a ClickUp workflow, the migration cost is real.",
      "Their whiteboard + mind-map features have no Space Field equivalent.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Comparison matrix                                                    */
/* ------------------------------------------------------------------ */

/** Slugs included as columns in the /compare matrix (in display order). */
export const COMPARE_COLUMN_SLUGS = [
  "spacefield",
  "salesforce",
  "hubspot",
  "zoho-one",
  "notion",
] as const;

export const COMPARE_COLUMN_LABELS: Record<string, string> = {
  spacefield: "Space Field",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  "zoho-one": "Zoho One",
  notion: "Notion",
};

/** Feature matrix. Honest: we mark "no" where we don't have parity. */
export const COMPARE_FEATURES: FeatureRow[] = [
  {
    feature: "CRM with pipelines, contacts, deals",
    support: {
      spacefield: "yes",
      salesforce: "yes",
      hubspot: "yes",
      "zoho-one": "yes",
      notion: "partial",
    },
    note: {
      notion: "Notion CRM is a styled database, not a native CRM.",
    },
  },
  {
    feature: "People / HR (employees, roles, time off)",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "yes",
      notion: "partial",
    },
    note: {
      "zoho-one": "Via Zoho People — separate app.",
    },
  },
  {
    feature: "Tasks + Projects with boards & tags",
    support: {
      spacefield: "yes",
      salesforce: "partial",
      hubspot: "partial",
      "zoho-one": "yes",
      notion: "yes",
    },
    note: {
      "zoho-one": "Via Zoho Projects.",
    },
  },
  {
    feature: "AI Assistant across the whole workspace",
    support: {
      spacefield: "yes",
      salesforce: "partial",
      hubspot: "partial",
      "zoho-one": "partial",
      notion: "partial",
    },
    note: {
      salesforce: "Einstein GPT is a paid add-on.",
      hubspot: "AI features are per-tool and tier-gated.",
      "zoho-one": "Zia is per-app, not workspace-wide.",
      notion: "Notion AI is page-scoped.",
    },
  },
  {
    feature: "Real-estate tools (valuation, posters, deal scoring)",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "no",
      notion: "no",
    },
  },
  {
    feature: "130+ purpose-built tools included",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "partial",
      notion: "no",
    },
    note: {
      "zoho-one": "40+ Zoho apps, each a separate product.",
    },
  },
  {
    feature: "Desktop-OS UI with floating windows",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "no",
      notion: "no",
    },
  },
  {
    feature: "Local-first / works offline",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "no",
      notion: "partial",
    },
    note: {
      notion: "Recent notes cached; new data needs sync.",
    },
  },
  {
    feature: "Multi-workspace (separate apps + dock per workspace)",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "no",
      notion: "partial",
    },
    note: {
      notion: "Notion workspaces share page tree only.",
    },
  },
  {
    feature: "Files + Documents storage",
    support: {
      spacefield: "yes",
      salesforce: "partial",
      hubspot: "yes",
      "zoho-one": "yes",
      notion: "partial",
    },
  },
  {
    feature: "Custom domain / white-label",
    support: {
      spacefield: "yes",
      salesforce: "yes",
      hubspot: "yes",
      "zoho-one": "yes",
      notion: "partial",
    },
    note: {
      notion: "Via Notion Sites for public pages only.",
    },
  },
  {
    feature: "AppExchange / massive integration marketplace",
    support: {
      spacefield: "no",
      salesforce: "yes",
      hubspot: "yes",
      "zoho-one": "partial",
      notion: "yes",
    },
  },
  {
    feature: "Enterprise governance (audit, SSO, role matrices)",
    support: {
      spacefield: "partial",
      salesforce: "yes",
      hubspot: "yes",
      "zoho-one": "yes",
      notion: "yes",
    },
    note: {
      spacefield: "Audit log, SSO and role matrix shipped — SOX-level depth coming.",
    },
  },
  {
    feature: "Per-seat pricing — no per-contact ladder",
    support: {
      spacefield: "yes",
      salesforce: "no",
      hubspot: "no",
      "zoho-one": "yes",
      notion: "yes",
    },
  },
  {
    feature: "Real-time team chat / inbox",
    support: {
      spacefield: "yes",
      salesforce: "partial",
      hubspot: "partial",
      "zoho-one": "yes",
      notion: "no",
    },
    note: {
      "zoho-one": "Via Zoho Cliq.",
    },
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

export function listAlternativeSlugs(): string[] {
  return COMPETITORS.filter((c) => c.alternativePage).map((c) => c.slug);
}
