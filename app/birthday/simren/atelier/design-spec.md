# ATELIER — Design Spec (3D / WebGL)

A real three-dimensional designer's mood board, viewed in perspective space.
Rendered with `@react-three/fiber` + `@react-three/drei` on top of `three`.

This file documents the **3D scene** that ships in `AtelierExperience.tsx`,
plus the DOM overlay (title, eyebrow, scroll-cue, sign-off chip).

---

## 0. Hardware target & global perf budget

- iPhone 14-class GPU as the floor.
- `Canvas dpr={[1, 1.5]}`, `gl={{ antialias: true, powerPreference: "low-power" }}`
- One DirectionalLight casting shadows + one DirectionalLight no-shadow + 1 ambient.
- Shadow map size: `1024` desktop, `512` mobile.
- Total scene triangles target: < 35 000.
- Dust particles: 80 desktop, 30 mobile.
- Disable shadows entirely on devices with `navigator.hardwareConcurrency < 4`.

If WebGL fails (no context), fall back to a static cream linen DOM with the
title strip — page does NOT crash.

---

## 1. Camera + framing

- `PerspectiveCamera`, FOV **42°**, near 0.1, far 50.
- Initial position: `[0, 0.6, 5.4]` (slightly above board, pulled back).
- Looking at `[0, 0, 0]` (the board centre).
- `OrbitControls` from drei with:
  - `enableZoom=false`, `enablePan=false`
  - `enableDamping=true`, `dampingFactor=0.08` (heavy-board feel)
  - `minPolarAngle = π/2 - 0.18` (≈ 80°)
  - `maxPolarAngle = π/2 + 0.10` (≈ 95°)  — small vertical range
  - `minAzimuthAngle = -0.28` (≈ -16°)
  - `maxAzimuthAngle =  0.28` (≈ +16°)
  - `rotateSpeed = 0.45` (slow)
  - `target = [0, 0, 0]`
- On mobile: same clamps but `rotateSpeed = 0.55` for touch responsiveness.

---

## 2. The board (hero geometry)

A `mesh` with `BoxGeometry(7.0, 4.6, 0.18)` — wide, thin slab.

Position: `[0, 0, 0]`.
Rotation: `[-0.10, 0.06, 0]` (≈ -5.7° tilt back, +3.4° to the right) so it
tilts gently toward the camera.

Material: `MeshStandardMaterial`, `color="#dccaa6"`, `roughness=0.92`, `metalness=0`.
A procedural cork/fabric texture is generated on a `<canvas>` once on mount and
fed in via `map`:
- 1024×1024 canvas
- Base fill `#d8c39a`
- Loop ~4 000 short tan/brown strokes (random length 2-6px, hue jitter ±8) to
  give a tight cork-fleck pattern.
- Light vignette (radial dark) for warmth.
- One reuse → cached in a `useMemo`.

The board casts shadows (so photo-card shadows fall *on it*) and *receives*
shadows (so photos cast onto it). `castShadow` for photos+tape, `receiveShadow`
for the board only.

A **wooden frame** wraps the board: 4 thin `BoxGeometry` slats (`color="#6b4f2f"`,
roughness 0.7) hugging the perimeter, gives it furniture weight.

---

## 3. Photos — pinned 3D cards

Each photo is a `<group>` containing:

1. **Card backing**: `BoxGeometry(w, h, 0.022)` — 22mm thick rectangle.
   Material `MeshStandardMaterial color="#fffaf0" roughness=0.85`.
2. **Photo face**: a child `<mesh>` `PlaneGeometry(w*0.92, h*0.92)` floated 0.012
   in front of the backing. Material `MeshBasicMaterial map={photoTexture}`.
   `MeshBasicMaterial` (not Standard) so the photo isn't darkened by lighting —
   it reads as a printed image, lit through ambient/light naturally via the
   backing card's shadow.
3. **Subtle bend**: applied as a ONE-TIME vertex displacement on the card
   geometry: each vertex's z shifted by `cos(x / w * π) * 0.012` so the card
   gently bows away from the board centre. Done in `useMemo` with a cloned
   geometry — keeps it cheap.
4. **Brass tack(s)**: 1-2 small `<mesh>` cylinders (see §5) positioned at the
   card corners, slightly above (z + 0.025).

Per-card placement on the board (board-local coordinates, board is 7 wide × 4.6
tall, board face at z=0.09 + a tiny per-card stagger to avoid z-fighting):

```
SLOTS = [
  { x: -2.55, y:  1.45, w: 1.05, h: 1.30, rotZ: -0.06, pin: "tl" },
  { x: -0.95, y:  1.65, w: 0.95, h: 1.15, rotZ:  0.04, pin: "tc" },
  { x:  0.95, y:  1.40, w: 1.10, h: 1.40, rotZ: -0.05, pin: "tr" },
  { x:  2.55, y:  1.10, w: 0.95, h: 1.20, rotZ:  0.06, pin: "tc" },
  { x: -2.30, y: -0.20, w: 0.95, h: 1.15, rotZ:  0.08, pin: "tl" },
  { x: -0.30, y: -0.30, w: 1.30, h: 1.55, rotZ: -0.03, pin: "two" },
  { x:  1.85, y: -0.10, w: 1.00, h: 1.20, rotZ:  0.05, pin: "tc" },
  { x: -1.80, y: -1.55, w: 0.95, h: 1.15, rotZ: -0.07, pin: "tl" },
  { x:  0.40, y: -1.65, w: 1.00, h: 1.20, rotZ:  0.04, pin: "tr" },
  { x:  2.20, y: -1.40, w: 0.95, h: 1.20, rotZ: -0.05, pin: "tc" },
]
```

