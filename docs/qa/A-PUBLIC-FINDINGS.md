# QA-A: Public anonymous surface — findings

**Audited**: 2026-05-19/20 by QA-A (parallel opus run, the maintainer asleep)
**Pages walked**: 25 routes + adjacent (sitemap, robots, security.txt, OG image, manifest)
**Live build under test**: 877caf68 (Vercel) / 783fa8b (main)
**Method**: source-read of every in-scope route + 22 WebFetch calls against the live site, plus header probes.

## In scope (one line each)

`/`, `/pricing`, `/compare`, `/alternative-to/{salesforce,hubspot,zoho-one,notion,monday,clickup}`, `/templates`, `/press`, `/roadmap`, `/changelog`, `/developers`, `/developers/openapi.json`, `/waitlist`, `/embed/{mortgage-calculator,roi-calculator}`, `/legal/{terms,privacy,dpa,aup,subprocessors,security,accessibility,cookies}`, `/signin`, `/unsubscribe`, `/.well-known/security.txt`, 404 boundary, cookie consent banner, footer links, sitemap.xml, robots.txt.

## ✅ Working

- `/pricing` — SSR renders the full tier grid + comparison table + add-ons + FAQ. Mailto for sales, Talk-to-sales CTA, currency switcher all present. (`Pricing | Space Field`.)
- `/compare` — full 15-row matrix renders with the four headline rivals; honest-on-purpose "no" cells where parity is missing. Tone is good.
- `/alternative-to/{salesforce,hubspot,zoho-one,notion}` — render fully, hero + 5 wins + 6-row snippet + honest-callouts + CTAs all good. (`monday` + `clickup` see ❌ below.)
- `/templates` — 7 cards (3 available + 4 coming-soon), correct CTAs split between "Sign up to apply" and "Notify me".
- `/changelog` — 9 entries, dates + tags + descriptions all render.
- `/roadmap` — three-bucket layout (Shipped / In progress / Next up), waitlist link works.
- `/press` — boilerplate + bio + FAQs render (one ❌ broken asset, see below).
- `/developers` — five sections + collapsible endpoint cards + linked OpenAPI spec.
- `/developers/openapi.json` — valid OpenAPI 3.1, matches the docs page (7 endpoints / 5 schemas).
- `/waitlist` — form posts to a server action (`joinWaitlist` → `waitlist_join` RPC) with email validation + SHA-256 hash logging (no PII in logs).
- `/embed/{mortgage-calculator,roi-calculator}` — render light-mode-locked, CSP carve-out drops `frame-ancestors` so third-party iframes work. "Powered by Spacefield" backlink is present.
- `/legal/{terms,privacy,dpa,aup,subprocessors,security,accessibility,cookies}` — all 8 pages render under a shared layout with a left-rail nav. DraftBanner is honest about lawyer-review status.
- `/.well-known/security.txt` — valid (RFC 9116), points to security@ + the /legal/security policy + hall-of-fame.
- `/signin` — renders the standalone landing card; SignInDialog opens. `?next=` is path-safe-validated (`readSafeNext` blocks `//evil`).
- `/unsubscribe` (no token) — graceful "Missing link" card with two clear next-actions.
- 404 boundary — `/this-route-truly-bogus` returns proper HTTP 404 with the custom not-found UI.
- Cookie consent banner — distinguishes "Accept all" vs "Essentials only", persists to localStorage + cookie, doesn't blanket-block essential cookies. Mirrors to a server-readable cookie so SSR avoids the flash.
- Security headers — HSTS preload, XCTO, Referrer-Policy, Permissions-Policy, CSP report-only, X-Frame-Options SAMEORIGIN, Report-To group all set globally via `applySecurityHeaders()`.
- OG metadata — root layout has full openGraph + twitter `summary_large_image`; `/opengraph-image` route returns a 1200x630 PNG.
- All public mailto addresses match the documented convention (`security@`, `privacy@`, `legal@`, `abuse@`, `accessibility@`, `press@`, `support@`, `sales@`, `hello@`).

## ⚠️ Minor issues (track but don't block)

