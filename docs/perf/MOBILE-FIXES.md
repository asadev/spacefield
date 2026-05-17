# Mobile Perf — Fixes Applied (Wave 4 Z2, 2026-05-17)

This is the changelog for the first execution pass on the audit in
`MOBILE.md`. We picked the items with the best ratio of "bundle bytes
removed from cold-load" to "risk of breaking interaction state."

Scope was deliberately narrow — see "Deferred" at the bottom for items
left for a follow-up Z3 pass.

## 1. Homepage (`/`) — gate Desktop behind `dynamic`

**File:** `app/_components/HomeGate.tsx`

The OS shell (`app/tools/_components/Desktop.tsx`) imports ~50 client
components — Dock, Launchpad, AppStore, Spotlight, Mission Control, the
agent chat launcher, the workspace sync hooks, etc. Signed-out visitors
hitting `/` never see any of it; HomeGate routes them to `<Landing />`.

Previously the Desktop module was a sync top-level import, so it landed
in the same chunk as the homepage entry — meaning a marketing visitor on
a 4G phone still downloaded the workspace shell.

After:
```ts
const Desktop = dynamic(() => import("../tools/_components/Desktop"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-app" aria-hidden />,
});
```

Signed-in visitors still get the Desktop — they just pay one extra
roundtrip's worth of latency for the chunk. The loading state is
visually identical to the existing "loading" branch in HomeGate, so the
transition is a no-op to the eye.

## 2. Desktop — defer below-fold OS components

**File:** `app/tools/_components/Desktop.tsx`

Three components are mounted unconditionally inside Desktop but contribute
nothing to the first paint:

- `AmbientSounds` — renders a button only after the user enables a track;
  the AudioContext is created on first click.
- `ScreenshotCapture` — registers global Cmd-Shift-3/4 hotkeys; no UI
  until the user invokes them.
- `Onboarding` — gated behind `showOnboarding` (false for any returning
  user).

All three are now `dynamic(() => import(...), { ssr: false, loading: () => null })`.
This shaves them out of the workspace shell's eager chunk graph; they're
fetched in the idle period after first paint.

## 3. `/pricing` — defer below-fold sections

**File:** `app/pricing/page.tsx`

`Hero` + `TierGrid` is the only thing above the fold on a mobile cold
load. `AddonSection`, `ComparisonTable` (422 lines, the largest), and
`FaqSection` are all below the fold.

Wrapped each in `next/dynamic` (no `ssr: false` — they're still
server-rendered for SEO, the savings are pure client parse/eval cost).

This is conservative. A more aggressive pass would mark TierGrid + Hero
as the only client islands and move the static FAQ copy to an RSC, but
that's a bigger refactor — flagged as deferred below.

## 4. `property-poster-creator` — drop framer-motion

**File:** `app/tools/property-poster-creator/_app.tsx`

`framer-motion` was used at four sites in this file:

- 3× right-rail tab fades (`AnimatePresence` + `motion.div` with an 180ms
  fade-slide on tab switch).
- 1× canvas preview fade (300ms scale + opacity when the user switches
  template or format).

None of these used spring physics, shared layouts, or any other feature
that wouldn't survive as a CSS keyframe. Replaced with two `@keyframes`
declared in a `<style jsx global>` block at the bottom of the file:

- `poster-panel-fade-kf` — 180ms opacity + 8px translateX.
- `poster-canvas-fade-kf` — 300ms opacity + 0.96→1 scale.

Both retrigger via React `key` change (same mechanism `AnimatePresence`
used to detect a swap). `prefers-reduced-motion` is honored.

The `import { motion, AnimatePresence } from "framer-motion"` line is
gone from this file. `framer-motion` is still pulled in elsewhere (Desktop,
Landing, dozens of leaf components), so the package isn't removed from
the dep tree — but this route's chunk no longer contains it.

## 5. Service worker — offline marketing shell

**File:** `public/sw.js` (rewritten)

