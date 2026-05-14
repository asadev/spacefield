# LANTERN — Design Spec
*A festival of paper lanterns rising into a warm midnight sky for Simren Zahra, May 14, 2026.*

## 1. Mood

Warm dark, NOT cold dark. The reference is the lantern release scene from
*Tangled* and a Diwali courtyard at dusk — black-violet sky, but every lantern
bleeds amber that catches the eye and makes you smile. Light is the subject;
the dark is just there to let it glow. Empty most of the time, then a slow
parade of lights drifting up.

## 2. Palette (6 hex codes)

| Token            | Hex       | Use                                         |
|------------------|-----------|---------------------------------------------|
| `--ink-deep`     | `#0a0610` | top of sky, page bg                         |
| `--ink-warm`     | `#1a0e1f` | bottom of sky gradient                      |
| `--ember`        | `#ff9a4d` | core lantern flame, sparks                  |
| `--amber`        | `#ffb56b` | lantern body glow, halo color               |
| `--cream`        | `#fff1d6` | rice-paper highlight, captions, body text   |
| `--gold`         | `#f4c97e` | title accent, cake-sparkler glints          |

Background: `radial-gradient(ellipse at 50% 110%, #2a1530 0%, #1a0e1f 40%, #0a0610 100%)`
— warm ember pooling at the horizon line, deepening to near-black overhead.

## 3. Typography

- **Display** — `Cormorant Garamond` italic 700, used for "Simren" hero, lantern
  captions, sign-off. Has the calligraphic warmth without going full script.
- **Body** — `Inter` 400/500, used for date, small UI, wish bodies.
- **Caption inside lantern** — `Cormorant Garamond` italic 500, smaller size,
  cream color, sits below the photo when expanded.

All loaded via `next/font/google` with `display: "swap"`.

## 4. Lantern SVG (rice-paper, no images)

Each lantern is a self-contained `<svg viewBox="0 0 100 140">` group composed of:

1. **Top cap** — small dark trapezoid (`#1a0e1f` with `--amber` rim).
2. **Body** — rounded rectangle, ~80x90, `fill="url(#paperGradient)"` where
   `paperGradient` is a radial from `#ffd9a8` center → `#ff9a4d` edge.
   Stroke `#ffb56b` at 0.6 opacity. Slight inner vertical fold lines (3 thin
   strokes at 25%, 50%, 75% horizontally, opacity 0.15) suggest paper panels.
2b. **Photo window** — when a lantern carries a photo, a circular clip-path
    (radius ~32) sits centered on the body. Photo goes inside via plain `<img>`
    placed in DOM ABOVE the SVG, positioned with the same transform — NOT
    inside `<foreignObject>` (compatibility). Lantern + img share a wrapper
    div that gets the `transform: translate3d(...)`. The img has
    `border-radius: 50%`, `object-fit: cover`, and a soft inner shadow ring
    in `--amber` at 40% opacity to suggest the rice paper glowing through.
3. **Bottom rope** — short vertical line, two small loops.
4. **Flame** — tiny ellipse `--ember` at the base inside the body, with an
   inner brighter `#ffe0a8` core. Pulses opacity 0.7→1.0 over 1.6s ease-in-out
   infinite alternate (CSS animation).
5. **Halo (sibling element, NOT on the photo)** — a `<div>` placed BEHIND the
   wrapper, same center, larger (~180% size), radial-gradient from
   `rgba(255,181,107,0.55)` center → `transparent` edge, `filter: blur(24px)`.
   This is what gives the warm bleed without ever blurring the photo itself.

Three lantern sizes:
- **small** — 56×78 (background drift, no photo, no caption)
- **medium** — 96×134 (carries one photo, mid-layer)
- **large** — 132×184 (carries one wish, slowest, foreground)

## 5. Motion

Driving principle: **buoyant**. Every lantern moves like it's lighter than
air — slow rise, micro horizontal drift via sine, a tiny rotation wobble
(±2°), no spring snap, no bounce.

### Rise keyframes (CSS, hardware-accelerated)

```css
@keyframes lanternRise {
  0%   { transform: translate3d(var(--driftStart, 0px), 110vh, 0) rotate(-1deg); opacity: 0; }
  6%   { opacity: 1; }
  50%  { transform: translate3d(var(--driftMid, 20px),   40vh, 0) rotate(1.5deg); }
  94%  { opacity: 1; }
  100% { transform: translate3d(var(--driftEnd, -10px), -25vh, 0) rotate(-1deg); opacity: 0; }
}
```

- Duration: **14s** (small), **17s** (medium), **20s** (large)
- Stagger: each lantern in its column starts ~1.6s after the previous
- Each lantern gets randomized `--driftStart/Mid/End` (set inline) so paths
  diverge and feel organic