If `photos.length > SLOTS.length`, slots cycle. If shorter, unused slots are
left blank (board still looks composed because of swatches + notes).

### EXIF / orientation (CRITICAL)

iPhone JPGs carry an EXIF rotation tag. `THREE.TextureLoader` IGNORES this and
the photo will render sideways. Solution used here:

```ts
const blob = await fetch(url).then(r => r.blob());
const bmp  = await createImageBitmap(blob, { imageOrientation: "from-image" });
const tex  = new THREE.CanvasTexture(bmp);  // CanvasTexture accepts ImageBitmap
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
tex.needsUpdate = true;
```

`createImageBitmap` with `imageOrientation: "from-image"` honours EXIF.

If a browser doesn't support that option (very old Safari), we fall back to
loading via an `<img>` element, drawing onto a canvas, then `CanvasTexture` —
the browser-decoded `<img>` honours EXIF natively when sourced via `crossOrigin`
+ `decoding="async"`.

While a card's texture is still loading, its face shows a `MeshBasicMaterial
color="#e8dcc2"` placeholder so the card isn't black/empty.

---

## 4. Brass tacks

Reused geometry: `CylinderGeometry(0.05, 0.05, 0.025, 24)` for the head +
`ConeGeometry(0.012, 0.04, 8)` for the pin (mostly hidden, gives subtle
height). Combined into a `<group>`.

Material on head: `MeshStandardMaterial color="#b8923f" metalness=1
roughness=0.28`. The metalness gives a real specular pop under the warm key
light.

Geometry is `useMemo`'d once and reused for every tack — no allocation per
photo.

---

## 5. Washi tape strips

Thin rounded rectangles drawn as `<mesh>` with `PlaneGeometry(0.5, 0.13)`,
positioned above some cards with rotation. Material `MeshStandardMaterial`
with:
- `color` = rose / sage / manila (rotates among 3 colours)
- `transparent=true`, `opacity=0.72`
- `roughness=0.9`

The **edge-mask stripe** (the diagonal hatching that makes washi look like
washi) is faked by sampling a small canvas-generated stripe texture, mapped
once and reused.

About **half** the cards get tape; they'll be the cards WITHOUT corner pins
(so visual mix isn't all-pin or all-tape).

---

## 6. Wish notes (paper scraps in 3D)

3 wish-note cards lifted onto the board's right margin and left margin (not
all 7 — too cluttered in 3D). Each is a `BoxGeometry(0.85, 0.5, 0.014)` with
a `CanvasTexture` whose canvas content is:
- Solid paper colour (cream / kraft / pink)
- Hand-drawn-ish text (Caveat-styled fallback to `Snell Roundhand`/cursive),
  drawn via `ctx.font = "italic 28px 'Caveat', 'Snell Roundhand', cursive"`
  + word-wrap routine
- Subtle paper grain (random low-alpha specks)

Three wishes shown on board (rest live in DOM overlay below the canvas if
desired — but per the failure-mode list we keep DOM clean and let the 3D
board carry the wishes).

Each wish card is pinned with one tack.

Position slots:
```
WISH_SLOTS = [
  { x: -3.10, y:  0.45, rotZ:  0.18, paper: "cream" },
  { x:  3.15, y:  0.55, rotZ: -0.16, paper: "kraft" },
  { x:  3.10, y: -0.85, rotZ:  0.10, paper: "pink"  },
]
```

---

## 7. Fabric swatches (corners)

2 small fabric squares `BoxGeometry(0.55, 0.55, 0.025)` at the top-left + bottom-right
of the board:
- One in **dusty rose** (`#c97a76`)
- One in **sage** (`#9aab8c`)

Material `MeshStandardMaterial` with a procedural canvas weave-stripe texture
(diagonal cross-hatch, ~6px stripes) mapped onto it. `roughness=1`,
`metalness=0`. Gives them cloth quality vs the cards' paper finish.

Each pinned with one tack.

---

## 8. Cake — small pencil-sketch card

A 4th wish-style card (`BoxGeometry(0.95, 0.7, 0.014)`) bottom-centre:
- Canvas texture renders an SVG-like pencil cake with `ctx.lineWidth=1.4`,
  three tiered rectangles, one big candle, "make 14 wishes — only need one"
  in Caveat at the bottom.
- Pinned with two tacks.

Position: `{ x: 0, y: -2.05, rotZ: -0.04 }`.

---

## 9. Lighting

