# Mobile Perf Audit — 2026-05-17

Pass over the heaviest user-facing surfaces in spacefield. For each page
we list (a) the count of direct `import` statements in the entry file,
(b) heavy deps it pulls into the client bundle, and (c) 3-5 concrete
suggestions. Numbers here are static-analysis counts of declared imports
in the leaf file — not full bundle weight. The intent is to identify
quick wins for cold-load on 4G mobile.

Method: ripgrep `^import` in each entry and trace into its top-level
client components. We stop one level deep — the bundle analyzer
(`ANALYZE=1 pnpm build`, see `next.config.ts`) is the right tool for
full-tree numbers.

## 1. `/` (homepage)

- Entry: `app/page.tsx` → 2 imports (`Metadata`, `HomeGate`).
- HomeGate: 5 imports. Renders `Landing` or `Desktop` based on auth.
- Desktop tree: **51 imports** in `app/tools/_components/Desktop.tsx`
  alone, plus deep trees in Dock/Launchpad/AppStore. This is the OS
  shell — large by design.
- Heavy deps in client bundle:
  - `framer-motion` (`AnimatePresence` in Desktop, motion in many
    children).
  - All 30+ `_components` mount eagerly when a signed-in user lands.
- Recommendations:
  1. Keep `Landing` as the sync default for `/`; gate `Desktop` behind
     `dynamic(() => import("../tools/_components/Desktop"), { ssr: false })`
     inside `HomeGate`. Signed-out visitors (the long tail of mobile
     traffic) will then never download the OS shell.
  2. `MobileShell` is imported eagerly by `Desktop`, but desktop browsers
     never need it (and vice versa). Split-route via `dynamic` based on a
     `matchMedia("(max-width: 768px)")` capability check at mount.
  3. `framer-motion` is already in `optimizePackageImports` — verify
     after the next build that AnimatePresence still gets tree-shaken;
     consider replacing the single-use AnimatePresence wrappers in
     SnapPreview/NotificationCenter with raw CSS transitions.
  4. Dock + Launchpad icons fire a CDN fetch per icon. Already cached
     with `immutable` (good), but bundle the top-12 dock icons as a
     `next/image` sprite to drop a dozen TLS handshakes on cold load.
  5. Defer `AmbientSounds`, `ScreenshotCapture`, and `Onboarding` —
     none of these are visible on first paint. Wrap in
     `dynamic(..., { ssr: false, loading: () => null })`.

## 2. `/pricing`

- Entry: `app/pricing/page.tsx` → 7 imports.
- Sub-components (all `"use client"`): `TierGrid` (4), `AddonSection`
  (4), `ComparisonTable` (1), `FaqSection` (1), `Hero` (1), `TierCard`
  (4). Plus `CurrencySwitcher` from `@/components`.
- Heavy deps: none directly — no framer-motion, no charting, no editor.
  This is one of the lighter user-facing pages.
- Recommendations:
  1. `ComparisonTable` is a large static markup table that's most likely
     below the fold on mobile. Wrap it in
     `dynamic(() => import("./_components/ComparisonTable"))` so it
     downloads on scroll, not on cold load.
  2. `FaqSection` and `AddonSection` are also below-fold. Same treatment.
  3. The page is currently `"use client"` for all four sub-trees but the
     bulk of the content (tier copy, FAQ text) is static. Mark Hero +
     TierGrid as the only client islands and render the rest as RSC.
  4. `CurrencySwitcher` is a small client component but it touches
     localStorage — fine. Confirm it doesn't re-render the whole page on
     every currency change (it should only push a CSS var).

## 3. `/tools/property-poster-creator`

- Entry: `app/tools/property-poster-creator/page.tsx` → 5 imports plus
  the route's heavy `_app.tsx` (which holds 6 template renderers, photo
  pan/zoom, gradients, and PDF export). Page file is 1,087 lines.
- Heavy deps:
  - `framer-motion` (sync at the top of the file).
  - `html2canvas-pro` — **already dynamically imported** inside the
    download handler (good, lines 799 + 1205 + 1245).
  - 6 template renderers all imported eagerly even though only one is on
    screen at a time.