- `/` (Landing.tsx) — `<button>Watch demo</button>` onClick is literally `() => { /* demo placeholder */ }` — visible CTA on the hero that does nothing. — `app/_components/Landing.tsx:220` — wire it to a YouTube modal, an asciinema embed, or a screen recording on /press; or remove the button.
- `/` (Landing.tsx PricingTeaser) — hard-coded tier prices `$9 / $19` for Pro/Team. Live `/pricing` is now `$10 / $30` monthly. Marketing landing under-promises and the real pricing page over-charges; pick one. — `app/_components/Landing.tsx:719,724` — read from the same source of truth as `/pricing`.
- `/` and `/pricing` footers point to **`/privacy` + `/terms` + `/refund`** (legacy marketing copy, "Last updated 27 April 2026") rather than the **`/legal/{privacy,terms}`** versions (DraftBanner, "Effective May 13, 2026"). Both routes ship — duplicate legal text with different dates is a real liability. — `app/_components/Landing.tsx:887-891`, `app/pricing/page.tsx:190-194` — settle on one set; either delete `/privacy`+`/terms`+`/refund` and 301 → `/legal/*`, or delete the `/legal/*` versions.
- `/sitemap.xml` — only lists 8 URLs (`/`, `/about`, `/pricing`, `/contact`, `/signin`, `/privacy`, `/terms`, `/refund`). Missing `/compare`, all six `/alternative-to/*`, `/templates`, `/press`, `/roadmap`, `/changelog`, `/developers`, `/waitlist`, and the entire `/legal/*` namespace. — `app/sitemap.ts:11-23` — add these to recover SEO surface.
- `/developers` — links to `/admin/api-tokens`, which is gated and shows a 403 "Not authorized" page to anyone not signed in as an admin. Anon evaluators reading the docs hit a wall with no context. — `app/developers/page.tsx:142-148` — add a one-liner: "Tokens are minted by workspace admins — sign in and ask yours, or [contact us](mailto:support@…) for a demo token."
- `/legal/security` — "Hall of fame" section says "Empty for now." That's honest; minor — could go inside a `<details>` to avoid the visual gap.
- `/manifest.webmanifest` shortcuts → `/dashboard` and `/tools`. Both are auth/admin-gated for anon users (and `/tools` is disallowed in robots and redirected by middleware). PWA install from a logged-out browser will land on dead-ends. — `public/manifest.webmanifest` (shortcuts block at tail) — point shortcuts at `/?app=dashboard` or just `/` and `/pricing`.
- `/legal/cookies` — the cookie inventory table lists `_vercel_speed_insights` under Analytics, but the table is missing `spacefield-cookie-consent` (the cookie the in-house banner sets to remember the choice). The banner stores it; the policy doesn't list it. — `app/(legal)/legal/cookies/page.tsx:19-48` — add a "Strictly necessary" row for the consent cookie itself.
- `/embed/*` sets `X-Frame-Options: ALLOWALL` (non-standard value). Modern browsers ignore unknown XFO values and use `frame-ancestors *` from the CSP, but header scanners flag this. — `next.config.ts:204` — simply omit the XFO header on embed paths (the CSP `frame-ancestors *` is sufficient).
- Press kit "About Space Field" repeats "130+ purpose-built tools" — the `/compare` matrix row also says "130+ tools" and `/templates` says "130+ tools" but the Landing has "Calculators, dashboards, generators, planners — install only what you need". A single inventory of size is fine; just confirm the actual number for the next legal-review pass (the changelog claims `~50 admin routes` — these are not the same as user tools, but the number lives in copy in multiple places).
- `app/layout.tsx` mounts `<Analytics />` (Vercel) and `<SpeedInsights />` unconditionally — independent of cookie consent state. The cookie banner offers "Essentials only" but the analytics SDK loads anyway. Likely benign because Vercel Analytics is cookieless by default, but `_vercel_speed_insights` IS listed in `/legal/cookies` as Analytics. — `app/layout.tsx:185-186` — gate behind the consent cookie OR remove the cookie from the policy if it's truly session-only and consent-free.
- `Landing.tsx` "Sign in" CTA opens the `SignInDialog` modal inline rather than navigating to `/signin`. That's fine, but the `/signin` route exists and is reachable from `/pricing` only — duplicate auth entry points with subtly different chrome. Decide on one canonical path.