```
<hemisphereLight color="#fff4dc" groundColor="#806040" intensity={0.55} />
<directionalLight
  position={[-3.2, 4.0, 3.5]}     // upper-left "studio window"
  color="#fff0d6"
  intensity={1.25}
  castShadow
  shadow-mapSize-width={isMobile ? 512 : 1024}
  shadow-mapSize-height={isMobile ? 512 : 1024}
  shadow-camera-near={0.5}
  shadow-camera-far={14}
  shadow-camera-left={-5}
  shadow-camera-right={5}
  shadow-camera-top={4}
  shadow-camera-bottom={-4}
  shadow-bias={-0.0008}
/>
<directionalLight
  position={[4.5, 2.5, 2.0]}      // cool fill from opposite side
  color="#dceaff"
  intensity={0.42}
/>
<ambientLight intensity={0.18} />
```

Renderer: `gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap`.

---

## 10. Dust particles

`<points>` with `BufferGeometry`:
- 80 desktop / 30 mobile particles
- Random positions in a `(8, 5, 4)` volume centred at `[-1, 1, 1.5]` (in the
  warm light beam path)
- Material `PointsMaterial` `color="#fff4d6"`, `size=0.018`, `transparent=true`,
  `opacity=0.55`, `depthWrite=false`, additive-ish blending
- Animated in `useFrame`: each particle drifts +y at 0.04/s with sine wobble in x
  (wraps when it leaves the volume). Cheap.

---

## 11. Interaction state machine

Per-photo states:
- `idle` — sitting on board at slot rest pose
- `hovered` — pointer over (desktop): smooth-lerp z+0.10, scale 1.04, rotZ → 0
- `lifted` — clicked/tapped: smooth-lerp z+0.55, rotZ → 0, scale 1.16, board
  pushes other cards to opacity 0.55. Tap again or tap empty board to release.

Animation: each `<group>` stores target pose in `useRef`s; `useFrame` runs a
cheap critically-damped lerp toward target each frame. NO framer-motion inside
the canvas (it doesn't compose with r3f cleanly) — pure useFrame.

State held at scene level: `liftedIndex: number | null`. Shared via React
context or simple prop drill.

Caption text appears in **DOM overlay** (positioned via `useThree` →
`camera.project()` to map the lifted card's world position to screen pixels)
so caption text stays sharp even while card is in 3D space.

Tack tap: small reactive jolt — tack y rotates 0 → 0.6 → 0 over 200ms once
clicked. Cosmetic only.

Note: keep raycasting cheap. Use `onPointerOver` / `onPointerOut` /
`onClick` props on the card group only (drei's r3f passes through). Tacks
have `pointerEvents` enabled separately and call `event.stopPropagation()`.

---

## 12. DOM overlay (sibling of `<Canvas>`)

```
<div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
  ...title strip (top)...
  ...eyebrow "ATELIER NO. 14" (top, small caps)...
  ...scroll/drag cue (bottom)...
  ...lifted-photo caption (anchored via projected coords) when liftedIndex != null
  ...sign-off chip (bottom-right corner): "MADE WITH CARE · 5/14/26"...
</div>
```

Pointer events: re-enable on the sign-off chip and the close-cue. Title bar is
purely visual — must NOT eat drag events on the board.

The title overlay uses immediate CSS transitions (NOT framer `whileInView`) so
it appears within ~200ms even while the canvas is still compiling shaders.

---

## 13. Mobile-specific tweaks

- Camera initial pulled to `[0, 0.5, 6.0]` (slightly farther so board fits).
- DPR cap 1.5.
- Shadow map 512.
- Particles 30.
- Disable bend-vertex displacement on cards (skip the geometry clone) for ~2-3ms saved per card on init.
- Tap-to-lift instead of hover. No hover state on touch devices (detect
  via `window.matchMedia('(pointer: coarse)')`).
- Drag-to-orbit works through r3f / drei's OrbitControls touch support out of
  the box. We just don't `enableZoom`.

---

## 14. Failure-mode prevention checklist

- [x] Hero title overlay uses CSS opacity/transform transitions, mounted
      synchronously in DOM (NOT inside the Canvas). Visible within 200ms.
- [x] Photo textures loaded via `createImageBitmap(..., { imageOrientation:
      'from-image' })` → EXIF respected.
- [x] Photo plane uses `MeshBasicMaterial` with the *connected* `map`
      texture (set via state once loaded; placeholder until then).
- [x] Light count: 1 hemi + 2 directional + 1 ambient = 4 total. Only 1 casts
      shadows.
- [x] `dpr={[1, 1.5]}`, `powerPreference: 'low-power'`.
- [x] Particle count capped (≤80 desktop, 30 mobile).
- [x] `title: { absolute: ... }` in `page.tsx` (untouched — already correct).
- [x] No "Asad" anywhere; sign-off "MADE WITH CARE · 5/14/26".
- [x] OrbitControls clamped tight + damping → board feels physically heavy.
- [x] Static fallback wrapper renders cream background while WebGL boots.
- [x] WebGL context-loss handler logs + shows fallback (the cream linen + title).