The previous SW (`v1`) only cached `/icons/`, `/_next/static/`, and
`/fonts/`. It explicitly passed HTML through to network, which meant an
offline visitor saw the browser's default "no internet" page even for
pages they'd just visited.

The new SW (`v2`) adds a second cache layer for marketing HTML:

| Path                         | Strategy                | Cache                   |
| ---------------------------- | ----------------------- | ----------------------- |
| `/_next/static/*`, `/icons/*`, `/fonts/*` | stale-while-revalidate  | `spacefield-static-v2`  |
| `/`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms`, `/refund`, `/legal/*` | network-first, fall back to cache, max-age 7d | `spacefield-pages-v2` |
| `/api/*`, `/admin*`, `/auth/*`, `/tools/*`, `/signin*`, `/_next/data/*` | passthrough (never cached) | — |
| Cross-origin                 | passthrough             | —                       |

Implementation notes:

- HTML responses are detected by `request.mode === "navigate"` OR an
  `Accept: text/html` header — same heuristic Workbox uses.
- Entries are stamped with an `x-sw-cached-at` header on write so we can
  age out stale entries server-side (`PAGE_MAX_AGE_MS = 7d`). The
  default Cache API has no built-in TTL.
- The exclusion list (`NEVER_CACHE_PREFIXES`) wins over the marketing
  allowlist — so `/api/foo` is always passthrough even if some future
  marketing page lives under that path.
- A last-resort inline offline page is returned for marketing requests
  that miss both the network and the cache (e.g. a brand-new install
  that goes offline before ever loading the page).
- `CACHE_VERSION` was bumped from `v1` to `v2`; the `activate` handler
  purges any cache that isn't `v2`, so the swap is automatic.

`components/ServiceWorkerRegister.tsx` calls `registration.update()`
after registration completes — this nudges existing installs to fetch
the new SW on next visit, instead of waiting for the browser's
24-hour-or-so default revalidation.

## 6. `<link rel="preload">` for the hero brand mark

**File:** `app/layout.tsx`

Added one explicit preload:

```html
<link rel="preload" as="image" href="/icons/icon-192.svg" type="image/svg+xml" />
```

This SVG is the brand mark visible on every marketing page (hero +
top-nav + footer) and is also the PWA icon. ~1 KB on the wire — the
preload is purely about avoiding the discovery delay from `<head>` →
render → layout → image-fetch.

**Font preloading:** deliberately NOT added. `next/font/google` (the
Inter import at the top of layout.tsx) auto-generates a preload tag for
its woff2 subset at higher priority than anything we'd manually inject.
Adding a duplicate would either be a no-op or fire a second fetch for an
already-cached file.

## Verification

```
npx tsc --noEmit -p tsconfig.json
```

…runs clean on `feat-z2-mobile-fixes`.

## Deferred to a follow-up pass

Items from `MOBILE.md` that we didn't pick up here:

- **MobileShell route-split** (homepage rec #2) — needs a `matchMedia`
  capability check at mount; non-trivial because the desktop tree
  already calls `useIsMobile` to switch UI without unmounting either
  shell. Worth doing separately.
- **AnimatePresence → CSS for SnapPreview / NotificationCenter** (rec
  #3) — same pattern as what we did for property-poster-creator, but
  spread across more files; defer until the bundle analyzer confirms
  it's still the biggest win.
- **Dock icon sprite** (rec #4) — touches the icon manifest + Dock
  rendering, big surface for a small win.
- **Pricing page → RSC for non-interactive sections** (rec #2.3) —
  needs the FAQ + comparison data extracted from the client islands.
- **Sheets `xlsx`-style lazy load** (rec #5.2) — `_editor.tsx` already
  imports ExcelJS for round-tripping, and the editor itself is already
  behind `dynamic()`. Moving ExcelJS into `loadXlsx()` / `saveXlsx()`
  is the right next step but needs careful testing of all import/export
  paths.
- **Univer locale split, plugin-on-demand registration** (recs #5.3,
  #5.4) — substantial refactor of `_editor.tsx`; out of scope here.