## ❌ Bugs (need fix)

- **Press kit "Logo (PNG)" download is broken.** `/icon-512.png` returns **HTTP 404** — the file isn't in `public/`. `public/` only has `icon-mark-dark.svg`, `icon-mark.svg`, `icon.tsx`, and `icons/icon-{192,512,maskable-512}.svg`. — `app/press/page.tsx:20` — either generate a real `public/icon-512.png` (PWA-quality, transparent bg) or change the listing to a PNG that exists.
- **`/alternative-to/clickup` and `/alternative-to/monday` show an all-dashes comparison snippet.** `app/alternative-to/_data/competitors.ts` defines `COMPARE_FEATURES.support` ONLY for keys `spacefield | salesforce | hubspot | zoho-one | notion`. The competitor catalog lists `monday` and `clickup` with `alternativePage: true`, and the page reads `row.support[c.slug] ?? "no"` so every cell falls through to "—". Result: a six-row snippet on the ClickUp page that says ClickUp can't do CRM, HR, tasks, AI, real-estate, or 130+ tools — three of those are blatantly wrong (ClickUp definitely does CRM-via-templates, tasks-as-its-core, and AI Brain). For the "honest comparison" pitch this is the worst possible failure mode. — `app/alternative-to/_data/competitors.ts:281-465` — add `monday` and `clickup` columns to every `support` map AND every `note` map, OR drop `alternativePage: true` on those entries until the data is complete.
- **`/alternative-to/<bogus-slug>` returns HTTP 200 with "Alternative not found" body.** `notFound()` is called but the page was built via `generateStaticParams` and Next's default `dynamicParams: true` lets unknown slugs render on-demand; the framework sends 200 + the not-found UI rather than a real 404 status. Googlebot will happily index "Alternative not found" pages for every probed slug. — `app/alternative-to/[slug]/page.tsx:29-31,66` — add `export const dynamicParams = false;` so unknown slugs 404 at the route level (no rendering at all).
- **`/embed/<bogus-tool-id>` returns HTTP 200 with the embed-not-found state.** Same root cause as above — `generateStaticParams` + default `dynamicParams: true` + `notFound()`. — `app/embed/[toolId]/page.tsx:35-37,55` — add `export const dynamicParams = false;`.
- **Homepage `/` ships an empty `<body>` on first HTML response.** `HomeGate` is `"use client"`-only; the SSR markup is `~21 KB` of which the visible body is essentially `<!--$--><!--/$-->` placeholders. Crawlers without JS rendering, Lighthouse text-content audits, and link previews that don't execute JS all see no value-prop copy. Pricing/Compare/Templates/Press all SSR fine — this is unique to `/`. — `app/page.tsx:23-25`, `app/_components/HomeGate.tsx` — render a SSR skeleton of the Landing (hero h1, tagline, primary CTA) and hydrate to interactive afterwards. Cheapest fix: render `<Landing>` as the default and `<HomeGate>` only swaps to Desktop on hydration when localStorage/session say so.
- **Vercel `<Analytics />` + `<SpeedInsights />` mount unconditionally in `app/layout.tsx:185-186`** despite the cookie banner offering "Essentials only". The `_vercel_speed_insights` cookie is explicitly classified Analytics in `/legal/cookies`, and the banner is positioned as the consent gate. Strict reading: GDPR/PDPL violation. — `app/layout.tsx:185-186` — read `getConsentCookie()` (already loaded at line 92) and only mount `<Analytics />` + `<SpeedInsights />` when `consent === "all"`.
- **Two parallel legal regimes are live.** `/privacy` ("Last updated 27 April 2026", no banner, marketing-toned) and `/legal/privacy` ("Effective May 13, 2026", DRAFT banner, lawyer-flavored) both render; same for terms + refund vs aup/dpa/etc. Footers + sitemap point at the older `/privacy`+`/terms`+`/refund` set, while legal navigation in `/legal/*` and inline links from waitlist + press kit point at the newer set. For a regulator, the "current Terms" depend on which link you followed. — `app/{privacy,terms,refund}/page.tsx` vs `app/(legal)/legal/{privacy,terms}/page.tsx` — pick one canonical home; 301-redirect the other.

