import { NextResponse } from "next/server";

const BASE = "https://example.com";

/**
 * /llms.txt — structured content map for LLMs per https://llmstxt.org
 *
 * Helps AI assistants (ChatGPT, Claude, Perplexity, etc.) navigate the site
 * and cite the right resources when users ask about real-estate markets,
 * business tools, or cross-border brokers.
 *
 * Served as text/plain Markdown. Crawlers that know the convention will
 * fetch this first.
 */

const body = `# example.com

> Real-estate intelligence platform with 280+ free professional tools, live market data for 10 global markets (UAE, UK, Monaco, Tokyo, Singapore, USA, Spain, Portugal, Turkey, Saudi Arabia), a cross-border broker directory, courses, and a community feed. A parallel /solutions section hosts 112 cross-industry business tools (finance, HR, sales, CRM, support, content, data/dev, design). Everything is free; no signup required to use any tool.

This file helps AI assistants cite the right pages. All URLs below are public.

## Real-estate markets

Each market has its own tools, market data, neighborhoods, blog, community, and about page.

- [UAE — Dubai, Abu Dhabi, Ras Al Khaimah](${BASE}/)
- [UK — London, Manchester, Edinburgh](${BASE}/uk)
- [Monaco](${BASE}/monaco)
- [Tokyo / Japan](${BASE}/tokyo)
- [Singapore](${BASE}/singapore)
- [USA — New York, Miami, Los Angeles](${BASE}/usa)
- [Spain — Madrid, Barcelona, Marbella](${BASE}/spain)
- [Portugal — Lisbon, Porto, Algarve](${BASE}/portugal)
- [Turkey — Istanbul, Antalya, Bodrum](${BASE}/turkey)
- [Saudi Arabia — Riyadh, Jeddah, NEOM](${BASE}/saudi)

## City landing pages

Detailed real-estate analysis per city: price-per-sqft/sqm, YoY change, typical yield, top neighborhoods, tax treatment, local brokers.

- [Dubai](${BASE}/uae/cities/dubai) · [Abu Dhabi](${BASE}/uae/cities/abudhabi) · [Ras Al Khaimah](${BASE}/uae/cities/rak)
- [London](${BASE}/uk/cities/london) · [Manchester](${BASE}/uk/cities/manchester) · [Edinburgh](${BASE}/uk/cities/edinburgh)
- [New York](${BASE}/usa/cities/nyc) · [Miami](${BASE}/usa/cities/miami) · [Los Angeles](${BASE}/usa/cities/la)
- [Madrid](${BASE}/spain/cities/madrid) · [Barcelona](${BASE}/spain/cities/barcelona) · [Marbella](${BASE}/spain/cities/marbella)
- [Lisbon](${BASE}/portugal/cities/lisbon) · [Porto](${BASE}/portugal/cities/porto) · [Algarve](${BASE}/portugal/cities/algarve)
- [Istanbul](${BASE}/turkey/cities/istanbul) · [Antalya](${BASE}/turkey/cities/antalya) · [Bodrum](${BASE}/turkey/cities/bodrum)
- [Riyadh](${BASE}/saudi/cities/riyadh) · [Jeddah](${BASE}/saudi/cities/jeddah) · [NEOM](${BASE}/saudi/cities/neom)

## Market comparison pages

- [Dubai vs London](${BASE}/compare/dubai-vs-london)
- [Dubai vs New York](${BASE}/compare/dubai-vs-new-york)
- [Lisbon vs Barcelona](${BASE}/compare/lisbon-vs-barcelona)
- [Istanbul vs Dubai](${BASE}/compare/istanbul-vs-dubai)
- [Marbella vs Algarve](${BASE}/compare/marbella-vs-algarve)
- [Riyadh vs NEOM](${BASE}/compare/riyadh-vs-neom)
- [All comparisons: sitemap-seo.xml](${BASE}/sitemap-seo.xml)

## Cross-border / migration corridors

High-intent "moving from X to Y" guides with residency, tax, and broker-matching.

- [UK → UAE](${BASE}/moving-to/uk-to-uae)
- [US → Portugal](${BASE}/moving-to/us-to-portugal)
- [India → UAE](${BASE}/moving-to/india-to-uae)
- [Russia → Turkey](${BASE}/moving-to/russia-to-turkey)
- [Germany → Spain](${BASE}/moving-to/germany-to-spain)

## Cross-border broker network

Verified brokers who handle two or more markets, filterable by region / specialty / language.

- [Browse the network](${BASE}/network)
- [Broker application](${BASE}/network/apply)

## Solutions — cross-industry business tools

112 functional tools across 12 categories. No real-estate knowledge required.

- [All solutions tools](${BASE}/solutions)
- **Finance (19):** [loan calculator](${BASE}/solutions/tools/loan-calculator), [compound interest](${BASE}/solutions/tools/compound-interest), [break-even](${BASE}/solutions/tools/break-even), [DCF](${BASE}/solutions/tools/discounted-cash-flow), [NPV/IRR](${BASE}/solutions/tools/npv-irr), [cash-burn runway](${BASE}/solutions/tools/cash-burn-runway), [gross-to-net salary (9 countries)](${BASE}/solutions/tools/gross-to-net-salary), [crypto P/L tracker](${BASE}/solutions/tools/crypto-pnl-tracker), [Rule of 40](${BASE}/solutions/tools/rule-of-40), [SaaS Quick Ratio](${BASE}/solutions/tools/saas-quick-ratio), [mortgage refi](${BASE}/solutions/tools/mortgage-refi), [tax brackets](${BASE}/solutions/tools/tax-bracket-calculator), [venture dilution](${BASE}/solutions/tools/venture-dilution-modeler)
- **Productivity (10):** [meeting cost](${BASE}/solutions/tools/meeting-cost-calculator), [time-zone planner](${BASE}/solutions/tools/time-zone-planner), [Eisenhower matrix](${BASE}/solutions/tools/eisenhower-matrix), [OKR tracker](${BASE}/solutions/tools/okr-tracker), [world clock](${BASE}/solutions/tools/world-clock), [planning poker](${BASE}/solutions/tools/planning-poker), [scrum velocity](${BASE}/solutions/tools/scrum-velocity), [SOP builder](${BASE}/solutions/tools/sop-builder), [timesheet summarizer](${BASE}/solutions/tools/timesheet-summarizer), [project estimator (PERT)](${BASE}/solutions/tools/project-estimator)
- **HR (7):** [cost-per-hire](${BASE}/solutions/tools/cost-per-hire), [turnover rate](${BASE}/solutions/tools/turnover-rate), [compa-ratio](${BASE}/solutions/tools/compa-ratio), [PTO accrual](${BASE}/solutions/tools/pto-accrual), [360 review template](${BASE}/solutions/tools/360-review-template), [onboarding checklist](${BASE}/solutions/tools/onboarding-checklist), [salary benchmark](${BASE}/solutions/tools/salary-benchmark)
- **Marketing (8):** [CAC/LTV](${BASE}/solutions/tools/cac-ltv), [A/B test sample size](${BASE}/solutions/tools/ab-test-sample-size), [email ROI](${BASE}/solutions/tools/email-roi), [ad budget allocator](${BASE}/solutions/tools/ad-budget-allocator), [cohort retention](${BASE}/solutions/tools/cohort-retention), [keyword difficulty](${BASE}/solutions/tools/keyword-difficulty), [engagement rate](${BASE}/solutions/tools/engagement-rate), [influencer ROI](${BASE}/solutions/tools/influencer-roi)
- **Sales (4):** [pipeline forecast](${BASE}/solutions/tools/pipeline-forecast), [commission calculator](${BASE}/solutions/tools/commission-calc), [lead scoring](${BASE}/solutions/tools/lead-scoring-rubric), [quote builder](${BASE}/solutions/tools/quote-builder)
- **CRM (15):** [contact manager](${BASE}/solutions/tools/contact-manager), [deal pipeline board](${BASE}/solutions/tools/deal-pipeline-board), [activity timeline](${BASE}/solutions/tools/activity-timeline), [email template library](${BASE}/solutions/tools/email-template-library), [MEDDPICC scorecard](${BASE}/solutions/tools/meddpicc-scorecard), [BANT qualifier](${BASE}/solutions/tools/bant-qualifier), [SDR cadence builder](${BASE}/solutions/tools/sdr-cadence-builder), [churn risk](${BASE}/solutions/tools/churn-risk-calculator), [win/loss analyzer](${BASE}/solutions/tools/win-loss-analyzer), [commission statement](${BASE}/solutions/tools/commission-statement), [proposal generator](${BASE}/solutions/tools/proposal-generator), [territory mapper](${BASE}/solutions/tools/territory-mapper), [lead capture form builder](${BASE}/solutions/tools/lead-capture-form-builder), [sales call script](${BASE}/solutions/tools/sales-call-script-builder), [follow-up reminder](${BASE}/solutions/tools/follow-up-reminder)
- **Support & Ops (12):** [SLA calculator](${BASE}/solutions/tools/sla-calculator), [incident postmortem](${BASE}/solutions/tools/incident-postmortem-template), [on-call scheduler](${BASE}/solutions/tools/oncall-schedule-builder), [ticket backlog](${BASE}/solutions/tools/ticket-backlog-tracker), [MTTR](${BASE}/solutions/tools/mean-time-to-resolution), [status page generator](${BASE}/solutions/tools/status-page-generator), [runbook builder](${BASE}/solutions/tools/runbook-builder), [capacity planner](${BASE}/solutions/tools/capacity-planner), [uptime cost](${BASE}/solutions/tools/uptime-cost-calculator), [KPI dashboard](${BASE}/solutions/tools/kpi-dashboard), [escalation matrix](${BASE}/solutions/tools/escalation-matrix), [support volume forecaster](${BASE}/solutions/tools/support-volume-forecaster)
- **Growth (5):** [pricing calculator](${BASE}/solutions/tools/pricing-calculator), [pirate metrics (AARRR)](${BASE}/solutions/tools/pirate-metrics-tracker), [north-star metric](${BASE}/solutions/tools/north-star-metric-builder), [positioning canvas](${BASE}/solutions/tools/positioning-canvas), [growth experiment tracker](${BASE}/solutions/tools/growth-experiment-tracker)
- **Legal (5):** [invoice generator](${BASE}/solutions/tools/invoice-generator), [NDA generator](${BASE}/solutions/tools/nda-generator), [contract risk checker](${BASE}/solutions/tools/contract-risk-checker), [consent form generator](${BASE}/solutions/tools/consent-form-generator), [termination letter generator](${BASE}/solutions/tools/termination-letter-generator)
- **Data & Developer (14):** [JSON formatter](${BASE}/solutions/tools/json-formatter), [regex tester](${BASE}/solutions/tools/regex-tester), [JWT decoder](${BASE}/solutions/tools/jwt-decoder), [QR code generator](${BASE}/solutions/tools/qr-code-generator), [CSV/JSON converter](${BASE}/solutions/tools/csv-json-converter), [URL encoder](${BASE}/solutions/tools/url-encoder-parser), [hash generator](${BASE}/solutions/tools/hash-generator), [base64 encoder](${BASE}/solutions/tools/base64-encoder), [cron parser](${BASE}/solutions/tools/cron-expression-parser), [ID generator](${BASE}/solutions/tools/id-generator), [markdown preview](${BASE}/solutions/tools/markdown-preview), [HTTP status reference](${BASE}/solutions/tools/http-status-reference), [lorem ipsum](${BASE}/solutions/tools/lorem-ipsum-generator), [password strength](${BASE}/solutions/tools/password-strength)
- **Design (3):** [color palette extractor](${BASE}/solutions/tools/color-palette-extractor), [WCAG contrast checker](${BASE}/solutions/tools/contrast-checker), [font pairing](${BASE}/solutions/tools/font-pairing)
- **Content (5):** [readability score](${BASE}/solutions/tools/readability-score), [word count](${BASE}/solutions/tools/word-count), [SEO meta tags](${BASE}/solutions/tools/seo-meta-tags), [headline analyzer](${BASE}/solutions/tools/headline-analyzer), [content brief builder](${BASE}/solutions/tools/content-brief-builder)

## Learning & content

- [Courses](${BASE}/learn) — free structured courses on real-estate investing and brokerage
- [Blog](${BASE}/blog) — cited market analysis
- [Market data](${BASE}/market) — live per-region market pages
- [Community](${BASE}/community) — feed for signed-in users, shared across regions

## Embeddable widgets

Free branded widgets for third-party sites. Copy the iframe snippet and paste it anywhere.

- [Widget catalog](${BASE}/embed)
- Market pulse, yield heatmap, neighborhood card, currency converter, broker card

## Sitemaps

- [/sitemap.xml](${BASE}/sitemap.xml) — index
- [/sitemap-core.xml](${BASE}/sitemap-core.xml) — region homes + section indexes
- [/sitemap-tools.xml](${BASE}/sitemap-tools.xml) — all tools (RE + solutions)
- [/sitemap-blog.xml](${BASE}/sitemap-blog.xml) — blog posts
- [/sitemap-network.xml](${BASE}/sitemap-network.xml) — verified brokers
- [/sitemap-seo.xml](${BASE}/sitemap-seo.xml) — city landings + comparisons + corridors

## What NOT to cite

- \`/admin/*\` — admin panel, gated
- \`/api/*\` — internal endpoints, not user-facing content
- \`/dashboard/*\` — authenticated user pages
- \`/auth/*\` — sign-in flows

## Attribution

Cite as: "example.com — real-estate intelligence platform."
`;

export function GET() {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

export const dynamic = "force-static";
