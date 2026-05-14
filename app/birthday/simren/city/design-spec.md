# CITY — Design Spec (cinematic 12-chapter scroll)

A long-scroll narrative film. The user descends through a city's day, dawn → night,
visiting twelve quiet vignettes of people who are conspiring, off-screen, to make
this birthday extraordinary. Inertial scroll via `lenis`. Each chapter is a 100vh
"shot" with a hand-illustrated SVG scene, color-graded photo cameo, body-serif
caption, and chapter-specific micro-animation. Chapters 10 and 11 lazy-mount a
WebGL `Canvas` for the drone-show + fireworks climax.

---

## 0. Performance + perceptual budget

- Lenis: `duration: 1.2`, `easing: t => Math.min(1, 1.001 - 2 ** (-10 * t))` (exponential out).
- Smooth scroll DISABLED automatically if `prefers-reduced-motion: reduce`.
- WebGL `<Canvas>` for drone + fireworks ONLY mounts when chapter is within 1.5 viewports of the visible window (intersection-observer based).
- DPR clamp: `[1, 1.6]`.
- Particle counts:
  - Drone show: 420 desktop, 220 mobile.
  - Fireworks: 7 launches × 90 particles desktop, 7 × 50 mobile.
- Color grading per chapter via CSS variables on a per-chapter wrapper:
  `--grade-hue`, `--grade-sat`, `--grade-bright`, applied to that chapter's
  photo with `filter: hue-rotate(var(--grade-hue)) saturate(...) brightness(...)`.
- Audio: subtle ambient bed only when user has interacted (gesture unlock). Skip
  entirely if `<audio autoplay>` from the parent `AutoMusic` is present and
  unmuted — checked once on mount.

---

## 1. Type system

| Role            | Family                         | Use                                                  |
|-----------------|--------------------------------|------------------------------------------------------|
| Display serif   | `'Cormorant Garamond', serif`  | Chapter titles (italic for poetry, roman for prose). |
| Body serif      | `'Cormorant Garamond', serif`  | 1-3 sentence captions. 18-22px, line-height 1.55.    |
| Mono small caps | `ui-monospace, 'JetBrains Mono'` | Time stamps + chapter index. 11-12px, letter-spaced. |
| Sign-off        | `'Caveat', cursive` fallback `'Brush Script MT'` | Final letter handwriting feel.                     |

(Cormorant + Caveat are bundled via Google CDN `<link>` injected once into
the document `<head>` from the client component on mount.)

---

## 2. Color grade progression

| # | Chapter         | Time      | Background   | Accent      | Photo grade (filter)                                    |
|---|-----------------|-----------|--------------|-------------|---------------------------------------------------------|
| 1 | Bakery          | 05:42 AM  | `#f7e9d4`    | `#c8722f`   | `sepia(.25) saturate(1.1) brightness(1.04)`             |
| 2 | Metro           | 07:14 AM  | `#dfe6ec`    | `#5a6b7a`   | `saturate(.85) brightness(.96) contrast(1.05)`          |
| 3 | Classroom       | 08:30 AM  | `#fcf6e6`    | `#e0a64f`   | `saturate(1.15) brightness(1.04)`                       |
| 4 | Flower Market   | 10:00 AM  | `#fff1d6`    | `#e87a4a`   | `sepia(.18) saturate(1.2)`                              |
| 5 | Tailor          | 11:45 AM  | `#f3ece1`    | `#9c2b2e`   | `saturate(.95) contrast(1.03)`                          |
| 6 | Café            | 01:00 PM  | `#efe6d6`    | `#7a4a25`   | `sepia(.3) saturate(1.05)`                              |
| 7 | Newsstand       | 03:30 PM  | `#e8e3d6`    | `#22201d`   | `grayscale(.6) contrast(1.08)`                          |
| 8 | Billboard       | 05:15 PM  | `#1c1f2c`    | `#ffb469`   | `saturate(1.2) brightness(.95)` — neon dusk             |
| 9 | Lakefront       | 07:00 PM  | `#3b2f4d`    | `#d8b3ff`   | `hue-rotate(-12deg) saturate(.9) brightness(.92)`        |
|10 | Drone Show      | 09:30 PM  | `#070912`    | `#9ec1ff`   | (no photo — WebGL hero)                                 |
|11 | Fireworks       | 10:00 PM  | `#0a0712`    | `#ffd2a6`   | (no photo — WebGL)                                      |
|12 | The Letter      | 10:30 PM  | `#f4ecdc` cream paper on `#0c0c12` window | `#3a2a18` ink | `sepia(.25) saturate(.9)` for memory thumbs |