- Recommendations:
  1. Replace the sync `motion`/`AnimatePresence` import with
     `dynamic(() => import("framer-motion").then(m => m.motion))` for
     the heavy motion components, or drop motion entirely on this page —
     the only animations are simple fade-ins that are equivalent CSS.
  2. Split the 6 template renderers into `dynamic` imports keyed on the
     current template. Cold load only needs whichever template is the
     default ("classic" or whatever the user opened last).
  3. The page already lazy-loads `html2canvas-pro`. Same trick for
     anything PDF-related (jsPDF if introduced later) — never sync.
  4. `useUserPreferences` is fine but the file pulls in
     `ToolRecommendations` (a sibling-tools recommender) at the bottom
     — defer it until user has been on page > 3s.

## 4. `/admin` (dashboard landing)

- Entry: `app/admin/page.tsx` → 4 imports (server component, no
  framer-motion). Pulls the admin shell layout from `app/admin/layout`.
- Heavy deps: none directly. The shell pulls in `BulkActionBar`,
  `BulkRowCheckbox`, and small chrome — all light.
- Recommendations:
  1. Admin pages are gated behind auth + admin role — they don't need
     `dynamic = "force-dynamic"` on every leaf page if the page's data
     is cacheable for a short TTL. Audit which pages can flip to
     `revalidate = 30`.
  2. The dashboard fetches several aggregate stats serially in one
     server component. They're independent — wrap them in
     `Promise.all` (the file already does this in spots; sweep).
  3. The admin layout loads icons + avatars per row. Use `next/image`
     with `priority={false}` and lazy boundary so the cold paint of the
     dashboard doesn't wait on N user avatars.
  4. The chrome ships a section-scoped sidebar (9 sections). Each
     section's icon set could share a single SVG sprite instead of
     individual inline SVGs.

## 5. `app/tools/sheets/_app.tsx` (Sheets, the OS app)

There is no `/tools/sheets` page (the spreadsheet runs inside the OS
shell), but the entry of the app is the heaviest single chunk in the
codebase, so worth flagging for completeness.

- `_app.tsx` is 6 imports thin — `motion, AnimatePresence` from
  `framer-motion` and a `dynamic` import of `_editor.tsx`. **Good**.
- `_editor.tsx`: **45 imports**, including the entire Univer suite (12
  plugins + 9 facade modules + 9 locale modules + 8 CSS sheets) and
  the `xlsx` (SheetJS) library.
- Heavy deps:
  - `xlsx` — synchronous import. ~400 KB minified.
  - `@univerjs/*` — 20+ packages, multi-megabyte aggregate.
- Recommendations:
  1. `_editor.tsx` is already loaded via `dynamic({ ssr: false })` from
     `_app.tsx` — that's the right pattern. Make sure no other route
     accidentally syncs it in.
  2. `xlsx` is only needed at "open file" and "save file" time. Move
     the import to inside `loadXlsx()` / `saveXlsx()` —
     `const XLSX = await import("xlsx")` — so the editor chunk doesn't
     wait on the parser to mount.
  3. Univer locale files load all 9 languages eagerly. Load only the
     current locale (default `en-US`) + dynamic-import the rest behind a
     language switcher.
  4. Univer plugins (sort, filter, conditional-formatting,
     find-replace) are loaded up-front. Split into "core" (Univer + UI
     + Sheets) and "extensions" — register extensions on first user
     interaction with the relevant toolbar button. Saves ~30 % of
     initial parse on a fresh open.
  5. Consider `react-spreadsheet` or `glide-data-grid` for read-only or
     simple-edit cases (e.g. CSV preview) so the Univer chunk only
     loads when the user explicitly wants Excel-grade features.

## Cross-cutting wins

- `framer-motion` is used in **40+ leaf files**. The
  `optimizePackageImports` flag in `next.config.ts` helps but does not
  fully tree-shake the runtime. Audit and replace single-use motion
  components with CSS transitions or `@motionone/react` (smaller).
- Set up `@next/bundle-analyzer` (already gated by `ANALYZE=1` in
  `next.config.ts` — install the dep when running). Run after each PR
  that touches a heavy surface.
- Add a Web Vitals capture (`useReportWebVitals`) to send LCP / INP /
  CLS to `/api/perf` so we have real-device numbers, not Lighthouse
  emulations.
- Mobile Safari + 4G LTE is the slowest realistic device. Test the home
  page + property-poster + sheets specifically on a throttled
  Lighthouse mobile profile and commit a baseline so we can spot
  regressions.
