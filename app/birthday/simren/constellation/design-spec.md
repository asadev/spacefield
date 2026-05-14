# CONSTELLATION — Design Spec

A celestial cartography chart for Simren Zahra. Vintage star atlas, hand-drawn feel, gold-foil ornament on deep navy. Type does the heavy lifting — motion is restrained.

---

## 1. Palette (5 hex codes)

| Token            | Hex       | Use                                     |
|------------------|-----------|-----------------------------------------|
| `--ink-deep`     | `#050a1a` | Bottom of background gradient (vignette)|
| `--ink-navy`     | `#0a1428` | Top of background gradient (chart field)|
| `--gold`         | `#d4a949` | Primary ornament strokes, frames        |
| `--gold-bright`  | `#e9c87a` | Title illumination, key labels (≥70% sat)|
| `--cream`        | `#efe4c7` | Body / readings text on navy            |

Supporting derivations (computed in CSS, not new tokens):
- Hairline: `rgba(212,169,73,0.42)` — constellation lines
- Ghost grid: `rgba(212,169,73,0.08)` — coordinate ticks
- Star fill: `rgba(239,228,199,0.55–0.95)` — varied per star

Contrast: `--cream` on `--ink-navy` ≈ 11.3:1 (AAA). `--gold-bright` on `--ink-navy` ≈ 8.9:1 (AAA).

---

## 2. Typography

`next/font/google`:
- **Cinzel** — display / title illumination (weights 500, 600, 700)
- **Cormorant Garamond** — body, readings, captions (weights 300, 400, 500; italic 400)

Sizes (mobile / desktop):
- Hero title `THE SIMREN ZAHRA / CELESTIAL CHART` — Cinzel 600, `clamp(28px, 7vw, 64px)` line-height 1.1, letter-spacing 0.18em
- Hero subtitle `MAY • XIV • MMXXVI` — Cinzel 500, `clamp(13px, 2.4vw, 18px)`, letter-spacing 0.42em
- Section eyebrow (e.g. `THE READING`) — Cinzel 500, 12px / 13px, letter-spacing 0.5em, color `--gold`
- Wish numeral (Roman I–VII) — Cinzel 700, `clamp(36px, 5vw, 56px)`, color `--gold-bright`
- Wish body — Cormorant Garamond 400 italic, `clamp(18px, 2.4vw, 24px)`, line-height 1.55, color `--cream`
- Coordinate label — Cinzel 500, 9px / 10px, letter-spacing 0.3em, color `--gold`
- Marginalia caption — Cormorant Garamond 300 italic, 12px / 13px, color `rgba(239,228,199,0.7)`

Font-feature-settings on display: `"smcp" 0, "lnum" 1, "kern" 1`.

---

## 3. Chart Layout (SVG viewBox `0 0 1000 1400`)

Mobile renders the same viewBox; SVG `preserveAspectRatio="xMidYMid meet"` so the chart scales as a unit.

### Chart frame
- Outer ornament rectangle: `48,48 → 952,1352`, stroke `--gold` 1.2px
- Inner hairline rectangle: `64,64 → 936,1336`, stroke `rgba(212,169,73,0.42)` 0.6px
- Four corner cross marks (`+` 16px, gold 1px) at the inner corners
- Compass rose (top-right inside frame) at `(820, 160)`, radius 56, ornamental only (N/E/S/W in Cinzel 500, 9px)
- Latitude meridian arcs: three faint semicircular arcs centered on `(500, 700)` at radii 280, 460, 620 — `rgba(212,169,73,0.10)` 0.5px stroked, dasharray `2 5`
- Coordinate grid: 10×14 dotted grid, dot radius 0.6, `rgba(212,169,73,0.08)`

### Photo positions (9 photos as celestial bodies)

All `cx, cy, r, label, coord` — placed to compose pleasingly and form a constellation that suggests an upward gesture (a flame / wing shape).

