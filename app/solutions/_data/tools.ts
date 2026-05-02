// Cross-industry tool catalog for the /solutions section.
// Distinct from the real-estate tools — these are general-purpose business
// utilities meant for any operator, owner, or team.
//
// This list is the source of truth for the grid + per-tool routes. Each
// entry MUST have a matching app/solutions/tools/<slug>/page.tsx.

export type SolutionCategoryKey =
  | "productivity"
  | "finance"
  | "hr"
  | "marketing"
  | "sales"
  | "legal"
  | "data"
  | "design"
  | "support"
  | "growth"
  | "content"
  | "crm";

export interface SolutionCategory {
  key: SolutionCategoryKey;
  label: string;
  tagline: string;
}

export interface SolutionTool {
  slug: string;
  title: string;
  description: string;
  category: SolutionCategoryKey;
  // Team-enabled tools support shared state via /solutions/workspaces.
  // Undefined / false = personal-only (localStorage).
  teamEnabled?: boolean;
}

export const SOLUTION_CATEGORIES: SolutionCategory[] = [
  {
    key: "productivity",
    label: "Productivity",
    tagline: "Plan time, estimate work, coordinate people.",
  },
  {
    key: "finance",
    label: "Finance",
    tagline: "Run the numbers before the numbers run you.",
  },
  {
    key: "hr",
    label: "HR & People",
    tagline: "Headcount, hiring, retention — quantified.",
  },
  {
    key: "marketing",
    label: "Marketing",
    tagline: "Acquisition math, funnels, and rigorous testing.",
  },
  {
    key: "sales",
    label: "Sales",
    tagline: "Pipeline, forecasts, comp plans — the math behind quota.",
  },
  {
    key: "legal",
    label: "Legal & Compliance",
    tagline: "Boilerplate you can actually send.",
  },
  {
    key: "data",
    label: "Data & Developer",
    tagline: "Codeless utilities for everyday workflows.",
  },
  {
    key: "design",
    label: "Design & Creative",
    tagline: "Palettes, contrast, type — small tools with strong taste.",
  },
  {
    key: "support",
    label: "Support & Ops",
    tagline: "SLAs, on-call, runbooks — keep the lights on.",
  },
  {
    key: "growth",
    label: "Growth & Strategy",
    tagline: "Pricing, positioning, north-star metrics for real growth.",
  },
  {
    key: "content",
    label: "Writing & Content",
    tagline: "Readability, SEO, drafting — copy that ships.",
  },
  {
    key: "crm",
    label: "CRM & Sales Ops",
    tagline: "Contacts, pipelines, templates — the sales cycle, end to end.",
  },
];