Inter-chapter transitions: each chapter wraps in a `motion.section` whose
background is its color. Adjacent chapters share a 30vh fade-overlap (a fixed
gradient overlay at the chapter top fades from previous color to current).
This is what gives the "camera wipe" feel.

---

## 3. Scroll choreography (per chapter)

### Chapter 1 — Dawn Bakery (05:42)
- Visible immediately on load (no `whileInView` — uses CSS keyframe `fadeRise`).
- Scene: SVG of a baker's hand, piping bag, cake with "S" being piped. Layered:
  - Background: warm window (gradient rect with sun-streak rays).
  - Midground: counter (cream rectangle with subtle wood grain via repeating linear-gradient).
  - Foreground: cake (off-white circle with cream frosting blob path), piping bag (held by sleeve), forming "S".
  - Detail: flour dust (SVG circles 1-2px, scattered, low opacity, slight float animation).
- Animation: piping-bag squeezes once on load (scaleY pulse), the "S" path animates `stroke-dasharray` 0 → full over 2.4s.
- Caption: *"Before the sun cleared the rooftops, she was already piping the first letter of your name."*

### Chapter 2 — Morning Metro (07:14)
- Scene: SVG of a subway platform — concrete edge, yellow safety line, train arriving from right, platform-display LED ticker above.
- Animation: ticker text loops "MIND THE GAP · MIND THE GAP" then on scroll-into-view flickers and resolves to "FOR SIMREN — TODAY". Uses framer `whileInView` with a `useEffect` text-glitch sequence triggered by `IntersectionObserver`.
- Photo cameo: one photo as a commuter "noticing" the ticker — placed in a small framed window on the left, color-graded cool.
- Caption: *"At 07:14 the message changed. Most people kept reading their phones. One man looked up."*

### Chapter 3 — Classroom (08:30)
- Scene: SVG painted-by-kids posters arranged like a wall — slightly rotated rectangles with construction-paper texture (CSS `background-image` of crumpled noise), each with crayon handwriting paths spelling "HAPPY", "BIRTHDAY", "SIMRENNN".
- Animation: each poster swings in (rotation + opacity from 8°,-6°,3° rest positions) staggered 0.12s on scroll. Crayon strokes fill in via stroke-dasharray after the swing.
- Caption: *"Mrs. Khan let them use the gold glitter. They asked how to spell 'Simren'. They added extra Ns just in case."*

### Chapter 4 — Flower Market (10:00)
- Scene: SVG of bundled marigolds + a hand tying a paper tag to a stem. Petals as layered ellipses in marigold orange + soft yellow.
- Animation: tag flutters once (rotation oscillates), then settles. Petals have a 6s gentle sway loop.
- Photo cameo: one photo treated as "Polaroid pinned to the stall wall."
- Caption: *"The florist said: 'For her, for today.' She didn't ask who. She just tied tighter."*

### Chapter 5 — Tailor (11:45)
- Scene: SVG of a wooden bench with cream pennants in mid-stitch. Embroidery hoop centered, red thread spelling "S-I-M-R-E-N" in small chain stitches.
- Animation: needle (small SVG) bobs in and out twice; the embroidered name fills letter-by-letter via stroke-dasharray (stagger 0.18s/letter).
- Caption: *"She stitched it slow. The 'M' took longest. She said the slow ones hold."*

### Chapter 6 — Café (01:00 PM)
- Scene: SVG of a chalkboard menu, hand chalking "TODAY'S SPECIAL — SIMREN LATTE". Surroundings: a steaming cup, a pastry case (rounded rectangles, cream).
- Animation: chalk dust particles float (8 small circles, blur, gentle rise + fade). The "SIMREN LATTE" line writes-on with a slightly-jittery stroke (animate `d` between two close paths to fake hand tremor).
- Photo cameo: one photo in a hanging frame above the chalkboard.
- Caption: *"Vanilla, cardamom, and a little extra time. He said the recipe came to him this morning."*

