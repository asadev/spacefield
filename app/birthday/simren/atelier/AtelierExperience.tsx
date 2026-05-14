"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * ATELIER 3D — Birthday for Simren Zahra (2026-05-14)
 *
 * Real WebGL atelier. A cork-fabric board tilted toward the camera, sitting
 * in a wooden frame, with photos pinned as 3D printed cards (with thickness
 * and gentle bow), brass tacks (metallic), washi tape strips, hand-written
 * wish notes on paper, fabric swatches, and a tiny pencil-sketch cake card.
 *
 * Soft warm key light from upper-left + cool fill from upper-right. Dust
 * particles drift through the warm beam. The user can drag to subtly orbit
 * the board (clamped tight, heavy damping), and tap any photo to lift it
 * forward into focus.
 *
 * Built on @react-three/fiber + @react-three/drei + three.
 * Stack: 4 lights, 1 cast-shadow only, dpr cap 1.5, ≤ 80 dust particles,
 * ≤ 35 000 triangles total. iPhone-14 friendly.
 *
 * NO framer-motion inside the Canvas (doesn't compose); useFrame lerps only.
 * Title strip is DOM, mounted synchronously, visible within 200ms.
 * ───────────────────────────────────────────────────────────────────── */

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { Caveat, Cormorant_Garamond, Sacramento } from "next/font/google";

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});
const sacramento = Sacramento({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

/* ── Palette ─────────────────────────────────────────────────────────── */
const CREAM = "#f4ead8";
const INK = "#2a2a2a";
const INK_SOFT = "#5a4a3a";
const ROSE = "#c97a76";

/* ── Slot definitions (board-local coords; board is 7 wide × 4.6 tall) */
type Pin = "tl" | "tr" | "tc" | "two";
type TapeColor = "rose" | "sage" | "manila" | "none";

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
  rotZ: number;
  pin: Pin;
  tape: TapeColor;
  caption: string;
}

const SLOTS: Slot[] = [
  { x: -2.55, y:  1.45, w: 1.05, h: 1.30, rotZ: -0.06, pin: "tl",  tape: "none",   caption: "no. 01" },
  { x: -0.95, y:  1.65, w: 0.95, h: 1.15, rotZ:  0.04, pin: "tc",  tape: "rose",   caption: "soft light" },
  { x:  0.95, y:  1.40, w: 1.10, h: 1.40, rotZ: -0.05, pin: "tr",  tape: "none",   caption: "the smile" },
  { x:  2.55, y:  1.10, w: 0.95, h: 1.20, rotZ:  0.06, pin: "tc",  tape: "sage",   caption: "frame this" },
  { x: -2.30, y: -0.20, w: 0.95, h: 1.15, rotZ:  0.08, pin: "tl",  tape: "none",   caption: "again" },
  { x: -0.30, y: -0.30, w: 1.30, h: 1.55, rotZ: -0.03, pin: "two", tape: "none",   caption: "hero shot" },
  { x:  1.85, y: -0.10, w: 1.00, h: 1.20, rotZ:  0.05, pin: "tc",  tape: "manila", caption: "keep" },
  { x: -1.80, y: -1.55, w: 0.95, h: 1.15, rotZ: -0.07, pin: "tl",  tape: "none",   caption: "this one" },
  { x:  0.40, y: -1.65, w: 1.00, h: 1.20, rotZ:  0.04, pin: "tr",  tape: "rose",   caption: "yes" },
  { x:  2.20, y: -1.40, w: 0.95, h: 1.20, rotZ: -0.05, pin: "tc",  tape: "none",   caption: "no notes" },
];

interface WishSlot {
  x: number;
  y: number;
  rotZ: number;
  paper: "cream" | "kraft" | "pink";
  text: string;
}

const WISH_SLOTS: WishSlot[] = [
  { x: -3.10, y:  0.55, rotZ:  0.18, paper: "cream", text: "may the people who love you find a thousand new reasons to." },
  { x:  3.15, y:  0.55, rotZ: -0.16, paper: "kraft", text: "may your laugh stay loud and your worries stay small." },
  { x:  3.10, y: -0.95, rotZ:  0.10, paper: "pink",  text: "lucky world, having you in it. today especially." },
];

interface Props {
  photos: string[];
}

/* ───────────────────────────────────────────────────────────────────── */
/* Root                                                                  */
/* ───────────────────────────────────────────────────────────────────── */
export default function AtelierExperience({ photos }: Props) {
  const [liftedIndex, setLiftedIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px), (pointer: coarse)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: CREAM,
        color: INK,
        overflow: "hidden",
      }}
      className={cormorant.className}
    >
      {/* ── Static cream-linen base layer (visible immediately, also the
            WebGL fallback if context is lost / never inits) ─────────── */}
      <StaticBoardFallback />

      {/* ── 3D Canvas ──────────────────────────────────────────────── */}
      {!contextLost && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            touchAction: "none",
            // Explicit width/height ensures r3f's ResizeObserver picks up
            // viewport size on first mount instead of falling back to its
            // 300x150 default. `inset:0` on a positioned ancestor isn't
            // enough on its own for the auto-sizer.
            width: "100%",
            height: "100%",
          }}
        >
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{
              antialias: true,
              powerPreference: "low-power",
              alpha: true,
            }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0); // transparent over CREAM div
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
              const canvas = gl.domElement;
              canvas.addEventListener("webglcontextlost", (e) => {
                e.preventDefault();
                setContextLost(true);
              });
            }}
          >
            <Suspense fallback={null}>
              <Scene
                photos={photos}
                liftedIndex={liftedIndex}
                onLift={setLiftedIndex}
                isMobile={isMobile}
              />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* ── DOM overlay (title + chrome) ───────────────────────────── */}
      <DomOverlay
        isMobile={isMobile}
        liftedIndex={liftedIndex}
        onCloseLifted={() => setLiftedIndex(null)}
        sacramentoCls={sacramento.className}
        caveatCls={caveat.className}
        liftedCaption={
          liftedIndex !== null ? SLOTS[liftedIndex % SLOTS.length].caption : null
        }
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Scene                                                                 */
/* ───────────────────────────────────────────────────────────────────── */
function Scene({
  photos,
  liftedIndex,
  onLift,
  isMobile,
}: {
  photos: string[];
  liftedIndex: number | null;
  onLift: (i: number | null) => void;
  isMobile: boolean;
}) {
  const corkTexture = useMemo(() => makeCorkTexture(), []);
  const tapeTexture = useMemo(() => makeTapeStripeTexture(), []);
  const fabricTexture = useMemo(() => makeFabricWeaveTexture(), []);

  // limit slots to photos length but ensure at least the slot count to keep board composed
  const items = photos.slice(0, SLOTS.length).map((src, i) => ({
    src,
    slot: SLOTS[i],
    index: i,
  }));

  // Dispose textures on unmount
  useEffect(() => {
    return () => {
      corkTexture.dispose();
      tapeTexture.dispose();
      fabricTexture.dispose();
    };
  }, [corkTexture, tapeTexture, fabricTexture]);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={42}
        near={0.1}
        far={50}
        position={[0, 0.6, isMobile ? 6.4 : 5.6]}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 2 - 0.18}
        maxPolarAngle={Math.PI / 2 + 0.10}
        minAzimuthAngle={-0.28}
        maxAzimuthAngle={0.28}
        rotateSpeed={isMobile ? 0.55 : 0.45}
        target={[0, 0, 0]}
      />

      {/* Lights */}
      <hemisphereLight args={["#fff4dc", "#806040", 0.55]} />
      <directionalLight
        position={[-3.2, 4.0, 3.5]}
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
      <directionalLight position={[4.5, 2.5, 2.0]} color="#dceaff" intensity={0.42} />
      <ambientLight intensity={0.18} />

      {/* The board itself + frame */}
      <Board corkTexture={corkTexture} />

      {/* Photo cards */}
      {items.map(({ src, slot, index }) => (
        <PhotoCard
          key={src + index}
          src={src}
          slot={slot}
          index={index}
          isLifted={liftedIndex === index}
          anyLifted={liftedIndex !== null}
          onClick={() =>
            onLift(liftedIndex === index ? null : index)
          }
          tapeTexture={tapeTexture}
        />
      ))}

      {/* Wish notes */}
      {WISH_SLOTS.map((wish, i) => (
        <WishCard key={`wish-${i}`} wish={wish} dimmed={liftedIndex !== null} />
      ))}

      {/* Fabric swatches in corners */}
      <FabricSwatch
        x={-3.20}
        y={1.85}
        rotZ={0.10}
        color="#c97a76"
        weave={fabricTexture}
        dimmed={liftedIndex !== null}
      />
      <FabricSwatch
        x={3.10}
        y={-1.95}
        rotZ={-0.12}
        color="#9aab8c"
        weave={fabricTexture}
        dimmed={liftedIndex !== null}
      />

      {/* Cake mini-card */}
      <CakeCard dimmed={liftedIndex !== null} />

      {/* Dust particles in light beam */}
      <DustParticles count={isMobile ? 30 : 80} />

      {/* Background plane behind board to absorb shadows + fade to cream */}
      <mesh position={[0, 0, -2.5]} receiveShadow>
        <planeGeometry args={[40, 24]} />
        <meshStandardMaterial color={CREAM} roughness={1} />
      </mesh>

      {/* Click-empty-board catcher: clicking the board with nothing else
          consuming the event releases the lifted photo. */}
      <mesh
        position={[0, 0, -0.05]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          // Only release if no card consumed the event AND something is lifted
          if (liftedIndex !== null) {
            e.stopPropagation();
            onLift(null);
          }
        }}
        visible={false}
      >
        <planeGeometry args={[20, 14]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Board (cork slab + wooden frame)                                      */
/* ───────────────────────────────────────────────────────────────────── */
function Board({ corkTexture }: { corkTexture: THREE.Texture }) {
  // Tilt the board gently toward camera + slight horizontal twist
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef} rotation={[-0.10, 0.06, 0]}>
      {/* Cork slab */}
      <mesh receiveShadow castShadow>
        <boxGeometry args={[7.0, 4.6, 0.18]} />
        <meshStandardMaterial
          map={corkTexture}
          color="#dccaa6"
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      {/* Wooden frame: 4 thin slats */}
      <FrameSlat x={0} y={2.42} w={7.4} h={0.22} />
      <FrameSlat x={0} y={-2.42} w={7.4} h={0.22} />
      <FrameSlat x={3.62} y={0} w={0.22} h={4.84} />
      <FrameSlat x={-3.62} y={0} w={0.22} h={4.84} />
    </group>
  );
}

