# LETTER — Design Spec

A folded letter resting on a softly-lit desk. A deep red wax seal closes it. Tap the seal — it cracks. The letter unfolds (paper-fold 3D). Then the words write themselves out in cursive, paragraph by paragraph, like someone is composing it for Simren in real time. Photos peek out as small printed prints tucked behind the page; pull each one to see it larger. A pencil-sketched cake sits in the margin with five candles you can blow out (cross out). Sign-off is generic ("Yours, always") — never a name.

Period reference: a personal letter from the late 1940s — cream linen paper, fountain-pen ink, brass paper-clip — but rendered in modern CSS, mobile-first.

---

## 1. Color Palette

| Role | Name | Hex | Notes |
|---|---|---|---|
| Desk surface (base) | Walnut Hush | `#5b4634` | Warm dark wood, photographed-grain feel |
| Desk surface (highlight, top-left light) | Honey Glow | `#9a7a55` | Warm light pool from upper-left |
| Letter paper (base) | Cream Linen | `#f3ead4` | Slightly warm off-white, the "paper" |
| Letter paper (shadow / fold creases) | Tea Stain | `#d8c89a` | Soft fold creases & edge shadow |
| Ink (handwriting & lines) | Deep Indigo Ink | `#1f2440` | Fountain-pen ink, never pure black |
| Wax seal | Bordeaux Wax | `#7a1322` | Deep red, rich, with darker veins |
| Wax highlight | Wax Glint | `#c64152` | Specular shine on the seal |
| Brass paper-clip | Antique Brass | `#b08a48` | Subtle metallic highlight |
| Pencil sketch | Graphite | `#3a342b` at 65% opacity | The cake & margin doodles |
| Accent — strikethrough on candles when blown | Faded Pencil | `#6b6357` | Used for "blown" state |

Body text on cream uses `#1f2440` (Deep Indigo Ink). Secondary text uses `rgba(31, 36, 64, 0.6)`.

---

## 2. Typography

All fonts loaded via `next/font/google` (built-in, no install).

| Use | Font | Weight | Style |
|---|---|---|---|
| Cursive body (the letter itself) | **Caveat** | 400, 600 | Hand-feel, varied thickness, looks composed in real time |
| Display heading ("My dear Simren,") | **Sacramento** | 400 | Looped, calligraphic — for salutation + sign-off only |
| Date line / postmark / margin labels | **Cormorant Garamond** | 400 italic | Period serif for tiny annotations |
| UI buttons / "tap to open" prompts | **Cormorant Garamond** | 500 | Restrained, never overpowers the letter |

Sizing (mobile-first, scales up):
- Salutation (Sacramento): `clamp(36px, 7vw, 56px)`
- Body (Caveat): `clamp(20px, 4.2vw, 26px)`, `line-height: 1.55`, `letter-spacing: 0.01em`
- Margin annotations (Cormorant italic): `13–15px`
- Date/postmark: `11px`, `letter-spacing: 0.3em`, uppercase

---

## 3. Layout (mobile-first, but elegant on desktop)

### 3.1 The Desk (full-bleed background)
- `position: fixed; inset: 0; overflow: auto`
- Background: radial gradient — `Honey Glow` at top-left fading into `Walnut Hush`. Plus a subtle wood-grain SVG noise overlay (low opacity).
- Three small "desk objects" rendered with SVG behind the letter (visible on desktop, hidden < 640px to avoid clutter): a fountain pen, an open wax stick on a tiny dish, a postage stamp loose on the desk.

### 3.2 The Letter (centered, the entire stage)
- A rectangular sheet, max-width `min(620px, 92vw)`, aspect ratio about `3 / 4.5` on mobile, `3 / 4` on desktop.
- Cream Linen background with two layers of SVG noise (paper grain + faint horizontal rule lines).
- Soft shadow underneath to lift it off the desk: `0 30px 80px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.35)`.
- A brass paper-clip (SVG) hooked over the top-left edge.
- Tilted very slightly (-1.2deg) for a "placed by hand" feel. Disable tilt on mobile (looks weird in portrait).

### 3.3 Sealed state (initial)
- The letter is shown FOLDED — visible as a tri-fold envelope-like rectangle. The wax seal sits at the center of the front panel.
- A small Cormorant-italic instruction below: *"tap the seal"* with a slow pulse (opacity 0.5 ↔ 0.95, 1.6s loop).
- Tapping anywhere on the seal triggers the crack.

### 3.4 Open / unfolded state (after seal cracks)
Layout from top to bottom inside the unfolded letter:
1. **Postmark row** — top-right corner: `MAY · 14 · 2026` + a faint stamp SVG.
2. **Salutation** — `My dear Simren,` (Sacramento, large, ink color)
3. **Letter body** — 7 paragraphs (the wishes), each one types itself out before the next begins.
4. **Margin sketch** — pencil cake with 5 candles, sits in the right margin around paragraph 3–4. Each candle tappable to "blow out" (strike-through + flame disappears). When all 5 are out, the cake's text label changes from `make a wish` → `wish made.`
5. **Photos tucked in** — a strip of 3–4 small printed photos (whichever are available) peek from behind the bottom of the letter. User taps a photo to "pull it out" — it animates up and enlarges to a centered viewer overlay. A close button returns it.
6. **Sign-off** — `Yours, always —` (Sacramento, italic, ink), then a hand-drawn flourish (SVG squiggle).
7. **PS line** — `P.S. read this again whenever you forget.` (Caveat, smaller, indented)

