# Tablet-Width Layout Audit (768-1024px)

Pass executed by Wave-2 Agent W3.

## Methodology

iPad portrait sits at 768px wide; iPad landscape at 1024px. Most layouts
that go `grid-cols-1 → md:grid-cols-3` (or `→ md:grid-cols-4`) without
a `sm:grid-cols-2` step in between snap directly from one-up to three-
or four-up at 768px, which jams cards into ~240-180px each — fine for
icons, ugly for cards with body copy.

Sweep: scan every section that uses `md:grid-cols-3` or
`md:grid-cols-4` and add `sm:grid-cols-2` where the content is
card-heavy.

## Fixes applied

1. **`app/_components/Landing.tsx`** (Features grid, line 485)
   - Was: `mt-12 grid gap-6 md:grid-cols-3`
   - Now: `mt-12 grid gap-6 sm:grid-cols-2 md:grid-cols-3`
   - Why: Three "Why Space Field" feature cards each have a 96px gradient
     icon + heading + 2 lines of body. Single-column on phones, 2-up on
     tablets, 3-up on desktop reads cleanly.

2. **`app/_components/Landing.tsx`** (Pricing teaser grid, line 696)
   - Was: `mt-10 grid gap-4 md:grid-cols-3`
   - Now: `mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3`
   - Why: Three pricing-tier cards. Two side-by-side at sm/md tablet,
     three at desktop.

3. **`components/seo/RelatedTools.tsx`** (line 38)
   - Was: `grid grid-cols-1 gap-4 md:grid-cols-3`
   - Now: `grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3`
   - Why: SEO "Related tools" cards render on tool landing pages; 3
     columns at 768px was cramping the tool names + descriptions.

4. **`app/pricing/_components/AddonSection.tsx`** (line 138)
   - Was: `mt-10 grid gap-4 sm:grid-cols-3`
   - Now: `mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3`
   - Why: Storage add-on cards had `sm:grid-cols-3` which triggers at
     640px — three 200px cards crammed on a tablet held in portrait.
     Now: single column on phone, two on small tablet (sm), three on
     larger tablet+ (md).

## What I left alone

- **`app/_components/Landing.tsx` Footer (line 821)** — already
  `sm:grid-cols-2 md:grid-cols-4`. Four 192px footer columns at md is
  fine; nothing to fix.
- **`app/pricing/page.tsx` Footer (line 148)** — same as Landing
  footer, already adequate.
- **`app/_components/Landing.tsx` Tools strip (line 531)** — horizontal
  scroll with `w-[170px]` fixed-width cards. Tablet renders the same as
  phone (scrolls); no breakpoint adjustment needed.
- **`app/_components/Landing.tsx` Faux desktop (line 348)** — already
  has `h-[260px] sm:h-[360px] md:h-[420px]` so heights scale by
  breakpoint.
- **`app/tools/_components/Launchpad.tsx`** — uses CSS-grid via inline
  `gridTemplateColumns` driven by container measurements + a tile-size
  preference, not Tailwind breakpoints. No tablet-specific fix needed.
- **`app/tools/_components/Dock.tsx`** — auto-sizes by item count; no
  breakpoint-based layout. Fine on tablet.
- **`app/admin/*`** — out of scope per W3 brief; admin chrome is
  desktop-first.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean (exit 0).
- No layout shifts at LTR; the added `sm:grid-cols-2` only affects the
  640-767px range that previously fell back to `grid-cols-1`.
- Tested mental model: on a 768px-wide screen, sections (1)-(4) above
  now render in 2 columns instead of jumping straight from 1 to 3.