- Photo lanterns are pinned to the LEFT 60% of the viewport
- Wish lanterns are pinned to the RIGHT 40% column
- Three wave layers with different y-offsets to create depth (back layer
  smaller + dimmer, front layer larger + brighter)

### Tap / click → bring forward

When a lantern is clicked:

1. CSS rise animation pauses (`animation-play-state: paused`)
2. framer-motion `motion.div` (the same wrapper) transitions:
   `position: fixed; left: 50%; top: 50%; x: -50%; y: -50%; scale: 2.4`
3. Background overlay fades in: `rgba(10,6,16,0.78)` with `backdrop-filter: blur(6px)`
4. Caption renders below the enlarged lantern in `--cream`
5. Click anywhere (overlay or close button) → reverse, rise resumes

framer-motion `transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }` —
the cubic out-quart for that "settling" feel.

### Cake sparkler (anchor moment, single section)

A static SVG candle/cake silhouette in the center of one section. **Sparks**:
exactly **24** tiny gold dots (`--gold`, r=1.2), each animated:

```css
@keyframes spark {
  0%   { transform: translate(0,0) scale(1); opacity: 0; }
  10%  { opacity: 0.6; }
  60%  { opacity: 0.4; }
  100% { transform: translate(var(--sx), var(--sy)) scale(0.2); opacity: 0; }
}
```

Random `--sx` ±60px, `--sy` -20 to -120px, random delay 0-2s, duration 1.6-2.4s.
Max opacity capped at 0.6. Background remains MOSTLY EMPTY (no roaming dust,
no global particle field). Sparks ONLY around the cake.

## 6. Page structure (top → bottom, single scroll)

```
[ Hero — fixed-fullbleed sky, "SIMREN" title, "May 14, 2026", three big
  lanterns at the bottom about to release. Visible immediately. ]
       │
       ▼  scroll
[ Memories — paragraph of intro text (italic Cormorant, cream, max-width 36ch,
  centered), then a section where photo-lanterns rise continuously through
  the viewport. Empty space — they float through. ]
       │
       ▼
[ Cake — centered SVG silhouette of a single tier with one tall candle,
  sparks twinkling, label "May 14, 2026 · today" in cream below. ]
       │
       ▼
[ Wishes — wish-lanterns (large) drifting up the right column, photo-lanterns
  continuing on the left. Each wish has its own lantern. ]
       │
       ▼
[ Sign-off — single very large sky lantern centered, slowly rising past
  the viewport with the closing message inside it. ]
```

Total page height: ~520vh. The fixed sky background never moves; only the
content scrolls in front of it. The lanterns themselves are fixed-positioned
and run on time, not scroll.

## 7. The 7 wishes (one per wish-lantern)

1. **May your year be made of soft mornings and loud laughter — both, in equal measure.**
2. **May the people who already love you find new ways to show it.**
3. **May the work you make this year feel like yours, fully.**
4. **May rest find you before you ask for it, and joy find you when you forget to.**
5. **May every room you walk into get a little warmer the moment you arrive.**
6. **May the small wishes — the ones you almost don't say out loud — be the first to come true.**
7. **May twenty-five be kinder to you than the years before, and gentler still than the years after.**

(Lantern 7 is the final sign-off lantern; it carries the closing line:
*"Happy birthday, Simren. The sky's been waiting for you."*)

## 8. Hero copy

- **Eyebrow** (small, cream, letter-spaced): `MAY 14, 2026`
- **Title** (huge, Cormorant Garamond italic, gold→cream gradient text,
  text-shadow `0 0 30px rgba(244,201,126,0.4)`): `Simren`
- **Subtitle** (Cormorant italic, cream 80%): `a sky full of small lights, for you`
- Three large lanterns sit at the bottom edge, gently bobbing (NOT yet rising)
- Below: tiny "scroll" hint with a downward chevron, fading in/out

## 9. Performance & mobile

- Detect `window.matchMedia('(max-width: 640px)')` once on mount, store in state
- Mobile: 8 simultaneous lantern slots (4 photo + 4 wish), small layer disabled
- Desktop: 14 simultaneous slots (8 photo + 6 wish) plus 6 small background
- All animations on `transform` + `opacity` only — no layout thrash
- `prefers-reduced-motion: reduce` → lanterns stop animating, render in static
  scattered positions across the page so the photos are still visible

## 10. Failure-mode checklist (verify before sign-off)

- [ ] Each photo lantern has an `<img src={photoUrl}>` rendered inside it
- [ ] Hero is visible at t=0 (no `whileInView` on title)
- [ ] `metadata.title = { absolute: "Happy Birthday, Simren — Lantern" }`
- [ ] Sparks ≤ 30 total, opacity ≤ 0.6, only around cake
- [ ] No "Asad" anywhere in the file
- [ ] Photos are plain `<img>` (browser EXIF rotation honored)
- [ ] No three.js, no WebGL, no new packages
- [ ] No commits/pushes/dev-server restarts