---

## 4. Animation Timeline

All durations honor: total reveal of primary content ≤ 2 seconds.

| Step | Trigger | Duration | Easing | Detail |
|---|---|---|---|---|
| Initial fade-in (desk + folded letter + seal) | mount | 600ms | `ease-out` | Letter scales 0.96 → 1, opacity 0 → 1. Visible within 1s. |
| Pulse on "tap the seal" hint | mount + 800ms | 1600ms loop | `ease-in-out` | Opacity 0.5 ↔ 0.95 |
| Wax-seal crack | tap seal | 600ms | `cubic-bezier(0.22, 1, 0.36, 1)` | Two halves of seal split outward (-18°/+18° rotate, translate apart 26px), opacity to 0 at end. A subtle "crack line" SVG flashes during. |
| Letter unfold (paper-fold 3D) | seal end (+ 80ms) | 1100ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Two CSS 3D folds (top flap rotateX(-180→0), bottom flap rotateX(180→0)). Inner content opacity 0 → 1 at 70% of fold. |
| Salutation appears | unfold end (+ 120ms) | 500ms | `ease-out` | Sacramento text fades + shifts up 8px |
| Body paragraphs typewriter | sequential, starts after salutation | 50ms per char per paragraph, 350ms gap between paragraphs | linear | Caveat appears char-by-char. Cursor blinks at the active end. |
| Margin cake fade-in | salutation + 400ms | 800ms | `ease-out` | Pencil sketch draws on (SVG `stroke-dashoffset` 0 animation) |
| Photo strip slide-up | last paragraph done + 400ms | 600ms | `ease-out` | The strip translates from y+40px to 0, opacity 0 → 1 |
| Sign-off | last paragraph done + 1200ms | 600ms | `ease-out` | Sacramento + flourish reveal |
| Candle "blow out" | tap | 350ms | `ease-out` | Flame SVG opacity 1 → 0 + tiny smoke puff (a small white blob fades up & out), candle line gets a strike-through |
| Photo "pull out" enlarge | tap photo | 450ms | `cubic-bezier(0.16, 1, 0.3, 1)` | FLIP-style transform from thumb position to centered overlay |

Skip control: a small `skip ▸` button in the top-right (visible after seal is cracked) jumps straight to the fully-rendered state. Important for accessibility AND for re-visits — a friend doesn't want to watch the typewriter every load.

`prefers-reduced-motion`: all animations collapse to instant or 200ms fades. The typewriter renders the full text immediately. The wax-seal crack still happens (tap is part of the experience) but as a single 200ms cross-fade, no rotations.

---

## 5. Animation Principles

1. **The letter is the hero.** Everything else (desk, pen, stamp) is dimmer and lower contrast. No element competes with the paper.
2. **Imperfection.** Slight rotations, hand-drawn SVG strokes (jittered control points), variable letter spacing on cursive. Avoid anything that screams "computer."
3. **Pacing of intimacy.** The typewriter is slow on purpose — slow enough to feel like reading over someone's shoulder, fast enough that nobody bails. ~50ms/char averages a 100-char paragraph in 5 seconds.
4. **Tactile micro-interactions.** Seal crack, candle blow, photo pull — each has a sound-shaped motion (overshoot + settle), not a linear fade.
5. **Light from upper-left, always.** Shadows fall to the lower-right on every floating element. Desk light, paper shadow, seal glint all consistent.
6. **No glow effects.** This is paper, not a screen. No `filter: blur` halos. Use real shadows + warm tints instead.

---

## 6. Content — The Letter Itself

> Salutation, 7 paragraphs, sign-off, P.S. Voice: warm, specific, written by someone who knows her, addressed to her on her birthday — never sappy, never generic, never a sentence that could be on a Hallmark card. Avoid "amazing", "incredible", "you deserve". No emojis. Period-letter cadence — a few longer sentences, occasional dashes, gentle wit.

**Salutation:**
*My dear Simren,*

**Paragraph 1 — date opener:**
> It is the fourteenth of May, and somewhere in the world a kettle is whistling, a sparrow is being insufferable, and you have arrived at another year. I thought I would write it down rather than say it — the page keeps better than my voice does.

**Paragraph 2 — what you are:**
> You are the kind of person who notices things. The unimportant ones especially: a song someone half-hummed, the way a friend's mood turns three sentences before they admit it, a wrong colour on the wrong wall. That noticing is not small. Most people walk past what you stop to see.