### Chapter 7 — Newsstand (03:30 PM)
- Scene: SVG of a stack of newspapers tied with twine. Top paper masthead reads "SIMREN" in old-style serif, full-bleed, single word. Below: faux columns of grey-bar text (rectangles).
- Animation: stack height grows on scroll (translateY of each layer), top paper's "SIMREN" type-on with a typewriter clip-path reveal.
- Caption: *"The press ran a special edition. One word. They said it was self-explanatory."*

### Chapter 8 — Billboard (05:15 PM)
- Scene: large dark dusk sky (gradient indigo → amber at horizon). A Times-Square style giant LED billboard with rounded corners. Two stacked tickers:
  - Top ticker: scrolling marquee of stranger wishes (CSS `@keyframes marquee`, 60s loop). e.g. "ADEEL FROM LAHORE: a year of soft mornings · MARIAM FROM DUBAI: every door opens · ZAHRA FROM KARACHI: the people who love you, multiplied · ..."
  - Bottom ticker: stock-style flicker — "SIMREN ▲ +∞%  ·  HAPPINESS ▲  ·  YEAR 2026 ▲".
- Animation: pure CSS marquees (no JS jitter). Background: distant skyline silhouette + tiny window lights (circles).
- Caption: *"For one minute the city's biggest screen was hers. The tech said it just took someone asking nicely."*

### Chapter 9 — Lakefront (07:00 PM)
- Scene: SVG of three drone-pilot silhouettes on rocks at dusk, open laptops glowing, one walkie-talkie raised. Lake reflects the sky as a horizontal stripe of muted lavender.
- Animation: laptop screens pulse softly (opacity 0.6 ↔ 1.0, 3s loop). Three small drones rise from a case (translateY 0 → -40vh over the scroll range, staggered).
- Photo cameo: one photo "her at the lakefront" framed loose, slight tilt.
- Caption: *"They'd practiced for a week. The wind was cooperating. The sky was asking for it."*

### Chapter 10 — The Drone Show (09:30 PM) — WEBGL HERO
- Black sky background (`#070912`), faint city silhouette at bottom (SVG).
- `<Canvas>` lazily mounted (intersection observer threshold 0.05, root margin 80%).
- Particle system:
  - 420 (220 mobile) `THREE.Points` particles.
  - Each particle has `homePosition` (vec3 forming letters S-I-M-R-E-N sampled across a 24×6 grid) and `wanderOffset` (small random vec3).
  - Phase 1 (scroll progress 0 → 0.35): particles drift in random orbits around screen center (wander).
  - Phase 2 (0.35 → 0.65): smooth cubic-ease lerp toward `homePosition`. Each particle gets a 0-0.2 random delay so it's a *gathering*, not a single snap.
  - Phase 3 (0.65 → 1.0): particles hover with tiny per-particle sinusoidal float (amplitude 0.04 units, freq 0.3-0.5 Hz).
- Material: `PointsMaterial`, `size: 0.085`, additive blending, color `#cbd9ff` with subtle per-particle hue variance (assign vertex colors).
- Letter sampling: pre-computed at module scope via offscreen canvas (draw "SIMREN" with bold display serif, sample alpha pixels, scatter target points).
- Camera: `PerspectiveCamera` at `[0, 0, 8]`, fov 45.
- No OrbitControls — camera fixed for cinematic framing.
- Bloom: skipped (cost). Use additive blending + slightly-larger particle size to fake glow.
- Caption (DOM overlay, top-left): *"21:30. Look up."*

### Chapter 11 — Fireworks (10:00 PM) — WEBGL
- Same Canvas-on-mount pattern (separate Canvas instance for clean lifecycle).
- 7 launches over 6s, then quiet for 2s, then loop.
- Each launch:
  - Launch trail (5 particles, vertical streak, fade out at apex over 0.6s).
  - Burst at apex: 90 particles (50 mobile) radial velocity in random directions, gravity `-0.35 units/s²`, drag 0.985, lifespan 1.8s, color from a per-burst palette: rotates between `[#ffd2a6, #ff8aa6, #a6c8ff, #ffe07a, #c4a6ff]`.
- Sky: `#0a0712` with subtle radial gradient (the city below glowing slightly).
- Optional audio: a soft synth thump per launch (Tone.js if available, otherwise WebAudio oscillator). SKIPPED if `AutoMusic` is playing.
- Caption: *"For about thirty seconds the sky owed her something. Then it was quiet again."*