| # | Photo | cx  | cy   | r  | Label              | Coord            |
|---|-------|-----|------|----|--------------------|------------------|
| 1 | p[0]  | 200 | 380  | 70 | URSA SIMRA         | 14° 26′ N        |
| 2 | p[1]  | 380 | 250  | 60 | LUMEN PRIMA        | 22° 04′ E        |
| 3 | p[2]  | 580 | 200  | 55 | STELLA CORDIS      | 31° 18′ N        |
| 4 | p[3]  | 760 | 320  | 65 | CORONA ZAHRA       | 09° 47′ W        |
| 5 | p[4]  | 500 | 480  | 90 | NUCLEUS (Ascendant)| 0° 00′           |
| 6 | p[5]  | 280 | 700  | 60 | VESPER LUNA        | 17° 52′ S        |
| 7 | p[6]  | 720 | 720  | 60 | IGNIS DULCIS       | 08° 11′ E        |
| 8 | p[7]  | 460 | 920  | 65 | AURIGA NOVA        | 25° 39′ N        |
| 9 | p[8]  | 600 | 1100 | 55 | CAUDA AETERNA      | 12° 03′ S        |

Each photo body:
- White-cream backing circle `r+6`, fill `rgba(239,228,199,0.06)`, stroke `--gold` 1.2px
- Inner photo via `<img>` wrapped in a div with `clip-path: circle(50%)` positioned absolutely to match SVG circle (overlay technique — SVG and HTML grids share the same scaler).
- Ring tick marks: 8 small ticks just outside the frame circle (4px lines, `rgba(212,169,73,0.55)`)
- Label arc: hand-drawn ribbon under the photo (small SVG path) carrying `Label · Coord` in Cinzel 500, 9–10px

### Constellation lines (ALL hairlines `rgba(212,169,73,0.55)` 0.7px, with `stroke-dasharray` reveal)

Connections (forming a wing):
- 1 → 2, 2 → 3, 3 → 4 (top arc)
- 1 → 5, 5 → 4 (mid bowl)
- 5 → 6, 5 → 7 (downward fork)
- 6 → 8, 7 → 8 (V to lower star)
- 8 → 9 (tail)

Total 10 lines. Each line has a small filled gold dot (r=2) at each end-point that overlaps the photo ring.

### Cake marginalia
Bottom-left of chart, outside the photo grid, at `(140, 1240)`:
- Tiny labeled mini-constellation: 5 dots forming a candle-and-flame shape
- Hand-lettered caption beneath: `*Constellatio Tortae · A small confection observed at noon*` (Cormorant italic 11px, cream 70%)
- A 1px gold bracket pointing to it from the main chart edge

### Title block (hero)
Sits on top of the chart, centered horizontally, top third:
- Eyebrow `· OBSERVED ON THE FOURTEENTH OF MAY ·` (Cinzel 500, 11px, gold)
- Three-line title in Cinzel 600 (illuminated):
  - Line 1: `THE SIMREN ZAHRA`
  - Line 2: `CELESTIAL CHART` (slightly larger / accented)
  - Line 3: `MAY · XIV · MMXXVI` (Cinzel 500, smaller, letter-spacing 0.42em)
- Two horizontal gold rules above and below (1px, 90px wide, with a centered diamond glyph ◆)

### Background star field
- Mobile: 60 stars; Desktop: 120 stars
- Deterministic seeded positions (no Math.random in render — use a small LCG seeded on index)
- Star size: r 0.6 – 1.6, fill `rgba(239,228,199, 0.25–0.55)` — never above 0.55 opacity in field background
- A small set (8) of "highlighted" stars get a 4-pointed cross-glint (CSS) at 0.85 opacity

---

## 4. Animation Timeline (opening reveal ≤ 2.5s, each step ≤ 1.5s)

All via framer-motion `animate` (NEVER `whileInView` for hero) — hero MUST be visible inside 1s.

| t (s) | Element                         | Animation                                    | Duration |
|-------|---------------------------------|----------------------------------------------|----------|
| 0.00  | Background gradient + star field| `opacity 0→1`                                | 0.4s     |
| 0.15  | Outer chart frame + corner ✕    | `opacity 0→1`, `pathLength 0→1` on frame     | 0.8s     |
| 0.40  | Title eyebrow + rules + diamond | `opacity 0→1, y 8→0`                         | 0.6s     |
| 0.55  | Title 3 lines (stagger 0.08s)   | `opacity 0→1, letterSpacing 0.32→0.18em`     | 0.7s ea. |
| 0.80  | Photo backing circles + frames  | `opacity 0→1, scale 0.92→1` (stagger 0.05s)  | 0.5s ea. |
| 1.10  | Photo `<img>` fade-in           | `opacity 0→1`                                | 0.4s     |
| 1.30  | Coord labels + ring ticks       | `opacity 0→1`                                | 0.4s     |
| 1.50  | Constellation hairlines         | `stroke-dashoffset → 0` (stagger 0.08s)      | 0.9s ea. |
| 2.20  | Compass rose, meridian arcs     | `opacity 0→1`                                | 0.3s     |

