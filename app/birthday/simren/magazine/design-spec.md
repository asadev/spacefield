# MAGAZINE — Design Spec
**Issue No. 14 — May 2026 — Vol. I**

A Vogue / T Magazine / The Gentlewoman cover story for Simren Zahra. Editorial restraint is the entire game. If you read this and reach for a glow effect, stop.

---

## 1. Palette (4 hex codes, hard cap)

| Token       | Hex      | Use                                             |
|-------------|----------|-------------------------------------------------|
| `--cream`   | `#fafaf7` | Page background, full-bleed                    |
| `--ink`     | `#15140f` | Body text, masthead, page numbers              |
| `--sub`     | `#5a564c` | Captions, plate numerals, trackers, hairlines  |
| `--accent`  | `#a8321a` | Cover-line callouts, drop cap, "FIN", barcode  |

Rules:
- Body text NEVER lighter than `--sub` (#5a564c). Captions are #5a564c on cream — passes WCAG AA.
- Drop caps and "Plate I/II/III" numerals use `--accent` for editorial pop. Sparingly.
- No gradients. No shadows except a single 1px hairline on photo plates. No glow.

---

## 2. Typography (next/font/google)

```ts
import { Fraunces, Manrope } from "next/font/google";
const display = Fraunces({ subsets: ["latin"], weight: ["300","400","500","700","900"], style: ["normal","italic"], variable: "--font-display" });
const body    = Manrope({ subsets: ["latin"], weight: ["300","400","500","600","700"], variable: "--font-body" });
```

| Role                    | Font           | Mobile (375)              | Desktop (1280+)            | Notes                                  |
|-------------------------|----------------|---------------------------|----------------------------|----------------------------------------|
| Cover title "SIMREN"    | Fraunces 900   | 88px / 0.85 / -0.04em     | 220px / 0.82 / -0.045em    | Optical-size 144, slight italic OFF   |
| Cover subtitle          | Fraunces 300i  | 14px / 1.4 / 0.06em       | 18px / 1.4 / 0.08em        | uppercase tracking                    |
| Masthead                | Manrope 600    | 10px / 1 / 0.32em         | 11px / 1 / 0.36em          | uppercase, letter-spaced wide         |
| Section label           | Manrope 500    | 10px / 1 / 0.36em         | 11px / 1 / 0.4em           | uppercase, accent rule beneath        |
| Spread headline         | Fraunces 400   | 36px / 1.05 / -0.02em     | 64px / 1.02 / -0.025em     | mixed weights, italic for emphasis    |
| Body paragraph          | Manrope 400    | 16px / 1.62 / -0.005em    | 18px / 1.7 / -0.005em      | max-width 60ch                        |
| Drop cap                | Fraunces 900   | 64px (4 lines)            | 96px (4 lines)             | accent color, float left, mr 12px     |
| Pull-quote              | Fraunces 300i  | 28px / 1.25 / -0.02em     | 56px / 1.18 / -0.025em     | italic, hairline rule left            |
| Caption                 | Manrope 400    | 11px / 1.45 / 0.04em      | 12px / 1.5 / 0.05em        | uppercase, --sub                      |
| Page number             | Manrope 500    | 10px / 1 / 0.2em          | 11px / 1 / 0.24em          | tabular-nums                          |
| Colophon body           | Manrope 300    | 12px / 1.7 / 0.02em       | 13px / 1.8 / 0.03em        | --sub                                 |

Margins: mobile 24px gutter, desktop 80px gutter. Generous. Real magazines breathe.

---

## 3. Spread-by-spread layout

The whole experience is a single full-bleed scroller with `position:fixed; inset:0; overflow:auto`. Sections stack vertically, each ~100vh minimum. **The first spread (cover) MUST render fully visible at t=0.** No `whileInView` on hero. Use plain `animate` with a 600ms cover-title rise.

### Spread 1 — COVER (100vh, the hero)
- Full-bleed `<img>` of `photos[0]`, `object-fit: cover`, slight desaturate filter (95%) for editorial feel
- Subtle vignette via a sibling absolute div (NOT backdrop-filter — gradient overlay)
- Top: masthead bar — left "SIMREN" wordmark in tiny caps, center "ISSUE NO. 14 — MAY 2026 — VOL. I", right "EDITION D'ANNIVERSAIRE"
- Big serif "SIMREN" anchored bottom-left, breaking out of margins, 220px desktop
- Cover-line teasers floating top-right and bottom-right (3 lines, accent color, ≤6 words each):
  - "ON LIGHT, AND THE WOMEN WHO CARRY IT"
  - "TWENTY-THREE: A FIELD GUIDE"
  - "PLATES I–IV / A CENTERFOLD / SEVEN WISHES"
- Bottom-right: faux barcode (CSS bars) + "£14 · €17 · USD 18 · MAY MMXXVI"
- Page number: "01" bottom-left corner, tiny

### Spread 2 — FOREWORD (Editor's Letter)
- Section label centered top: "FROM THE EDITOR — A NOTE ON SIMREN"
- Headline (Fraunces): "The light, kept."
- 3 short paragraphs of editorial prose, opening paragraph with a large accent drop cap "T"
- Right column: a tall thin photo plate with `photos[1]`, captioned "Plate I — *Untitled (interior, afternoon)*"
- Two-column on desktop, single column mobile
- Page numbers: "02 — 03"

### Spread 3 — PLATE II (full-bleed photo)
- `photos[2]` full-bleed, ~95vh
- Bottom-left overlay block: small "PLATE II" + italic title "*A study in posture*" + 1-line caption
- Page number "04"

### Spread 4 — PLATE III + COLUMN (asymmetric)
- Left 60%: `photos[3]` plate
- Right 40%: a vertical column with section label "ON HER", a Fraunces 400 heading "She walks into a room and the room rearranges itself.", and 2 short paragraphs
- Page numbers "05 — 06"

### Spread 5 — CAKE CENTERFOLD (illustrated, 100vh)
- The "fold" is suggested by a thin vertical line down the page center
- Left half: section label "CENTERFOLD — THE CAKE", headline "Twenty-three candles, one wish."
- Right half: an SVG illustration of a 2-tier cake (cream + accent), 23 thin candle lines with single flame strokes, a banner ribbon over it reading "MAY · XIV · MMXXVI"
- Bottom: tiny italic caption "Illustrated for this issue."
- Page numbers "07 — 08"

### Spread 6 — PLATE IV (two-column with caption)
- Left: tall portrait `photos[4]`
- Right: caption block — "PLATE IV", italic title "*Late afternoon, west-facing*", and a 4-line paragraph reflecting on the photo
- Page numbers "09 — 10"

### Spread 7 — PULL-QUOTE PAGES (the wishes, 7 of them)
- Each wish is its own spread (or two-up on desktop), ~85vh
- Layout: thin vertical accent rule on the left (1px wide, 60% page height), wish in Fraunces 300 italic, large
- Below each: tiny "—" + "WISH 01 / VII" style indicator (NO byline name)
- Page numbers continue: "11 — 17"

The 7 wishes (editorial pull-quote voice — clipped, declarative, slightly literary, not cheesy):

1. **"That the year ahead unfold the way good chapters do — slowly, then all at once."**
2. **"That every room you enter remember you for the right reasons."**
3. **"That the work you make outlives the noise around it."**
4. **"That you keep the friends who tell you the truth and lose the ones who flinch from it."**
5. **"That mornings stay yours, and nights stay easy."**
6. **"That whatever you are building this year quietly arrives."**
7. **"That twenty-three feels less like a number and more like a doorway you walked through on purpose."**

### Spread 8 — PLATE V + CLOSING (mixed)
- Top half: `photos[5]` half-bleed centered, captioned "Plate V — *The cover, unedited.*"
- Bottom half: short closing essay, 1 paragraph, ends with em-dash and "**FIN**" in accent

### Spread 9 — COLOPHON / IMPRINT (the back page)
- Centered, generous whitespace
- Top: "COLOPHON"
- Body (small, --sub):
  - "This issue was set in Fraunces and Manrope."
  - "Printed for one reader, in an edition of one, on the fourteenth of May, two thousand and twenty-six."
  - "Publisher: Maison Cinq — a fictitious press."
  - "Editor-at-large: anonymous."
  - "Photography: from the personal archive."
  - "All errors, ours."
- Bottom: large centered "END OF ISSUE NO. 14"
- Page number: "XVIII" (Roman, switching style for the back matter)

---

## 4. Page-turn transition (subtle, ≤400ms)

This is the ONE motion flourish. Implementation:

- Wrap each spread in `<motion.section>` with:
  - `initial={{ rotateY: 6, opacity: 0.85, transformOrigin: "left center" }}`
  - `whileInView={{ rotateY: 0, opacity: 1 }}`
  - `viewport={{ once: true, amount: 0.25 }}`
  - `transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}`
- **EXCEPT spread 1 (cover)** — uses `animate`, not `whileInView`. Cover title rises from y=24, opacity 0→1, duration 0.7s, delay 0.15s. Cover photo opacity 0→1, duration 0.5s, no delay.
- Container has `perspective: 2400px` so rotateY actually reads 3D
- `prefers-reduced-motion`: respect — disable rotateY, keep opacity fade only
- No transition exceeds 400ms except the cover title rise (700ms is the only exception, justified — it's the curtain raise)

---

## 5. Drop-cap treatment

- First letter of foreword headline paragraph AND first letter of closing essay
- Fraunces 900, accent color, ~4 line-heights tall
- `float: left`, `padding: 4px 12px 0 0`, `line-height: 0.85`, slight negative `margin-top` (~4px) to optically align top
- On mobile, drop cap is 3 lines tall, not 4

---

## 6. Hairlines & rules

- Section labels: 24px wide accent rule centered beneath, 1px tall
- Pull-quote left rule: 1px solid `--sub`, full quote height, 16px gap
- Centerfold spine: 1px solid `--sub` at 50% opacity, vertical center
- No other borders. No box-shadows. No outlines except focus.

---

## 7. Mobile vs desktop

- Mobile (375px): single-column everything. Cover title shrinks but stays the dominant element. Plates stack. Two-column spreads collapse to one column with photo first.
- Desktop (1280px+): real two-column spreads. Generous side gutters (80px). Cover title goes 220px.
- Use `clamp()` for fluid scaling between breakpoints where natural.

---

## 8. Failure-mode preflight (Builder MUST verify)

1. Cover photo + cover title visible at t=0 (use `animate`, not `whileInView`)
2. No `backdrop-filter: blur` on any text container
3. No reveal animation > 700ms (cover) or > 400ms (sections)
4. Every plate component has its `<img>` rendered inside (verify by re-reading JSX)
5. Body text minimum #2a2a2a — we use #15140f (`--ink`) for body, #5a564c (`--sub`) for captions only
6. Title metadata: `title: { absolute: "Happy Birthday, Simren — Magazine" }`
7. NO occurrence of "Asad" anywhere. Sign-off is "FIN" / "END OF ISSUE NO. 14"
8. `<img>` plain tags (browser EXIF rotation honored)
9. `position: fixed; inset: 0; overflow: auto` wrapper
10. Recipient strings: "Simren" / "Simren Zahra" / "May 14, 2026" only

---

End of spec.