### Chapter 12 — The Letter (10:30 PM)
- Scene: a cream paper sheet (centered, slightly rotated -1.2°), drop shadow, on a deep navy desk (the chapter background). Window in the upper right (SVG, distant city pin-lights).
- Letter content (handwritten font Caveat) — six lines, each echoing a chapter:
  - "Before the sun cleared the rooftops, someone wrote your name in cream."
  - "At 07:14 a city's signs decided to be about you."
  - "A child added extra Ns. They were right."
  - "A florist tied tags she didn't need to. A tailor stitched slow."
  - "A barista named a drink. A press ran a single word."
  - "And tonight, the sky lit up because you were here for it."
  - Sign-off: *"— with love, every street that knew your name today."*
- Photo memory thumbnails (3-5 small photos) scattered like polaroids on the desk corners, each with a slight tilt and shadow.
- Animation: handwriting writes-on, line by line, on `whileInView` with stagger 0.6s/line, using stroke-dasharray on text-as-path (achieved with the SVG-text-fill approach: render text in `<text>` element with `clipPath` reveal from left).
- Final beat: at the bottom, mono small text: `END. — 14·05·2026`.

---

## 4. Inter-chapter transitions

- Each chapter section has a 25vh `::before` overlay (`linear-gradient(to bottom, prevColor, transparent)`) that fades the incoming chapter from the previous chapter's color.
- This provides the "camera wipe" without any JS.
- For chapters 9 → 10 and 10 → 11 (the night triplet), the overlay fades through near-black for the dramatic cinema cut.

---

## 5. Photo distribution

If N photos available, slot them into chapters: 2, 4, 6, 9, 12. Chapter 12 takes
all remaining (max 5 visible as memory thumbs).

If N < 5, only chapters 2, 9, 12 get photos (skip 4 and 6).

If N == 0, all photo cameos render an SVG placeholder (a cream rectangle with a
pencil-sketch silhouette) — page never crashes.

---

## 6. Reduced-motion behavior

`prefers-reduced-motion: reduce`:
- Lenis disabled (native scroll).
- All `whileInView` becomes `initial={false}` (rendered visible).
- Drone-show particles: skip wander phase, render at home positions immediately, no float.
- Fireworks: render a static SVG sketch of one burst with caption.
- Marquees become static text.

---

## 7. WebGL fallback

If WebGL context creation fails (try/catch in a wrapper component):
- Chapter 10: render a static SVG of dots arranged spelling "SIMREN" against the night sky.
- Chapter 11: render a static SVG fireworks burst + caption.

---

## 8. Mobile composition (375px floor)

- Chapter sections become 100vh stacked.
- SVG scenes scale via `viewBox` + `preserveAspectRatio="xMidYMid meet"`.
- Captions max-width clamp(280px, 80vw, 460px).
- Billboard ticker: keep readable — font-size scales with `clamp(14px, 3.6vw, 22px)`.
- Drone show: particle count drops to 220, camera moves to `[0,0,9]` for tighter framing.

---

## 9. Component tree

```
CityExperience (client)
├── <FontInjector /> — appends Cormorant + Caveat <link>
├── <ScrollSmoother /> — initializes lenis on mount
├── <Chapter1 /> — Bakery
├── <Chapter2 /> — Metro
├── … through Chapter12
└── <ChapterDots /> — fixed right-rail mini-progress (12 small dots)
```

Each `Chapter*` is a self-contained section component for readability,
not abstracted via a generic `<Chapter>` wrapper (each scene is too unique).

---

## 10. Failure-mode self-checks

- ✅ Chapter 1 visible at load (CSS keyframe, not whileInView).
- ✅ WebGL chapters lazy-mount via IntersectionObserver.
- ✅ Particles use `PointsMaterial`, NO photo textures.
- ✅ All photos via plain `<img>`, EXIF respected.
- ✅ `title: { absolute: ... }` in metadata.
- ✅ No personal-name attribution anywhere; sign-off generic.
- ✅ Mobile composes at 375px.
- ✅ Lenis already in package.json — no install needed.
- ✅ Each SVG scene has foreground+midground+background layers.
- ✅ `prefers-reduced-motion` honored.
- ✅ AutoMusic detected → skip generative audio.