export const SOLUTION_TOOLS: SolutionTool[] = [
  // Productivity
  {
    slug: "project-estimator",
    title: "Project Estimator",
    description:
      "Break work into tasks, apply hour estimates and rates, buffer for risk — get a defensible quote.",
    category: "productivity",
  },

  // Finance
  {
    slug: "break-even",
    title: "Break-even Analysis",
    description:
      "Plug in fixed costs, variable costs, and price. Know exactly how many units you need to sell to stop losing money.",
    category: "finance",
  },
  {
    slug: "salary-hourly",
    title: "Salary to Hourly Converter",
    description:
      "Convert between annual salary, monthly pay, and hourly rate. Accounts for vacation days and hours worked per week.",
    category: "finance",
  },

  // HR
  {
    slug: "cost-per-hire",
    title: "Cost-per-Hire Calculator",
    description:
      "Sum internal + external hiring costs divided by hires. Benchmark your recruitment spend honestly.",
    category: "hr",
  },
  {
    slug: "turnover-rate",
    title: "Employee Turnover Rate",
    description:
      "Compute annualized turnover rate and annual cost of churn based on average tenure and replacement cost.",
    category: "hr",
  },

  // Marketing
  {
    slug: "cac-ltv",
    title: "CAC / LTV Calculator",
    description:
      "Customer acquisition cost, lifetime value, payback period, and the LTV:CAC ratio that tells you if you have a business.",
    category: "marketing",
  },
  {
    slug: "ab-test-sample-size",
    title: "A/B Test Sample Size",
    description:
      "Calculate required sample size per variant for a given baseline rate, minimum detectable effect, and confidence.",
    category: "marketing",
  },

  // Legal / Compliance
  {
    slug: "invoice-generator",
    title: "Invoice Generator",
    description:
      "Fill a form, preview the invoice, print or save as PDF via the browser. No accounts, no watermarks.",
    category: "legal",
  },

  // Data / Developer
  {
    slug: "json-formatter",
    title: "JSON Formatter & Validator",
    description:
      "Pretty-print, minify, and validate JSON. Identifies the exact line and column of any syntax error.",
    category: "data",
  },

  // Marketing + Sales expansion
  {
    slug: "email-roi",
    title: "Email Campaign ROI",
    description:
      "Project revenue, profit, and ROI from a single email send. Tune list size, open / click / conversion rates, AOV, and send cost.",
    category: "marketing",
  },
  {
    slug: "keyword-difficulty",
    title: "Keyword Difficulty Estimator",
    description:
      "Score a target keyword 0-100 using competitor DR, content length, backlinks, and intent match. Tells you go / hard / skip.",
    category: "marketing",
  },
  {
    slug: "engagement-rate",
    title: "Social Engagement Rate",
    description:
      "Platform-aware engagement rate for IG, X, LinkedIn, TikTok, and YouTube — with 2026 benchmarks baked in.",
    category: "marketing",
  },
  {
    slug: "ad-budget-allocator",
    title: "Ad Budget Allocator",
    description:
      "Distribute a paid budget across Google, Meta, LinkedIn, TikTok, and YouTube by marginal conversions. Proposed splits with a bar chart.",
    category: "marketing",
  },
  {
    slug: "influencer-roi",
    title: "Influencer ROI Calculator",
    description:
      "Model reach, clicks, conversions, and revenue for an influencer deal. CPM, cost-per-engagement, and a sensitivity table.",
    category: "marketing",
  },
  {
    slug: "pipeline-forecast",
    title: "Pipeline Forecast",
    description:
      "Weight deals by stage probability and expected close date. Monthly weighted forecast, unweighted pipeline, and edit-in-place deal list.",
    category: "sales",
  },
  {
    slug: "commission-calc",
    title: "Commission Calculator",
    description:
      "Tiered commission, SPIFs, and accelerators. Presets for SaaS ramp, enterprise AE, and BDR. Effective rate + payout breakdown.",
    category: "sales",
  },
  {
    slug: "lead-scoring-rubric",
    title: "Lead Scoring Rubric",
    description:
      "Build a weighted rubric across firmographic + behavioral attributes. Score a lead 0-100 and label it hot / warm / cold. Export as JSON.",
    category: "sales",
  },
  {
    slug: "quote-builder",
    title: "Sales Quote Builder",
    description:
      "Line-item quotes with discounts, expiration, and terms. Save named quotes in-browser. Print or save as PDF.",
    category: "sales",
  },

  // Productivity & Operations (extended)
  {
    slug: "eisenhower-matrix",
    title: "Eisenhower Matrix",
    description:
      "Score tasks on urgency and importance. Auto-sort into Do, Schedule, Delegate, Drop. Saves to your browser.",
    category: "productivity",
  },
  {
    slug: "sop-builder",
    title: "SOP Builder",
    description:
      "Write standard operating procedures with steps, owners, rollback plans, and success criteria. Copy as markdown or print.",
    category: "productivity",
  },
  {
    slug: "okr-tracker",
    title: "OKR Tracker",
    description:
      "Track objectives and key results by quarter. Auto-computes progress against targets. Exports to JSON.",
    category: "productivity",
  },
  {
    slug: "timesheet-summarizer",
    title: "Timesheet Summarizer",
    description:
      "Paste CSV or enter entries. Get totals by project, day, and week, plus utilization % and overtime flags. Stays in your browser.",
    category: "productivity",
  },
  {
    slug: "scrum-velocity",
    title: "Scrum Velocity Tracker",
    description:
      "Enter past sprints to compute average velocity, variance, trend, and a predicted range for your next sprint.",
    category: "productivity",
  },
  {
    slug: "planning-poker",
    title: "Planning Poker Estimator",
    description:
      "Collect Fibonacci estimates from up to 8 team members. Computes consensus, spread, and flags stories that need discussion.",
    category: "productivity",
  },

  // Legal / Compliance (expansion)
  {
    slug: "nda-generator",
    title: "NDA Generator",
    description:
      "Generate a printable mutual or one-way NDA for up to 3 parties. Pick the jurisdiction, term, and effective date — the boilerplate reads like a human wrote it.",
    category: "legal",
  },
  {
    slug: "contract-risk-checker",
    title: "Contract Risk Checker",
    description:
      "Paste a contract and get a quick scan for risky clauses — unlimited liability, auto-renewal, broad indemnification, perpetual licenses, and more. Runs locally.",
    category: "legal",
  },
  {
    slug: "consent-form-generator",
    title: "GDPR Consent Form Generator",
    description:
      "Build a compliant consent form: controller, purpose, data categories, legal basis, retention, transfers. Copy or print.",
    category: "legal",
  },
  {
    slug: "termination-letter-generator",
    title: "Termination Letter Generator",
    description:
      "Draft an employment termination letter with severance, benefits end date, and return-property reminders. Tone variants for formal, compassionate, or direct.",
    category: "legal",
  },

  // Data & Developer (expansion)
  {
    slug: "csv-json-converter",
    title: "CSV ↔ JSON Converter",
    description:
      "Paste CSV or JSON and convert to the other. Configurable delimiter, header detection, escaping, and row count — runs entirely in your browser.",
    category: "data",
  },
  {
    slug: "regex-tester",
    title: "Regex Tester",
    description:
      "Pattern + flags with live match highlighting, capture groups table, and replacement preview. Recent expressions saved in your browser.",
    category: "data",
  },
  {
    slug: "id-generator",
    title: "ID Generator",
    description:
      "Generate UUID v4, nanoid (6-32 chars), slugs, and short ULIDs. Batch 1-100 at a time with one-click copy.",
    category: "data",
  },

  // Design & Creative
  {
    slug: "color-palette-extractor",
    title: "Color Palette Extractor",
    description:
      "Upload an image and extract 3-16 dominant colors via k-means. Export as CSS variables, Tailwind config, or JSON. Runs on canvas, client-side.",
    category: "design",
  },
  {
    slug: "contrast-checker",
    title: "Contrast Checker",
    description:
      "WCAG AA / AAA contrast ratio for normal text, large text, and UI components. Live sample preview and a lightness slider to find the nearest passing shade.",
    category: "design",
  },
  {
    slug: "font-pairing",
    title: "Font Pairing",
    description:
      "Pick a heading font from 30 curated Google Fonts and get 3-5 body pairings with reasoning. Live preview plus copy-ready <link> + CSS.",
    category: "design",
  },

  // HR & People (expansion)
  {
    slug: "compa-ratio",
    title: "Compa-Ratio Calculator",
    description:
      "Compare salaries against market midpoint. Single-employee view plus bulk CSV for distribution analysis and band placement.",
    category: "hr",
  },
  {
    slug: "pto-accrual",
    title: "PTO Accrual Tracker",
    description:
      "Project PTO, sick, and personal leave balances. See year-end totals, cap-hit date, and forfeiture risk across multiple balance types.",
    category: "hr",
  },
  {
    slug: "360-review-template",
    title: "360 Review Template",
    description:
      "Printable 360 review forms with behavioral-anchored rating scales and relationship-specific prompts. Copy as markdown or print.",
    category: "hr",
  },
  {
    slug: "onboarding-checklist",
    title: "Onboarding Checklist",
    description:
      "Role-based onboarding plans grouped into Day 0, Week 1, Month 1, Quarter 1. Progress tracking, markdown and CSV export.",
    category: "hr",
  },
  {
    slug: "salary-benchmark",
    title: "Salary Benchmark",
    description:
      "Compare role salaries across US, UK, UAE, and EU markets. Illustrative midpoints for 10 common tech and business roles.",
    category: "hr",
  },

  // Finance (expansion)
  {
    slug: "savings-goal-planner",
    title: "Savings Goal Planner",
    description:
      "Project how long it takes to hit a savings target given starting balance, monthly contributions, and expected return — with a contributions-vs-interest chart.",
    category: "finance",
  },
  {
    slug: "debt-payoff",
    title: "Debt Payoff — Snowball vs Avalanche",
    description:
      "Line up all your debts and compare snowball vs avalanche strategies. Payoff dates, total interest, and interest saved side-by-side.",
    category: "finance",
  },
  {
    slug: "tax-bracket-calculator",
    title: "US Federal Tax Brackets (2025)",
    description:
      "2025 IRS brackets for single, MFJ, MFS, and HOH. See marginal rate, effective rate, and per-bracket tax — not for filing, just for planning.",
    category: "finance",
  },
  {
    slug: "mortgage-refi",
    title: "Mortgage Refinance Calculator",
    description:
      "Current loan vs refinance offer: new payment, monthly savings, break-even months, lifetime savings, and a should-you-do-it verdict.",
    category: "finance",
  },
  {
    slug: "npv-irr",
    title: "NPV & IRR Calculator",
    description:
      "DCF calculator with NPV at a hurdle rate, IRR via Newton's method, payback period, and profitability index. Add or remove years of cash flow.",
    category: "finance",
  },
  {
    slug: "cash-burn-runway",
    title: "Cash Burn & Runway",
    description:
      "Net burn, runway in months, zero-cash date, and a 24-month cash curve with revenue-growth scenarios. The startup survival dashboard.",
    category: "finance",
  },
  {
    slug: "gross-to-net-salary",
    title: "Gross-to-Net Salary",
    description:
      "Estimate take-home pay across US, UK, UAE, and Spain. Breakdown by tax type with per-country assumptions — simplified but honest.",
    category: "finance",
  },
  {
    slug: "crypto-pnl-tracker",
    title: "Crypto P/L Tracker (FIFO)",
    description:
      "Log buys and sells, enter current prices, get realized + unrealized P/L per symbol using FIFO cost basis. No API calls, data stays in-browser.",
    category: "finance",
  },

  // Team-aware dashboards (workspace-backed)
  {
    slug: "okr-dashboard",
    title: "OKR Dashboard",
    description:
      "Team-aware OKR tracker. Objectives, key results, quarterly progress, and a per-KR update log. Personal mode stays in your browser; team mode syncs across the workspace.",
    category: "productivity",
    teamEnabled: true,
  },
  {
    slug: "pipeline-dashboard",
    title: "Pipeline Dashboard",
    description:
      "Team-aware weighted sales pipeline. Deal ownership, stage filters, monthly weighted forecast. Personal mode is local; team mode shares deals across the workspace.",
    category: "sales",
    teamEnabled: true,
  },
  {
    slug: "metrics-dashboard",
    title: "Metrics Dashboard",
    description:
      "Team-aware KPI tracker. Define up to 12 metrics with targets, log values over time, sparklines per metric, alerts for 3+ periods off-target. Shared in team mode.",
    category: "data",
    teamEnabled: true,
  },

  // Support & Ops
  {
    slug: "sla-calculator",
    title: "SLA Calculator",
    description:
      "Service level math. Pick an uptime target and a measurement window — see allowed downtime, or enter actual downtime and find out if you breached.",
    category: "support",
  },
  {
    slug: "incident-postmortem-template",
    title: "Incident Postmortem Template",
    description:
      "Structured PIR generator. Severity, timeline, impact, root cause, action items, lessons — exports as markdown or prints for the all-hands.",
    category: "support",
  },
  {
    slug: "ticket-backlog-tracker",
    title: "Ticket Backlog Tracker",
    description:
      "Quick pipeline visibility for support tickets. P0–P3, status, assignee, age. Flags stale tickets by priority. Shared in team mode — not a full bug tracker.",
    category: "support",
    teamEnabled: true,
  },
  {
    slug: "mean-time-to-resolution",
    title: "Mean Time to Resolution",
    description:
      "Paste an incident CSV. Computes MTTR per severity, MTBF, incident frequency, month-over-month trend, and outliers.",
    category: "support",
  },
  {
    slug: "status-page-generator",
    title: "Status Page Generator",
    description:
      "Build a branded status page. Service states, uptime %, recent incidents — exports as a self-contained HTML file you can host anywhere.",
    category: "support",
  },
  {
    slug: "runbook-builder",
    title: "Runbook Builder",
    description:
      "Structured incident runbooks. Trigger, check steps, mitigation, escalation path, rollback, acceptance. Templates for database failover, restarts, payment outages.",
    category: "support",
  },
  {
    slug: "capacity-planner",
    title: "Capacity Planner",
    description:
      "Infra capacity math. Current load, monthly growth, headroom target — get projected load at 3/6/12 months and the timeline to your ceiling.",
    category: "support",
  },
  {
    slug: "uptime-cost-calculator",
    title: "Uptime Cost Calculator",
    description:
      "Cost-of-downtime estimator. Revenue-per-minute, affected users, surge cost, reputational multiplier. Compare annual cost at current SLA vs the next tier up.",
    category: "support",
  },
  {
    slug: "kpi-dashboard",
    title: "Support KPI Dashboard",
    description:
      "Track first-response time, resolution time, CSAT, NPS, volume, backlog. Sparklines, targets, red/green flags. Shared metric history in team mode.",
    category: "support",
    teamEnabled: true,
  },
  {
    slug: "escalation-matrix",
    title: "Escalation Matrix",
    description:
      "Role-based escalation builder. Per-severity notification lists with timing. Clear matrix showing who gets paged when — print-ready for the war room wall.",
    category: "support",
  },
  {
    slug: "support-volume-forecaster",
    title: "Support Volume Forecaster",
    description:
      "12-week ticket volume forecast from historical data + growth rate + event multipliers. Computes required agent headcount and staffing gap.",
    category: "support",
  },

  // Finance (advanced)
  {
    slug: "runway-scenarios",
    title: "Runway Scenarios",
    description:
      "Three-scenario cash model — base / best / worst. Months of runway per scenario, a cash-curve chart, and a cost-cut decision trigger.",
    category: "finance",
  },
  {
    slug: "venture-dilution-modeler",
    title: "Venture Dilution Modeler",
    description:
      "Post-round cap table with pre- or post-money option pool. Per-shareholder dilution, price per share, and the pool-shuffle effect.",
    category: "finance",
  },
  {
    slug: "discounted-cash-flow",
    title: "Discounted Cash Flow (DCF)",
    description:
      "5-year DCF with terminal value, PV by year, equity value, per-share value, and a WACC × terminal growth sensitivity grid.",
    category: "finance",
  },
  {
    slug: "subscription-ltv-advanced",
    title: "Advanced Subscription LTV",
    description:
      "Discounted LTV over 60 months with expansion, contraction, churn, margin, and annual discount. Contribution by year plus churn sensitivity.",
    category: "finance",
  },

  // Growth & Strategy
  {
    slug: "pricing-calculator",
    title: "Pricing Calculator",
    description:
      "Design 3–5 pricing tiers with feature checkboxes, monthly + annual rates, and a live comparison matrix. Export as HTML embed or JSON. Team-shared.",
    category: "growth",
    teamEnabled: true,
  },
  {
    slug: "north-star-metric-builder",
    title: "North Star Metric Builder",
    description:
      "Define one north-star metric with input drivers. Set weekly targets, log actuals, compute variance, trend, and correlation with revenue.",
    category: "growth",
  },
  {
    slug: "positioning-canvas",
    title: "Positioning Canvas",
    description:
      "April Dunford-style positioning builder. Six fields generate a positioning statement and tagline. Export markdown, print-ready canvas.",
    category: "growth",
  },
  {
    slug: "growth-experiment-tracker",
    title: "Growth Experiment Tracker",
    description:
      "ICE-prioritized experiment backlog. Hypotheses, impact/confidence/ease scoring, status, results, and learnings. Sorted by ICE. Team-shared.",
    category: "growth",
    teamEnabled: true,
  },

  // Data & Developer (wave-3 expansion)
  {
    slug: "markdown-preview",
    title: "Markdown Preview",
    description:
      "Live split-pane markdown editor. GFM tables, checkboxes, strikethrough, code blocks. Copy HTML, download .md, autosaves locally.",
    category: "data",
  },
  {
    slug: "cron-expression-parser",
    title: "Cron Expression Parser",
    description:
      "Parse 5- or 6-field cron, translate to English, and see the next 5 runs in your timezone. Common-pattern presets built in.",
    category: "data",
  },

  // Writing & Content
  {
    slug: "readability-score",
    title: "Readability Score",
    description:
      "Flesch Reading Ease, Flesch-Kincaid, Gunning Fog, SMOG, ARI, Dale-Chall. Highlights long sentences, complex words, and passive voice.",
    category: "content",
  },
  {
    slug: "word-count",
    title: "Word Count",
    description:
      "Real-time character, word, sentence, and paragraph counts. Reading and speaking time. Keyword density top 20 with export.",
    category: "content",
  },
  {
    slug: "seo-meta-tags",
    title: "SEO Meta Tags",
    description:
      "Generate clean HTML meta tags with Google SERP + Twitter card previews. Warns when title or description exceed recommended length.",
    category: "content",
  },
  {
    slug: "headline-analyzer",
    title: "Headline Analyzer",
    description:
      "Score a headline 0-100 across length, power/emotional words, sentiment, specificity, and numbers. Gives concrete improvement suggestions.",
    category: "content",
  },
  {
    slug: "content-brief-builder",
    title: "Content Brief Builder",
    description:
      "Generate a writer-ready brief: title options, H2/H3 outline with word targets per section, meta description draft, markdown export.",
    category: "content",
  },

  // CRM & Sales Ops
  {
    slug: "deal-pipeline-board",
    title: "Deal Pipeline Board",
    description:
      "Kanban sales pipeline across Prospecting → Qualified → Proposal → Negotiation → Closed. Drag to move stage, totals per column. Team-shared.",
    category: "crm",
    teamEnabled: true,
  },
  {
    slug: "sales-call-script-builder",
    title: "Sales Call Script Builder",
    description:
      "Structured scripts for discovery, demo, objection handling, and closing calls. Opener, agenda, qualifying questions, value props, next steps. Export markdown.",
    category: "crm",
  },
  {
    slug: "meddpicc-scorecard",
    title: "MEDDPICC Scorecard",
    description:
      "Qualify enterprise deals across Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Pain, Champion, Competition. 0-5 ratings, verdict, export.",
    category: "crm",
  },
  {
    slug: "bant-qualifier",
    title: "BANT Qualifier",
    description:
      "Quick Budget / Authority / Need / Timeline scorecard for inbound leads. Log multiple leads, get a qualified / nurture / disqualified verdict.",
    category: "crm",
  },
  {
    slug: "proposal-generator",
    title: "Proposal Generator",
    description:
      "Build a sales proposal with cover, problem, solution, phases, investment line items, next steps, terms. Templates for consulting, SaaS, services. Print-ready.",
    category: "crm",
  },
  {
    slug: "win-loss-analyzer",
    title: "Win/Loss Analyzer",
    description:
      "Structured win/loss reviews per deal: outcome, primary reason, buyer quotes, lessons learned. Rollup of win rate by segment and top loss reasons.",
    category: "crm",
  },
  {
    slug: "sdr-cadence-builder",
    title: "SDR Cadence Builder",
    description:
      "Multi-touch outbound sequence designer across email, call, LinkedIn, and video. Visual timeline, preset variants for enterprise, SMB, inbound follow-up.",
    category: "crm",
  },
  {
    slug: "churn-risk-calculator",
    title: "Churn Risk Calculator",
    description:
      "Score customer accounts on usage trend, support volume, NPS, renewal proximity, sponsor changes, and payment issues. 0-100 risk with recommended action.",
    category: "crm",
  },
  {
    slug: "commission-statement",
    title: "Commission Statement",
    description:
      "Per-rep commission statement with deals, SPIFs, and clawbacks. Period quota, attainment, YTD running totals. Matches typical AE comp plan format. Print-ready.",
    category: "crm",
  },
];

export function getTool(slug: string): SolutionTool | undefined {
  return SOLUTION_TOOLS.find((t) => t.slug === slug);
}

export function getToolsByCategory(key: SolutionCategoryKey): SolutionTool[] {
  return SOLUTION_TOOLS.filter((t) => t.category === key);
}