Total opening: complete by ~2.45s. Title visible at 0.55s.

### Scroll-driven micro-motion
Using `useScroll` on the scroller div + `useTransform`:
- Chart `scale`: 1.00 → 1.05 across full scroll (very subtle zoom)
- Star field opacity: 1 → 0.5 (recedes as readings come forward)
- A second batch of constellation lines (between 5↔6, 5↔7) given +0.4 opacity in the second screen
- Photo bodies: each gets a `rotate(-1deg → +1deg)` based on its index parity, max 1.2°, spread over scroll — barely perceptible drift

NO continuous loops, NO spinning, NO pulse. Reduced-motion: skip everything except opacity fades.

---

## 5. Page sections (vertical scroll)

1. **Hero / Chart** (100vh, fixed-position SVG chart fills viewport with title overlaid)
2. **Legend** (one screen): "A LEGEND" — explains the chart in one sentence + lists each of the 9 stars with its name and coordinate (text-only, two-column on desktop, single-column on mobile)
3. **The Reading** (multi-screen): "BIRTHDAY READINGS · I — VII" — seven wishes, each on its own card, with Roman numeral, eyebrow ("FIRST READING / SECOND READING / …"), and a single thin gold rule below
4. **Marginalia · The Cake** (one screen): the small cake constellation drawn at chart-margin scale, with a hand-lettered caption + invitation to make a wish
5. **Colophon** (footer): "Compiled by hand · Bound in gold · For Simren · MMXXVI" + a single ornamental star

---

## 6. The Seven Readings (full text, astrological-reading voice)

Punctuation: em-dashes, semicolons, ampersands. Slightly archaic.

> **I — FIRST READING · OF THE NATAL HOUR**
> The chart marks an auspicious convergence; the moon, having waited politely all night, takes her position above your horizon. What this means, plainly: the year ahead has been preparing the room before your arrival. Step into it.

> **II — SECOND READING · OF THE INNER CONSTELLATION**
> Stars that did not believe in themselves have been observed, this season, beginning to. The astronomers — & here we mean the people who have always loved you — record this with quiet relief. Continue.

> **III — THIRD READING · OF THE WORK OF THE HANDS**
> Mars in your seventh house indicates labour rewarded; not loudly, but in the manner of a tide returning a thing thought lost. Make what you mean to make. The instruments are tuned in your favour.

> **IV — FOURTH READING · OF KIND COMPANY**
> The chart shows three close-orbiting bodies — friendship, family, & a love yet to be named. Treat each as you would a rare star: notice it, record it, do not assume it will return on its own.

> **V — FIFTH READING · OF REST**
> Venus, that patient planet, advises against the fashionable virtue of exhaustion. You are permitted to sleep. You are permitted to do nothing on a Tuesday. The cosmos has prepared no test for which rest is the wrong answer.

> **VI — SIXTH READING · OF SOFTNESS**
> Soft things, the chart insists, are not small things. The reed bends; the stone does not; & yet only one of them survives the river. Be reed-like; be river-like; be, in any case, exactly what you already are.

> **VII — SEVENTH READING · OF THE YEAR ITSELF**
> Twenty-six is a long, slow exhale. The astrologers — & here we mean those of us who have done the looking — predict a year that arrives the way good light does: quietly, on its own schedule, & all at once into the room you happen to be standing in.

---

## 7. Component-level notes for Builder

- Use a single `<svg viewBox="0 0 1000 1400">` for the chart frame, grid, stars, constellation lines, ornament, frame circles, labels.
- Place `<img>` photos as **absolutely-positioned HTML siblings** on top of the SVG, sized by viewBox-relative percentages (compute `cx/1000 * 100%` and `cy/1400 * 100%` and r similarly). The chart container is `position: relative`, and the SVG fills it; images are positioned over the SVG circles.
- Wrap the chart container in a fixed-aspect box (aspect-ratio `1000/1400` or capped to viewport) so SVG and HTML overlay always align at any width.
- Self-tests in builder: log photo count; if 0, render a graceful "Chart awaiting observation" message in the same style; never crash.
- Use `useReducedMotion` and disable transforms when true.
- Single client component file. No new packages.
- Verify: title strings exact; no "Asad"; metadata absolute.
