# ATELIER — Design Spec

A designer's mood board. Cream linen / cork board, photos pinned with brass tacks
and washi tape, hand-cut paper notes scattered around, scribbled annotations,
fabric swatches in corners. Lived-in, curated, slightly chaotic. Layered depth.

## Palette
- `--cream`        `#f4ead8`  — main board (warm linen)
- `--cream-deep`   `#e8dcc2`  — deeper linen patches / paper undertone
- `--linen-warm`   `#efe4cc`  — slightly warmer cream for paper notes
- `--ink`          `#2a2a2a`  — primary text (NOT lighter — must be readable)
- `--ink-soft`     `#5a4a3a`  — secondary annotations / italics
- `--brass`        `#b8923f`  — brass tacks, accent metal
- `--brass-deep`   `#8b6f2f`  — deep brass shadow / pin shadow
- `--rose`         `#c97a76`  — fabric accent #1 (dusty rose)
- `--sage`         `#9aab8c`  — fabric accent #2 (eucalyptus sage)
- `--cream-paper`  `#fffdf6`  — bright paper notes (post-it pop)
- `--postit-pink`  `#f5c8c4`  — post-it pink note
- `--kraft`        `#c8a878`  — kraft paper note
- `--manila`       `#dcc591`  — manila tag
- `--ruled-blue`   `#8aa3c2`  — ruled paper line color (subtle)

## Typography (next/font/google)
- **Caveat** — handwriting (annotations, pinned notes, scribbles)
- **Sacramento** — script title accents ("atelier no. 14")
- **Cormorant Garamond** — serif labels ("SIMREN", price tags, captions in caps-spaced)
- Apply as className on relevant elements; never on a wrapper that would also
  carry blur. NEVER blur text containers.

## Board Layout

### Hero / Title strip (top of board)
- Sacramento "atelier no. 14" overlaid on a Cormorant SIMREN in display caps
- Subtitle: "MAY · 2026" in spaced Cormorant
- Painted-script masthead with hand-painted brushstroke underneath
- Use `animate` (NOT `whileInView`) — must appear within 1s

### Pinned-photo board (main canvas)
Desktop (>= 900px): 2D collage in a max-width 1200px region.
Photos absolutely positioned with rotations, overlapping, with brass-tack pin
in one corner OR washi tape strip across the top.

Photo positions (approximate, on a 1200x1400 stage):
- p0 — top-left,    x=80,    y=80,   w=240, rot=-4°,  pin top-left,    tape NONE
- p1 — top-mid,     x=380,   y=40,   w=220, rot=2°,   tape top center, pin NONE
- p2 — top-right,   x=720,   y=120,  w=260, rot=-3°,  pin top-right,   tape NONE
- p3 — mid-left,    x=140,   y=420,  w=200, rot=5°,   tape diagonal,   pin NONE
- p4 — center,      x=440,   y=380,  w=300, rot=-2°,  TWO pins (top-l + top-r)
- p5 — mid-right,   x=820,   y=460,  w=220, rot=4°,   pin top-center
- p6 — bot-left,    x=200,   y=820,  w=240, rot=-3°,  tape top-center
- p7 — bot-mid,     x=520,   y=900,  w=220, rot=3°,   pin top-left
- p8 — bot-right,   x=820,   y=860,  w=240, rot=-5°,  tape top-right diagonal

If fewer than 9 photos, repeat positions in cycle (still good).
On hover/tap: photo lifts (translateY -8, scale 1.06, rotate->0), shadow deepens.
A magnified panel can appear above board on click (modal-style on mobile).

Around the photos, scatter:
- Color-chip swatches (small rounded-square pieces of fabric color, also pinned)
- Hand-cut paper triangles peeking from behind photos
- Scribbled annotations in Caveat ("← keep this one", "↑ palette", "fabric: dusty rose")

Mobile (< 900px): RESTRUCTURE entirely.
Single column, vertical scroll. Each photo full-width-ish (90vw) with its own
brass pin/tape, slight rotation (smaller, ±2°), generous vertical spacing.
NO absolute positioning on mobile — flex column.

### Cake (designer's process sketch)
A loose pencil-sketch of a 3-tier cake with arrows + handwritten annotations:
- "3 tiers"
- "vanilla bean — not too sweet"
- "pistachio + rose buttercream?"
- "candles → 14? maybe just one big one"
- "cake board: kraft + twine"
SVG line-art (rough, hand-drawn feel via slight pencilWobble filter).
Pinned to board with brass tack at top.

### Wishes (scrap-paper notes)
7 wishes, each on a different scrap-paper texture pinned around lower board:
1. Ruled notebook page — "May this year be the kindest one yet — and may you notice every soft moment of it."
2. Kraft paper — "May your laugh stay loud and your worries stay small."
3. Post-it pink — "May the people who already love you find a thousand new reasons to."
4. Manila tag (with twine hole) — "May the ordinary days feel like enough."
5. Cream cardstock — "May you be brave on the days that ask for brave."
6. Torn-edge cream — "May every door you knock on open a little wider than expected."
7. Lined index card — "Lucky world, having you in it. Today especially."

Each note: distinct paper texture, slight rotation (±5°), pinned with brass tack
or strip of washi tape. Caveat font for the wish text.

### Sign-off — price-tag
Manila price-tag shape (with hole punched + twine string) hanging from the
top of a section, with hand-stamped serial-style number reading:
- "MADE WITH CARE"
- "no. 5/14/26"
- small "happy birthday, Simren" in Caveat

## Animation Principles
- Hero: `animate` from `initial` (NOT whileInView). Title visible within 1.0s.
- Photo pinned-cards: subtle fade-up + rotate-to-final on whileInView, stagger
  by index (0.05s steps, max 0.4s).
- Hover lifts photo: translateY(-8px), scale(1.06), rotate -> 0deg, shadow grows.
- Reduced-motion: skip movement, keep opacity transitions only.
- Background board has subtle parallax — moves -8% on scroll (light, not nausea).
- NO backdrop-filter blur on any text container.

## Texture & depth notes
- Cream linen background uses fractal-noise SVG filter for grain.
- Cork-grain effect optional — subtle noise + warm gradient.
- Brass tacks: small radial gradient circles with highlight + drop shadow.
- Washi tape: rounded rectangle, semi-transparent stripe overlay, mask edges.
- Photo cards: 8-12px white padding around image (Polaroid-style), but
  thinner than Paper variant (more "snapshot" not "Polaroid").
- Drop shadows: layered (close + far) to create real lift.

## Order of sections (top to bottom)
1. Title strip                    — hero, must show within 1s
2. Pinned mood board              — densest, 9 photos + scatter
3. Cake process sketch + notes    — designer's plan
4. Wishes — scrap-paper grid      — 7 different paper types
5. Sign-off — price-tag           — small, intimate close

## Failure-mode prevention checklist
- [ ] Hero uses `animate` not `whileInView`
- [ ] `<img>` tag is rendered inside the pinned-card JSX
- [ ] Title metadata uses `title: { absolute: ... }`
- [ ] No backdrop-filter on text containers
- [ ] Body text on cream uses #2a2a2a
- [ ] No "Asad" anywhere
- [ ] At < 900px, mood board switches to single-column flex (no absolute pos)