function FrameSlat({
  x,
  y,
  w,
  h,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  return (
    <mesh position={[x, y, 0.04]} castShadow receiveShadow>
      <boxGeometry args={[w, h, 0.30]} />
      <meshStandardMaterial color="#6b4f2f" roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Photo card                                                            */
/* ───────────────────────────────────────────────────────────────────── */
function PhotoCard({
  src,
  slot,
  index,
  isLifted,
  anyLifted,
  onClick,
  tapeTexture,
}: {
  src: string;
  slot: Slot;
  index: number;
  isLifted: boolean;
  anyLifted: boolean;
  onClick: () => void;
  tapeTexture: THREE.Texture;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [photoTexture, setPhotoTexture] = useState<THREE.Texture | null>(null);

  // Apply board tilt context: child positions are board-local. The board itself
  // is rotated already, so to keep photos co-planar with the board we mount
  // them as descendants? r3f-wise, simpler: transform the cards by the board's
  // tilt manually here, since putting them inside Board would require Board to
  // accept children (cleaner option). We choose to compose: each card gets the
  // same tilt as the board.
  // But: easier — apply the SAME outer rotation here so they sit on the board.

  // Per-card slight z stagger to avoid z-fighting when flat
  const baseZ = 0.10 + index * 0.0015;

  // ── Load photo texture honouring EXIF orientation ──
  useEffect(() => {
    let cancelled = false;
    let createdTex: THREE.Texture | null = null;

    async function load() {
      try {
        let bmpOrImg: ImageBitmap | HTMLImageElement;

        // Preferred path: createImageBitmap with imageOrientation: 'from-image'
        // honours EXIF (iPhone JPGs rotate correctly).
        if (typeof createImageBitmap === "function") {
          const blob = await fetch(src).then((r) => r.blob());
          // Some Safari versions don't support imageOrientation option.
          // Try with it; if it throws, retry without and rely on <img> fallback.
          try {
            bmpOrImg = await createImageBitmap(blob, {
              imageOrientation: "from-image",
            });
          } catch {
            // Retry via <img> path
            bmpOrImg = await loadImgElement(src);
          }
        } else {
          bmpOrImg = await loadImgElement(src);
        }

        if (cancelled) {
          if ("close" in bmpOrImg) bmpOrImg.close();
          return;
        }

        const tex = new THREE.CanvasTexture(bmpOrImg as CanvasImageSource);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        createdTex = tex;
        setPhotoTexture(tex);
      } catch {
        // Leave placeholder visible; do not crash
      }
    }
    load();

    return () => {
      cancelled = true;
      if (createdTex) createdTex.dispose();
    };
  }, [src]);

  // Bent (slightly bowed) card geometry — clone of BoxGeometry with displaced
  // front-face vertices.
  const cardGeometry = useMemo(() => {
    const geom = new THREE.BoxGeometry(slot.w, slot.h, 0.022, 8, 8, 1);
    const pos = geom.attributes.position;
    const halfW = slot.w / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Only displace front-facing vertices (z > 0)
      if (z > 0.005) {
        const bow = Math.cos((x / halfW) * (Math.PI / 2)) * 0.012;
        pos.setZ(i, z + bow);
      }
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    return geom;
  }, [slot.w, slot.h]);

  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  // Animation: lerp toward target pose every frame
  useFrame((_state, delta) => {
    const grp = groupRef.current;
    if (!grp) return;

    const targetZ = isLifted ? baseZ + 0.65 : hovered ? baseZ + 0.10 : baseZ;
    const targetScale = isLifted ? 1.16 : hovered ? 1.04 : 1.0;
    const targetRotZ = isLifted ? 0 : hovered ? slot.rotZ * 0.4 : slot.rotZ;
    const targetOpacity = anyLifted && !isLifted ? 0.55 : 1.0;

    // Critically-damped-ish lerp (use frame-rate-independent factor)
    const k = 1 - Math.pow(0.001, delta * 6);

    grp.position.z = THREE.MathUtils.lerp(grp.position.z, targetZ, k);
    grp.rotation.z = THREE.MathUtils.lerp(grp.rotation.z, targetRotZ, k);
    const s = THREE.MathUtils.lerp(grp.scale.x, targetScale, k);
    grp.scale.setScalar(s);

    // Apply opacity to card materials
    grp.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (m && !Array.isArray(m) && "opacity" in m) {
        const mat = m as THREE.Material & { opacity: number; transparent: boolean };
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity ?? 1, targetOpacity, k);
      }
    });
  });

  // Compose: position on board (local coords) + same tilt as board so they
  // stick to the board face. Board tilt: rotation [-0.10, 0.06, 0].
  return (
    <group rotation={[-0.10, 0.06, 0]}>
      <group
        ref={groupRef}
        position={[slot.x, slot.y, baseZ]}
        rotation={[0, 0, slot.rotZ]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {/* Card backing (paper white, with thickness, with bow) */}
        <mesh geometry={cardGeometry} castShadow>
          <meshStandardMaterial color="#fffaf0" roughness={0.85} />
        </mesh>

        {/* Photo face — sits 0.013 in front of the card */}
        <mesh position={[0, 0, 0.014]}>
          <planeGeometry args={[slot.w * 0.92, slot.h * 0.92]} />
          {photoTexture ? (
            <meshBasicMaterial map={photoTexture} toneMapped={false} />
          ) : (
            <meshBasicMaterial color="#e8dcc2" />
          )}
        </mesh>

        {/* Tape (above photo face) */}
        {slot.tape !== "none" && (
          <Tape color={slot.tape} cardW={slot.w} stripeMap={tapeTexture} />
        )}

        {/* Brass tacks */}
        <Tacks kind={slot.pin} cardW={slot.w} cardH={slot.h} />
      </group>
    </group>
  );
}

/* Helper: load image via <img> element (browser EXIF-decodes natively) */
function loadImgElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ───────────────────────────────────────────────────────────────────── */
/* Brass tacks                                                           */
/* ───────────────────────────────────────────────────────────────────── */

// Shared geometry for every tack (one allocation total). Material is per-instance
// so the opacity-dim loop on a parent card doesn't leak to tacks on other cards.
const TACK_HEAD_GEOM = new THREE.CylinderGeometry(0.05, 0.05, 0.025, 20);
TACK_HEAD_GEOM.rotateX(Math.PI / 2);

function Tacks({
  kind,
  cardW,
  cardH,
}: {
  kind: Pin;
  cardW: number;
  cardH: number;
}) {
  // Position tacks slightly inside the card edges, in front of the photo face
  const z = 0.030;
  const positions: [number, number][] = (() => {
    if (kind === "tl") return [[-cardW / 2 + 0.06, cardH / 2 - 0.06]];
    if (kind === "tr") return [[cardW / 2 - 0.06, cardH / 2 - 0.06]];
    if (kind === "tc") return [[0, cardH / 2 - 0.06]];
    return [
      [-cardW / 2 + 0.06, cardH / 2 - 0.06],
      [cardW / 2 - 0.06, cardH / 2 - 0.06],
    ];
  })();

  return (
    <>
      {positions.map(([x, y], i) => (
        <Tack key={i} x={x} y={y} z={z} />
      ))}
    </>
  );
}

function Tack({ x, y, z }: { x: number; y: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  // Mutable jolt timer in a ref — driven by useFrame, no React re-renders.
  const joltRef = useRef(0);

  useFrame((_s, delta) => {
    if (!ref.current) return;
    if (joltRef.current > 0) {
      joltRef.current = Math.max(0, joltRef.current - delta * 5);
      ref.current.rotation.z = Math.sin(joltRef.current * Math.PI) * 0.6;
    } else if (ref.current.rotation.z !== 0) {
      ref.current.rotation.z = 0;
    }
  });

  return (
    <mesh
      ref={ref}
      position={[x, y, z]}
      geometry={TACK_HEAD_GEOM}
      castShadow
      onClick={(e) => {
        e.stopPropagation();
        joltRef.current = 1;
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
      }}
    >
      <meshStandardMaterial
        color="#c8a04a"
        metalness={1}
        roughness={0.28}
        emissive="#3a2d10"
        emissiveIntensity={0.18}
      />
    </mesh>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Tape                                                                   */
/* ───────────────────────────────────────────────────────────────────── */
const TAPE_COLORS: Record<Exclude<TapeColor, "none">, string> = {
  rose: "#c97a76",
  sage: "#9aab8c",
  manila: "#dcc591",
};

function Tape({
  color,
  cardW,
  stripeMap,
}: {
  color: Exclude<TapeColor, "none">;
  cardW: number;
  stripeMap: THREE.Texture;
}) {
  // Tape strip across top of card, slight rotation
  const w = cardW * 0.55;
  return (
    <mesh
      position={[0, 0.1, 0.025]}
      rotation={[0, 0, 0.06]}
      castShadow
    >
      <planeGeometry args={[w, 0.13]} />
      <meshStandardMaterial
        color={TAPE_COLORS[color]}
        map={stripeMap}
        transparent
        opacity={0.78}
        roughness={0.85}
      />
    </mesh>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Wish card                                                             */
/* ───────────────────────────────────────────────────────────────────── */
function WishCard({ wish, dimmed }: { wish: WishSlot; dimmed: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const noteTex = useMemo(() => makeNoteTexture(wish.text, wish.paper), [wish.text, wish.paper]);

  useEffect(() => () => noteTex.dispose(), [noteTex]);

  useFrame((_s, delta) => {
    const grp = groupRef.current;
    if (!grp) return;
    const targetOpacity = dimmed ? 0.55 : 1.0;
    const k = 1 - Math.pow(0.001, delta * 6);
    grp.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (m && !Array.isArray(m) && "opacity" in m) {
        const mat = m as THREE.Material & { opacity: number; transparent: boolean };
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity ?? 1, targetOpacity, k);
      }
    });
  });

  return (
    <group rotation={[-0.10, 0.06, 0]}>
      <group
        ref={groupRef}
        position={[wish.x, wish.y, 0.105]}
        rotation={[0, 0, wish.rotZ]}
      >
        <mesh castShadow>
          <boxGeometry args={[0.95, 0.55, 0.014]} />
          <meshStandardMaterial map={noteTex} roughness={0.9} />
        </mesh>
        <Tack x={0} y={0.2} z={0.020} />
      </group>
    </group>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Fabric swatch                                                         */
/* ───────────────────────────────────────────────────────────────────── */
function FabricSwatch({
  x,
  y,
  rotZ,
  color,
  weave,
  dimmed,
}: {
  x: number;
  y: number;
  rotZ: number;
  color: string;
  weave: THREE.Texture;
  dimmed: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_s, delta) => {
    const grp = groupRef.current;
    if (!grp) return;
    const targetOpacity = dimmed ? 0.6 : 1.0;
    const k = 1 - Math.pow(0.001, delta * 6);
    grp.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (m && !Array.isArray(m) && "opacity" in m) {
        const mat = m as THREE.Material & { opacity: number; transparent: boolean };
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity ?? 1, targetOpacity, k);
      }
    });
  });

  return (
    <group rotation={[-0.10, 0.06, 0]}>
      <group ref={groupRef} position={[x, y, 0.105]} rotation={[0, 0, rotZ]}>
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.55, 0.025]} />
          <meshStandardMaterial color={color} map={weave} roughness={1} />
        </mesh>
        <Tack x={-0.18} y={0.18} z={0.025} />
      </group>
    </group>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Cake mini-card                                                        */
/* ───────────────────────────────────────────────────────────────────── */
function CakeCard({ dimmed }: { dimmed: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const cakeTex = useMemo(() => makeCakeTexture(), []);
  useEffect(() => () => cakeTex.dispose(), [cakeTex]);

  useFrame((_s, delta) => {
    const grp = groupRef.current;
    if (!grp) return;
    const targetOpacity = dimmed ? 0.55 : 1.0;
    const k = 1 - Math.pow(0.001, delta * 6);
    grp.traverse((obj) => {
      const m = (obj as THREE.Mesh).material;
      if (m && !Array.isArray(m) && "opacity" in m) {
        const mat = m as THREE.Material & { opacity: number; transparent: boolean };
        mat.transparent = true;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity ?? 1, targetOpacity, k);
      }
    });
  });

  return (
    <group rotation={[-0.10, 0.06, 0]}>
      <group ref={groupRef} position={[0, -2.05, 0.105]} rotation={[0, 0, -0.04]}>
        <mesh castShadow>
          <boxGeometry args={[0.95, 0.7, 0.014]} />
          <meshStandardMaterial map={cakeTex} roughness={0.9} />
        </mesh>
        <Tack x={-0.4} y={0.27} z={0.018} />
        <Tack x={0.4} y={0.27} z={0.018} />
      </group>
    </group>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Dust particles                                                        */
/* ───────────────────────────────────────────────────────────────────── */
// Tiny seeded PRNG (mulberry32). Pure given the same seed.
function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDustGeometry(count: number) {
  const rng = makeRng(count * 9301 + 49297);
  const positions = new Float32Array(count * 3);
  const base: { x: number; y: number; z: number; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * 8 - 1;
    const y = rng() * 5 + 0.5;
    const z = rng() * 4 + 1;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    base.push({ x, y, z, phase: rng() * Math.PI * 2 });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return { geometry: g, base };
}

function DustParticles({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  // useState lazy initialiser runs once; impure-function rule allows this
  // because the initialiser is invoked synchronously by React, not on every
  // render. We treat the returned base data as read-only; the per-frame
  // mutable y offsets live in a separate ref.
  const [{ geometry, base }] = useState(() => buildDustGeometry(count));
  const yOffsetsRef = useRef<Float32Array | null>(null);

  if (yOffsetsRef.current === null) {
    yOffsetsRef.current = new Float32Array(base.length);
  }

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((state, delta) => {
    if (!ref.current || !yOffsetsRef.current) return;
    const positions = (ref.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const offsets = yOffsetsRef.current;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      offsets[i] += delta * 0.04;
      // Wrap at top: reset to a negative offset so the particle re-enters from the bottom
      const yWorld = b.y + offsets[i];
      if (yWorld > 3.5) offsets[i] -= 4.0;
      positions[i * 3] = b.x + Math.sin(t * 0.3 + b.phase) * 0.08;
      positions[i * 3 + 1] = b.y + offsets[i];
      positions[i * 3 + 2] = b.z + Math.cos(t * 0.25 + b.phase) * 0.05;
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        color="#fff4d6"
        size={0.018}
        transparent
        opacity={0.55}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* DOM overlay                                                           */
/* ───────────────────────────────────────────────────────────────────── */
function DomOverlay({
  isMobile,
  liftedIndex,
  onCloseLifted,
  sacramentoCls,
  caveatCls,
  liftedCaption,
}: {
  isMobile: boolean;
  liftedIndex: number | null;
  onCloseLifted: () => void;
  sacramentoCls: string;
  caveatCls: string;
  liftedCaption: string | null;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10,
        pointerEvents: "none",
        color: INK,
      }}
    >
      {/* Top-left eyebrow */}
      <div
        style={{
          position: "absolute",
          top: "3vh",
          left: "4vw",
          fontSize: 11,
          letterSpacing: "0.42em",
          textTransform: "uppercase",
          color: INK_SOFT,
          fontWeight: 600,
          opacity: 0,
          animation: "atelierFadeIn 0.7s ease-out 0.1s forwards",
        }}
      >
        atelier no. 14
      </div>

      {/* Top-centre title block */}
      <div
        style={{
          position: "absolute",
          top: "2.5vh",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          opacity: 0,
          animation: "atelierFadeIn 0.7s ease-out 0.15s forwards",
        }}
      >
        <div
          className={sacramentoCls}
          style={{
            fontSize: "clamp(28px, 4.4vw, 48px)",
            color: ROSE,
            lineHeight: 1,
            transform: "rotate(-3deg)",
            marginBottom: -6,
            filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.06))",
          }}
        >
          for Simren
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(34px, 5.2vw, 64px)",
            fontWeight: 500,
            letterSpacing: "0.12em",
            color: INK,
            lineHeight: 1,
          }}
        >
          SIMREN
        </h1>
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            letterSpacing: "0.5em",
            textTransform: "uppercase",
            color: INK_SOFT,
            fontWeight: 500,
          }}
        >
          may · 2026
        </div>
      </div>

      {/* Top-right small mark */}
      <div
        style={{
          position: "absolute",
          top: "3vh",
          right: "4vw",
          fontSize: 11,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: INK_SOFT,
          fontWeight: 600,
          textAlign: "right",
          opacity: 0,
          animation: "atelierFadeIn 0.7s ease-out 0.2s forwards",
        }}
      >
        a board, by hand
      </div>

      {/* Bottom drag-cue */}
      <div
        style={{
          position: "absolute",
          bottom: "3.5vh",
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          letterSpacing: "0.38em",
          textTransform: "uppercase",
          color: INK_SOFT,
          opacity: 0,
          animation: "atelierFadeInPulse 1.6s ease-in-out 1.2s infinite alternate",
        }}
      >
        {isMobile ? "drag to look around · tap a photo" : "drag to look · click a photo"}
      </div>

      {/* Bottom-right sign-off chip */}
      <div
        className={caveatCls}
        style={{
          position: "absolute",
          bottom: "3vh",
          right: "4vw",
          background: "#dcc591",
          padding: "10px 18px 12px 28px",
          clipPath: "polygon(12% 8%, 100% 0, 100% 100%, 12% 92%, 0 50%)",
          boxShadow:
            "0 12px 24px -10px rgba(42,42,42,0.4), 0 4px 8px -4px rgba(42,42,42,0.22)",
          textAlign: "center",
          color: INK,
          opacity: 0,
          animation: "atelierFadeIn 0.8s ease-out 0.5s forwards",
          minWidth: 130,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            fontWeight: 600,
            color: INK,
            fontFamily: "ui-serif, Georgia, serif",
          }}
        >
          made with care
        </div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.26em",
            color: INK_SOFT,
            textTransform: "uppercase",
            marginTop: 1,
          }}
        >
          no. 5 · 14 · 26
        </div>
      </div>

      {/* Lifted-photo caption + close hint (centered above board when active) */}
      {liftedIndex !== null && liftedCaption && (
        <div
          style={{
            position: "absolute",
            top: "12vh",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "auto",
          }}
        >
          <div
            className={caveatCls}
            style={{
              fontSize: "clamp(22px, 3vw, 30px)",
              color: INK,
              opacity: 0,
              animation: "atelierFadeIn 0.5s ease-out 0.05s forwards",
              transform: "rotate(-1.5deg)",
            }}
          >
            {liftedCaption}
          </div>
          <button
            type="button"
            onClick={onCloseLifted}
            style={{
              marginTop: 14,
              background: "transparent",
              border: `1px solid ${INK_SOFT}55`,
              color: INK_SOFT,
              padding: "6px 16px",
              fontSize: 10,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "ui-serif, Georgia, serif",
              borderRadius: 0,
              opacity: 0,
              animation: "atelierFadeIn 0.5s ease-out 0.15s forwards",
            }}
          >
            close
          </button>
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes atelierFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes atelierFadeInPulse {
          0%   { opacity: 0.4; }
          100% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Static fallback (always rendered behind canvas; visible immediately)  */
/* ───────────────────────────────────────────────────────────────────── */
function StaticBoardFallback() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background:
          "radial-gradient(ellipse at 30% 20%, rgba(255,250,235,0.7) 0%, transparent 55%)," +
          "radial-gradient(ellipse at 80% 80%, rgba(184,146,63,0.10) 0%, transparent 60%)," +
          `linear-gradient(180deg, ${CREAM} 0%, #efe4cc 60%, #e8dcc2 100%)`,
      }}
    >
      {/* Subtle vignette so the cream isn't flat while the canvas spins up */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(90,74,58,0.16) 100%)",
        }}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────── */
/* Procedural canvas textures                                            */
/* ───────────────────────────────────────────────────────────────────── */

function makeCorkTexture(): THREE.Texture {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  // Base
  ctx.fillStyle = "#d8c39a";
  ctx.fillRect(0, 0, size, size);

  // Cork flecks: 4000 short tan/brown strokes
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 4;
    const angle = Math.random() * Math.PI;
    const hue = 30 + Math.random() * 18;
    const sat = 25 + Math.random() * 18;
    const light = 40 + Math.random() * 25;
    ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.25 + Math.random() * 0.5})`;
    ctx.lineWidth = 0.7 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Soft warm vignette
  const grad = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.2,
    size / 2, size / 2, size * 0.7,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(40,30,15,0.28)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeTapeStripeTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.0)";
  ctx.fillRect(0, 0, size, size);
  // Diagonal hatch
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 6;
  for (let i = -size; i < size * 2; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  // Soft fade at left/right edges
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, "rgba(0,0,0,0.45)");
  grad.addColorStop(0.1, "rgba(0,0,0,0)");
  grad.addColorStop(0.9, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeFabricWeaveTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.0)";
  ctx.fillRect(0, 0, size, size);
  // Cross-hatch weave
  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

function makeNoteTexture(text: string, paper: "cream" | "kraft" | "pink"): THREE.Texture {
  // Aspect 0.95 × 0.55 → use 950×550 canvas
  const w = 950;
  const h = 550;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  // Paper colour
  const bg =
    paper === "cream" ? "#fffaf0" :
    paper === "kraft" ? "#c8a878" :
    "#f5c8c4";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Paper grain — random low-alpha specks
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Slight border shadow
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.10)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Hand-written-ish wish text
  ctx.fillStyle = paper === "kraft" ? "#1f1810" : "#2a2a2a";
  ctx.font = "italic 46px 'Caveat', 'Snell Roundhand', cursive";
  ctx.textBaseline = "top";

  const lines = wrapText(ctx, text, w - 80);
  let y = 80;
  for (const line of lines) {
    // Slight per-line wobble
    ctx.save();
    ctx.translate(40 + (Math.random() - 0.5) * 4, y + (Math.random() - 0.5) * 2);
    ctx.rotate((Math.random() - 0.5) * 0.012);
    ctx.fillText(line, 0, 0);
    ctx.restore();
    y += 60;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makeCakeTexture(): THREE.Texture {
  const w = 950;
  const h = 700;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;

  // Cream paper background
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, w, h);

  // Paper grain
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Pencil cake — three tiers + plate + candle
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Plate (ellipse)
  ctx.beginPath();
  ctx.ellipse(w / 2, 540, 360, 22, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Bottom tier
  drawWobblyPath(ctx, [
    [w / 2 - 280, 540],
    [w / 2 - 280, 380],
    [w / 2 + 280, 380],
    [w / 2 + 280, 540],
  ]);
  // Bottom tier top oval
  ctx.beginPath();
  ctx.ellipse(w / 2, 380, 280, 22, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Mid tier
  drawWobblyPath(ctx, [
    [w / 2 - 200, 380],
    [w / 2 - 200, 250],
    [w / 2 + 200, 250],
    [w / 2 + 200, 380],
  ]);
  ctx.beginPath();
  ctx.ellipse(w / 2, 250, 200, 18, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Top tier
  drawWobblyPath(ctx, [
    [w / 2 - 130, 250],
    [w / 2 - 130, 145],
    [w / 2 + 130, 145],
    [w / 2 + 130, 250],
  ]);
  ctx.beginPath();
  ctx.ellipse(w / 2, 145, 130, 14, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Big candle
  ctx.beginPath();
  ctx.rect(w / 2 - 14, 80, 28, 65);
  ctx.stroke();
  // Wick
  ctx.beginPath();
  ctx.moveTo(w / 2, 80);
  ctx.lineTo(w / 2, 60);
  ctx.stroke();
  // Flame (rose-tinted)
  ctx.fillStyle = "rgba(201,122,118,0.6)";
  ctx.beginPath();
  ctx.moveTo(w / 2, 30);
  ctx.quadraticCurveTo(w / 2 + 22, 50, w / 2 + 8, 65);
  ctx.quadraticCurveTo(w / 2, 75, w / 2 - 8, 65);
  ctx.quadraticCurveTo(w / 2 - 22, 50, w / 2, 30);
  ctx.fill();
  ctx.stroke();

  // Caption "make 14 wishes — only need one"
  ctx.fillStyle = "#5a4a3a";
  ctx.font = "italic 38px 'Caveat', 'Snell Roundhand', cursive";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("make 14 wishes — only need one", w / 2, 650);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function drawWobblyPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x + (Math.random() - 0.5) * 1.5, y + (Math.random() - 0.5) * 1.5);
  }
  ctx.stroke();
}