## Broken Link Map

| From | To | Status | Reason |
|---|---|---|---|
| `app/press/page.tsx:20` | `/icon-512.png` | 404 | File absent; only `icons/icon-512.svg` exists. |
| `app/alternative-to/[slug]/page.tsx` (any slug) | `/alternative-to/<bogus>` | 200 (should be 404) | `dynamicParams` defaults to true with `generateStaticParams`. |
| `app/embed/[toolId]/page.tsx` (any id) | `/embed/<bogus>` | 200 (should be 404) | Same as above. |
| `app/developers/page.tsx:144` | `/admin/api-tokens` | 200 (403-UI) for anon | No wayfinding for anonymous evaluators. |
| `app/_components/Landing.tsx:887` & `app/pricing/page.tsx:191` | `/privacy` | 200 but duplicate of `/legal/privacy` | Two privacy policies with different dates. |
| `app/_components/Landing.tsx:888` & `app/pricing/page.tsx:192` | `/terms` | 200 but duplicate of `/legal/terms` | Two terms-of-service docs with different dates. |
| `public/manifest.webmanifest` (shortcuts) | `/dashboard`, `/tools` | 200 (auth-required) | PWA install from logged-out browser → dead-ends. |
| `app/_components/Landing.tsx:223` (Watch demo button) | (no target) | n/a | onClick is a no-op placeholder. |

## Suggested checklist additions (for /admin/status)

- **QA-A-01 P0** — Wire the in-house cookie-consent state to `<Analytics />`/`<SpeedInsights />` mount in `app/layout.tsx`. Today they load regardless of consent — likely GDPR/PDPL non-compliant.
- **QA-A-02 P0** — Add `monday` + `clickup` columns to every row of `COMPARE_FEATURES.support` (and notes where useful). Currently both alternative pages display an all-dashes snippet that contradicts the "honest comparison" pitch.
- **QA-A-03 P0** — Pick one canonical legal regime: either `/privacy`+`/terms`+`/refund` (old, marketing) or `/legal/{privacy,terms,dpa,aup,...}` (new, draft). 301 the deprecated set. Today two sets are live with different effective dates.
- **QA-A-04 P1** — Set `dynamicParams = false` on `app/alternative-to/[slug]/page.tsx` and `app/embed/[toolId]/page.tsx` so unknown slugs hit a real 404 instead of HTTP-200 "not found" pages (SEO + crawler hygiene).
- **QA-A-05 P1** — Add a `public/icon-512.png` (a real PNG export) so the press-kit download link stops 404'ing.
- **QA-A-06 P1** — Extend `app/sitemap.ts` to include `/compare`, all six `/alternative-to/*` slugs, `/templates`, `/press`, `/roadmap`, `/changelog`, `/developers`, `/waitlist`, and `/legal/{terms,privacy,dpa,aup,subprocessors,security,accessibility,cookies}`.
- **QA-A-07 P1** — SSR the homepage Landing (current state: empty body, hydrate-only). Fix shrinks the no-JS / crawler view from "nothing" to "real value-prop + CTAs".
- **QA-A-08 P2** — Reconcile pricing copy: Landing PricingTeaser hardcodes `$9 / $19`, live pricing page is `$10 / $30`. Either dedupe via a shared constant or remove the teaser numbers entirely and just link out.
- **QA-A-09 P2** — Either wire the "Watch demo" button (Landing.tsx:218) to a real artifact or remove it. Visible no-op CTA on the hero erodes trust.
- **QA-A-10 P2** — Add `spacefield-cookie-consent` cookie to the inventory table in `/legal/cookies` (strictly-necessary category).
- **QA-A-11 P2** — Replace `X-Frame-Options: ALLOWALL` on `/embed/*` (next.config.ts:204) with header omission. Non-standard value; rely on `frame-ancestors *` in CSP.
- **QA-A-12 P3** — Update manifest shortcuts (`public/manifest.webmanifest`) to anon-safe targets so PWA installs from a logged-out browser don't land on auth-gated routes.
- **QA-A-13 P3** — Add a one-line "How to get a token" note on `/developers` explaining that anonymous visitors will see a 403 at `/admin/api-tokens`; suggest contacting support.