**Paragraph 3 — the funny one:**
> I will not pretend you have no faults. You overthink your text messages, you treat sleep as a hobby you keep meaning to take up, and your standards for tea would unsettle a duchess. These are also the reasons people stay.

**Paragraph 4 — the soft one:**
> When the year was hard, you did not become smaller. You did the unglamorous work of staying yourself — answering messages you did not feel like answering, showing up to rooms that asked too much of you, being kind to people who had not yet earned it. That is a quieter kind of brave.

**Paragraph 5 — the wish that is also a dare:**
> So this is what I want for you, this year: a little more selfishness, a little more trouble, a little more of the thing you keep almost ordering and then don't. Take the longer route home. Buy the absurd flowers. Reply later than is strictly polite.

**Paragraph 6 — the witnesses (gestures at the photos):**
> The pictures tucked behind the page are evidence, not decoration. Proof that you have been collected — by people, by places, by ordinary afternoons that turned out to matter more than they advertised. Pull them out if you forget.

**Paragraph 7 — the close:**
> Twenty-six is not a number, it is a doorway. Walk through it slowly. Look around. The room is yours.

**Sign-off line (Sacramento, italic):**
*Yours, always —*

**Flourish:** a hand-drawn SVG squiggle (no name).

**P.S. (Caveat, smaller, indented from left):**
*P.S. read this again whenever you forget.*

(Note on age: "Twenty-six" is the only specific age detail. If wrong, swap; the rest of the letter is age-agnostic. Five candles on the cake are symbolic, not literal — five wishes, one per blow.)

---

## 7. Component Responsibilities

- `page.tsx` — server component. Reads photos via fs glob, exports metadata with `title: { absolute: ... }`, renders `<LetterExperience photos={...} />`.
- `LetterExperience.tsx` — client component (`"use client"`). Owns:
  - Desk + letter chrome
  - Wax-seal crack state machine: `sealed → cracking → cracked → unfolding → open`
  - Typewriter sequencer (paragraphs in order, with skip)
  - Candle state (5 booleans)
  - Photo lightbox state
  - Reduced-motion check via `window.matchMedia('(prefers-reduced-motion: reduce)')`

State diagram:
```
  sealed --(tap)--> cracking --(600ms)--> cracked --(80ms)--> unfolding --(1100ms)--> open
                                                                                       |
                                                                                       └─ typewriter starts (auto)
                                                                                       └─ skip button visible
```

---

## 8. Accessibility

- Wax-seal is a real `<button>` with `aria-label="Open the letter"`.
- Skip button is a real `<button>` with `aria-label="Skip animation and read the full letter"`.
- Letter content is rendered in the DOM as plain text from the start (the typewriter masks it via `clip-path` or character slicing) so screen readers get the whole letter immediately. Keep the underlying text in a single `<article>` element.
- Photos in the strip are real `<button>`s wrapping `<img>`. Each `img` has descriptive `alt="Simren — moment N"`.
- Candle buttons have `aria-label="Blow out candle N"`.
- All tap targets ≥ 40×40px on mobile.
- Color contrast for indigo ink (`#1f2440`) on cream (`#f3ead4`): ratio ~ 12.5 : 1 — well past WCAG AAA.

---

## 9. Mobile vs Desktop

- **Mobile (< 640px):** desk objects (pen/stamp/wax stick) hidden. Letter takes ~92vw, no rotation. Photo strip wraps to 2 columns under the letter. Candle is rendered slightly smaller and sits below paragraph 4 instead of in the margin (margins don't exist on mobile). Typewriter speed bumped to 35ms/char (mobile users are more impatient).
- **Desktop (≥ 1024px):** desk objects visible at low opacity. Letter tilted -1.2deg. Cake stays in the right margin. Photo strip wraps along the bottom edge of the letter. Typewriter at 50ms/char.

---

## 10. Risk Register (for Builder & Inspector)

1. ❗ Title metadata template leak — must use `title: { absolute: ... }`.
2. ❗ Hero must be visible within 1s — initial mount fade ≤ 600ms, NO `whileInView` on hero.
3. ❗ `backdrop-filter: blur` must NOT be applied to any element containing text. If used at all, only on a sibling background layer.
4. ❗ Total opening sequence (folded → fully unfolded, content readable) ≤ 2s. Typewriter can run after — but the letter must be visibly open and at least the salutation visible by t=2.0s.
5. ❗ Photos must be `<img src=...>` (browsers honor iPhone EXIF). NEVER `<Image>` — it strips orientation in some configs.
6. ❗ Photo cards / pinned-photo components must contain the actual `<img>` inside their JSX, not be placeholder boxes.
7. ❗ Cake candles must be children of the cake's top-tier element, positioned relative to it — not absolutely positioned to the page.
8. ❗ Sign-off must NEVER include "Asad" or any name. "Yours, always —" only.
9. ❗ Particle/desk-dust effects ≤ 80 mobile / ≤ 200 desktop, opacity ≤ 0.5, behind content.
10. ❗ Recipient: "Simren" / "Simren Zahra". Date: "May 14, 2026".

— end of spec —
