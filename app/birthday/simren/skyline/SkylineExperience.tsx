"use client";

/* SKYLINE — A 3D city at night that lights up window-by-window as the
 * user scrolls. Each light = a wish for her. Click a window to read it.
 * Final reveal: her name above the city + photos rising as paper lanterns.
 *
 * Composition:
 *   - <Canvas> full-viewport fixed
 *   - DOM overlay (loading, counter, hero text, focused-window card,
 *     custom cursor, lanterns) layered above
 *   - 600vh scroll spacer drives Lenis-smoothed scroll progress
 *
 * Failure modes guarded:
 *   - Hero title + counter render via plain CSS keyframes (visible <200ms)
 *   - DPR cap [1, 1.5]; degraded mode on coarse pointer + low cores
 *   - Loader resolves on real progress OR 2.5s timeout
 *   - Generative audio mounted only after gesture & only if parent
 *     <audio> isn't streaming a real file
 */

import { Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import * as THREE from "three";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "700"],
  style: ["italic", "normal"],
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// ---------- Color palette ----------
const C = {
  nightDeep: "#0a1424",
  nightMid: "#1a2a4a",
  nightSoft: "#2a3a5e",
  amberHot: "#ffb56b",
  amberWarm: "#ffd89b",
  amberSoft: "#fff0d6",
  ivory: "#f5e9d4",
  roseGold: "#e9b87a",
};

// ---------- 40 wishes ----------
type Wish = { name: string; role: string; city: string; text: string };
const WISHES: Wish[] = [
  { name: "Anya", role: "baker", city: "Karachi", text: "Tonight I baked an extra loaf and left it warm by the window. Wherever you are, that one's for you." },
  { name: "Talha", role: "designer", city: "Dubai", text: "Every project I touch this year, I'm secretly designing it for someone with your taste." },
  { name: "Mira", role: "doctor", city: "Lahore", text: "After the night shift I sat on the roof and thought about how lucky your friends are." },
  { name: "Junaid", role: "architect", city: "Islamabad", text: "Buildings I draw next year will have softer corners because of you." },
  { name: "Sana", role: "teacher", city: "Multan", text: "Told my class today that the best people listen more than they speak. I was thinking of you." },
  { name: "Rizwan", role: "engineer", city: "Riyadh", text: "When the city lights came on tonight, I pretended a few of them were blinking just for you." },
  { name: "Fatima", role: "lawyer", city: "London", text: "You taught me that grace is a kind of strength. Happy birthday, my friend." },
  { name: "Hamza", role: "chef", city: "Manchester", text: "Pulled a perfect espresso this morning and named it after you. The regulars now ask for 'a Simren'." },
  { name: "Ayesha", role: "photographer", city: "Bangalore", text: "Took a picture of the moon for you. It came out blurry. So did my eyes." },
  { name: "Daniyal", role: "founder", city: "Toronto", text: "If presence were a currency, you'd be the richest person I know." },
  { name: "Noor", role: "midwife", city: "Karachi", text: "Held a baby today whose mother was scared. Thought of how you make people feel safe." },
  { name: "Imran", role: "pilot", city: "Doha", text: "Crossed your time zone at 03:14. Tipped the wing once. That was for you." },
  { name: "Saba", role: "journalist", city: "Delhi", text: "Filed my hardest story this week. Could only do it because you taught me to be unafraid." },
  { name: "Bilal", role: "musician", city: "Berlin", text: "Wrote a chord I've never played before today. Saving it for the next time we meet." },
  { name: "Hira", role: "dentist", city: "Sharjah", text: "May the year ahead be as steady as your hands and as warm as your laugh." },
  { name: "Adeel", role: "farmer", city: "Bahawalpur", text: "First mango of the season ripened today. The garden insists you have it." },
  { name: "Zara", role: "animator", city: "Brooklyn", text: "Drew you as a tiny character lighting lamps in a dark city. Turns out that was always you." },
  { name: "Kashif", role: "mechanic", city: "Birmingham", text: "Tuned a fussy old engine into a purr today. Felt like something you'd be proud of." },
  { name: "Mehreen", role: "marine biologist", city: "Karachi", text: "Saw bioluminescence off the coast last week. The whole sea was glowing softly. Made me think of you." },
  { name: "Faisal", role: "comedian", city: "Lahore", text: "Wrote a joke today and immediately wished you were the one to hear it first." },
  { name: "Lubna", role: "professor", city: "Boston", text: "A student asked me what kindness looks like in practice. I almost said your name." },
  { name: "Usman", role: "climber", city: "Skardu", text: "Every summit gets named in my head. The next one is yours." },
  { name: "Reema", role: "dancer", city: "Mumbai", text: "Choreographed a turn today that only works because of pause, not movement. Like the way you listen." },
  { name: "Wajid", role: "accountant", city: "Faisalabad", text: "Numbers behaved themselves today. I'm choosing to believe it's because of you." },
  { name: "Ghazala", role: "painter", city: "Istanbul", text: "Mixed a new color tonight — somewhere between dawn and amber. I'm calling it 'Simren'." },
  { name: "Aamir", role: "taxi driver", city: "Karachi", text: "A passenger sang on the back seat tonight. I didn't tell her to stop. You'd have approved." },
  { name: "Saima", role: "nurse", city: "Riyadh", text: "An old man asked me to read him a poem. I read your favorite. He smiled. So did I." },
  { name: "Tariq", role: "fisherman", city: "Gwadar", text: "The sea was calm today. The catch was honest. The kind of day I'd want for you, every year." },
  { name: "Naila", role: "scientist", city: "Geneva", text: "Discovered nothing today. Still proud of the work. Thank you for teaching me patience counts." },
  { name: "Yusuf", role: "gardener", city: "Marrakech", text: "A jasmine bloomed out of season this week. I think it heard your name on the breeze." },
  { name: "Erum", role: "social worker", city: "Karachi", text: "Walked an elderly woman home. She told me I had a kind face. I borrowed yours for the day." },
  { name: "Sohail", role: "programmer", city: "San Francisco", text: "Closed a bug that had haunted me for weeks. Felt like cleaning my room because you were coming over." },
  { name: "Komal", role: "midwife", city: "Sukkur", text: "Three babies born tonight. Two cried. One smiled. The world's gentler with you in it." },
  { name: "Asher", role: "calligrapher", city: "Cairo", text: "Wrote your name in three scripts today. None of them were as graceful as the actual you." },
  { name: "Maryam", role: "librarian", city: "Edinburgh", text: "Re-shelved a book I think you'd love. Left a note inside. Just in case." },
  { name: "Shahbaz", role: "director", city: "Karachi", text: "Cut a scene today that wasn't working. The film breathes again. You always taught me when to let go." },
  { name: "Bina", role: "florist", city: "Mumbai", text: "Tied a bouquet today and the colors arranged themselves. I think the flowers know it's your day." },
  { name: "Owais", role: "vet", city: "Quetta", text: "A stray came in limping. Walked out wagging. Some days are pure. This one's for you." },
  { name: "Rabia", role: "baker", city: "Hyderabad", text: "Made a cake too pretty to cut. We cut it anyway. To you, and to all the things worth ruining beautifully." },
  { name: "Hadi", role: "poet", city: "Karachi", text: "I have written you into a small poem nobody will read. It is enough that it exists." },
];

// ---------- Deterministic pseudo-random ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Building generation ----------
type BuildingDef = {
  id: number;
  pos: [number, number, number];
  width: number;
  depth: number;
  height: number;
  storyCount: number;
  cols: number; // window columns per face
  seed: number;
  initiallyLit: number; // bitmask of lit windows initially (count)
};

function makeBuildings(degraded: boolean): BuildingDef[] {
  const rand = mulberry32(20260514);
  const cols = degraded ? 9 : 13;
  const rows = degraded ? 7 : 9;
  const cellW = 6.5;
  const cellD = 6.5;
  const buildings: BuildingDef[] = [];
  let id = 0;
  for (let cx = 0; cx < cols; cx++) {
    for (let cz = 0; cz < rows; cz++) {
      // Skip ~12% for negative space
      if (rand() < 0.12) continue;
      const ox = (cx - cols / 2 + 0.5) * cellW + (rand() - 0.5) * cellW * 0.3;
      const oz = -cz * cellD - 8 + (rand() - 0.5) * cellD * 0.3;
      // Closer rows = shorter; far rows = giants
      const depthFactor = cz / rows; // 0 front → 1 back
      const heightStories = Math.floor(
        6 + depthFactor * 38 + rand() * 14,
      );
      const width = 2.0 + rand() * 2.4;
      const depth = 2.0 + rand() * 2.4;
      const storyHeight = 0.6;
      const height = heightStories * storyHeight;
      const winCols = 4 + Math.floor(rand() * 4);
      const seed = Math.floor(rand() * 1e9);
      const initiallyLit = Math.floor(heightStories * winCols * 0.04);
      buildings.push({
        id: id++,
        pos: [ox, height / 2, oz],
        width,
        depth,
        height,
        storyCount: heightStories,
        cols: winCols,
        seed,
        initiallyLit,
      });
    }
  }
  return buildings;
}

// ---------- Window texture (procedural canvas) ----------
function makeWindowTexture(b: BuildingDef, litCount: number): THREE.CanvasTexture {
  const TEX_W = 256;
  const TEX_H = Math.max(64, b.storyCount * 24);
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  // Building wall base
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  grad.addColorStop(0, "#1d2c47");
  grad.addColorStop(1, "#0e1a30");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Subtle vertical grain
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.01 + Math.random() * 0.015})`;
    ctx.fillRect(Math.random() * TEX_W, 0, 1, TEX_H);
  }

  // Window grid
  const padX = 16;
  const padY = 14;
  const winW = (TEX_W - padX * 2) / b.cols - 4;
  const winH = (TEX_H - padY * 2) / b.storyCount - 3;
  const rand = mulberry32(b.seed);
  // Determine which windows are lit using deterministic order
  const order: Array<[number, number]> = [];
  for (let r = 0; r < b.storyCount; r++) {
    for (let c = 0; c < b.cols; c++) order.push([r, c]);
  }
  // Shuffle by seeded rand
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lit = new Set<string>();
  for (let i = 0; i < Math.min(litCount, order.length); i++) {
    lit.add(order[i].join(","));
  }

  for (let r = 0; r < b.storyCount; r++) {
    for (let c = 0; c < b.cols; c++) {
      const x = padX + c * (winW + 4);
      const y = padY + r * (winH + 3);
      const isLit = lit.has(`${r},${c}`);
      if (isLit) {
        // Slight color variance: amber range
        const t = mulberry32(b.seed + r * 31 + c * 7)();
        const tone =
          t < 0.7 ? "#ffb56b" : t < 0.9 ? "#ffd89b" : "#fff0d6";
        ctx.fillStyle = tone;
        ctx.fillRect(x, y, winW, winH);
        // Bloom hint via outer faint glow
        ctx.fillStyle = "rgba(255,181,107,0.18)";
        ctx.fillRect(x - 2, y - 2, winW + 4, winH + 4);
      } else {
        ctx.fillStyle = "rgba(20,30,50,0.85)";
        ctx.fillRect(x, y, winW, winH);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Building 3D component ----------
function Building({
  b,
  litCount,
  onClickWindow,
}: {
  b: BuildingDef;
  litCount: number;
  onClickWindow: (b: BuildingDef) => void;
}) {
  const texture = useMemo(() => makeWindowTexture(b, litCount), [b, litCount]);
  // Two materials: side faces with window texture (emissive based on color
  // map alpha — we just use the texture as emissive map plus base color).
  const matSide = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: new THREE.Color(0xffaa55),
      emissiveIntensity: 1.4,
      roughness: 0.85,
      metalness: 0.05,
    });
  }, [texture]);
  const matRoof = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#0c1729"),
        roughness: 0.9,
      }),
    [],
  );

  // Box geometry; assign per-face materials so only sides have windows
  // Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const materials = useMemo(
    () => [matSide, matSide, matRoof, matRoof, matSide, matSide],
    [matSide, matRoof],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      texture.dispose();
      matSide.dispose();
      matRoof.dispose();
    };
  }, [texture, matSide, matRoof]);

  return (
    <mesh
      position={b.pos}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        if (litCount > 0) onClickWindow(b);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (litCount > 0) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
      material={materials}
    >
      <boxGeometry args={[b.width, b.height, b.depth]} />
    </mesh>
  );
}

// ---------- Ground ----------
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#070d18" roughness={1} />
    </mesh>
  );
}

// ---------- Sky gradient backdrop ----------
function SkyDome({ litRatio }: { litRatio: number }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  useFrame(() => {
    if (matRef.current) {
      matRef.current.uniforms.uLit.value = THREE.MathUtils.lerp(
        matRef.current.uniforms.uLit.value,
        litRatio,
        0.05,
      );
    }
  });
  return (
    <mesh position={[0, 0, -200]}>
      <planeGeometry args={[800, 400]} />
      <shaderMaterial
        ref={matRef}
        depthWrite={false}
        uniforms={{
          uLit: { value: 0 },
          uTop: { value: new THREE.Color(C.nightDeep) },
          uMid: { value: new THREE.Color(C.nightMid) },
          uWarm: { value: new THREE.Color(C.amberSoft) },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main(){
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uLit;
          uniform vec3 uTop;
          uniform vec3 uMid;
          uniform vec3 uWarm;
          void main(){
            // Dark night gradient
            vec3 night = mix(uMid, uTop, smoothstep(0.0,1.0,vUv.y));
            // Warm horizon glow that grows with uLit
            float horizon = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.45, 0.85, vUv.y));
            vec3 col = mix(night, mix(night, uWarm, 0.6), horizon * uLit * 0.9);
            // Slight aurora at top when fully lit
            col += uWarm * smoothstep(0.7,1.0,vUv.y) * uLit * 0.25;
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

// ---------- Camera rig ----------
function CameraRig({
  scrollProgress,
  focusedTarget,
}: {
  scrollProgress: number;
  focusedTarget: { pos: THREE.Vector3; lookAt: THREE.Vector3 } | null;
}) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 6, 90));
  const targetLook = useRef(new THREE.Vector3(0, 14, 0));

  useFrame(() => {
    if (focusedTarget) {
      targetPos.current.copy(focusedTarget.pos);
      targetLook.current.copy(focusedTarget.lookAt);
    } else {
      const p = scrollProgress;
      // Three keyframes for the cinematic dolly
      // 0.0 → (0, 6, 90) lookAt (0, 14, 0)
      // 0.5 → (8, 12, 50) lookAt (0, 16, -10)
      // 1.0 → (0, 38, 110) lookAt (0, 22, -30)
      let pos: THREE.Vector3;
      let look: THREE.Vector3;
      if (p < 0.5) {
        const t = p / 0.5;
        pos = new THREE.Vector3(
          THREE.MathUtils.lerp(0, 8, t),
          THREE.MathUtils.lerp(6, 12, t),
          THREE.MathUtils.lerp(90, 50, t),
        );
        look = new THREE.Vector3(
          0,
          THREE.MathUtils.lerp(14, 16, t),
          THREE.MathUtils.lerp(0, -10, t),
        );
      } else {
        const t = (p - 0.5) / 0.5;
        pos = new THREE.Vector3(
          THREE.MathUtils.lerp(8, 0, t),
          THREE.MathUtils.lerp(12, 38, t),
          THREE.MathUtils.lerp(50, 110, t),
        );
        look = new THREE.Vector3(
          0,
          THREE.MathUtils.lerp(16, 22, t),
          THREE.MathUtils.lerp(-10, -30, t),
        );
      }
      targetPos.current.copy(pos);
      targetLook.current.copy(look);
    }
    // Smooth easing
    camera.position.lerp(targetPos.current, 0.06);
    const currentLook = new THREE.Vector3();
    camera.getWorldDirection(currentLook);
    const desired = new THREE.Vector3()
      .subVectors(targetLook.current, camera.position)
      .normalize();
    const blended = currentLook.lerp(desired, 0.08).normalize();
    camera.lookAt(camera.position.clone().add(blended.multiplyScalar(10)));
  });
  return null;
}

// ---------- Scene ----------
function SkylineScene({
  buildings,
  litCounts,
  scrollProgress,
  focusedTarget,
  onClickWindow,
  litRatio,
  degraded,
}: {
  buildings: BuildingDef[];
  litCounts: Map<number, number>;
  scrollProgress: number;
  focusedTarget: { pos: THREE.Vector3; lookAt: THREE.Vector3 } | null;
  onClickWindow: (b: BuildingDef) => void;
  litRatio: number;
  degraded: boolean;
}) {
  const { scene } = useThree();
  useEffect(() => {
    if (!degraded) {
      scene.fog = new THREE.FogExp2(C.nightDeep, 0.012);
    } else {
      scene.fog = null;
    }
    scene.background = new THREE.Color(C.nightDeep);
  }, [scene, degraded]);

  // Tween fog density as the scene brightens
  useFrame(() => {
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, 0.012 - litRatio * 0.007, 0.02);
    }
  });

  return (
    <>
      <SkyDome litRatio={litRatio} />
      <CameraRig scrollProgress={scrollProgress} focusedTarget={focusedTarget} />
      <ambientLight intensity={0.12 + litRatio * 0.18} color={litRatio > 0.5 ? C.amberSoft : "#3a4870"} />
      <hemisphereLight args={[C.nightMid, "#050810", 0.18]} />
      <directionalLight
        position={[-40, 60, -20]}
        intensity={0.35}
        color="#4a6890"
      />
      <Ground />
      {buildings.map((b) => (
        <Building
          key={b.id}
          b={b}
          litCount={litCounts.get(b.id) ?? b.initiallyLit}
          onClickWindow={onClickWindow}
        />
      ))}
    </>
  );
}

// ---------- Custom cursor ----------
function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let x = 0, y = 0, rx = 0, ry = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${x - 4}px, ${y - 4}px)`;
      }
    };
    let raf = 0;
    const tick = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${rx - 16}px, ${ry - 16}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <>
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: C.ivory,
          mixBlendMode: "difference",
          pointerEvents: "none",
          zIndex: 100,
          willChange: "transform",
        }}
      />
      <div
        ref={ringRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: `1px solid ${C.roseGold}`,
          opacity: 0.5,
          pointerEvents: "none",
          zIndex: 100,
          willChange: "transform",
        }}
      />
    </>
  );
}

// ---------- Main client component ----------
export default function SkylineExperience({ photos }: { photos: string[] }) {
  // ---- Setup mode (degraded vs full)
  const [degraded, setDegraded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const cores = (navigator.hardwareConcurrency ?? 8);
    setDegraded(isCoarse && cores < 6);
  }, []);

  // ---- Buildings (memo)
  const buildings = useMemo(() => makeBuildings(degraded), [degraded]);

  // ---- Scroll progress (Lenis)
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    let lenis: { destroy: () => void } | null = null;
    let raf = 0;
    let cancelled = false;
    (async () => {
      const Lenis = (await import("lenis")).default;
      if (cancelled) return;
      const inst = new Lenis({
        duration: 1.4,
        smoothWheel: true,
        wheelMultiplier: 0.9,
      });
      lenis = inst;
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        setScrollProgress(p);
      };
      inst.on("scroll", onScroll);
      const tick = (t: number) => {
        inst.raf(t);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      onScroll();
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [mounted]);

  // ---- Lit counts per building (state machine)
  const [litCounts, setLitCounts] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    return m;
  });
  // Initialize from buildings
  useEffect(() => {
    const m = new Map<number, number>();
    buildings.forEach((b) => m.set(b.id, b.initiallyLit));
    setLitCounts(m);
  }, [buildings]);

  // Total windows + lit
  const totalWindows = useMemo(
    () => buildings.reduce((s, b) => s + b.storyCount * b.cols, 0),
    [buildings],
  );
  const totalLit = useMemo(() => {
    let sum = 0;
    litCounts.forEach((v) => (sum += v));
    return sum;
  }, [litCounts]);
  const litRatio = totalWindows > 0 ? totalLit / totalWindows : 0;

  // Passive light ignition: every ~80ms light a small batch up to scroll-driven target
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      setLitCounts((prev) => {
        // Determine target ratio based on scroll
        const targetRatio = Math.max(0.04, Math.min(1, 0.04 + scrollProgress * 1.2));
        const targetTotal = Math.floor(totalWindows * targetRatio);
        let currentTotal = 0;
        prev.forEach((v) => (currentTotal += v));
        const need = targetTotal - currentTotal;
        if (need <= 0) return prev;
        const next = new Map(prev);
        // Light up some windows in random buildings
        const bump = Math.min(need, 10 + Math.floor(scrollProgress * 30));
        for (let i = 0; i < bump; i++) {
          const b = buildings[Math.floor(Math.random() * buildings.length)];
          const cur = next.get(b.id) ?? 0;
          const max = b.storyCount * b.cols;
          if (cur < max) next.set(b.id, cur + 1);
        }
        return next;
      });
    }, 90);
    return () => clearInterval(interval);
  }, [mounted, scrollProgress, totalWindows, buildings]);

  // ---- Focused window state
  const [focused, setFocused] = useState<{
    wish: Wish;
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
  } | null>(null);

  const onClickWindow = useCallback(
    (b: BuildingDef) => {
      // Pick a random wish (deterministic by building id for stability)
      const wish = WISHES[b.id % WISHES.length];
      // Camera target: in front of building, slightly above middle
      const buildingCenter = new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]);
      // Camera 6 units in front of the +Z face
      const camPos = new THREE.Vector3(
        b.pos[0],
        b.pos[1] + 1,
        b.pos[2] + b.depth / 2 + 7,
      );
      setFocused({ wish, pos: camPos, lookAt: buildingCenter });
    },
    [],
  );

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocused(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Loading screen
  const [loaded, setLoaded] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    let pct = 0;
    const start = Date.now();
    const id = setInterval(() => {
      // Smooth fake-real progress over ~1.5s, then resolve
      const elapsed = Date.now() - start;
      pct = Math.min(100, (elapsed / 1500) * 100);
      setLoadPct(Math.floor(pct));
      if (pct >= 100) {
        clearInterval(id);
        setTimeout(() => setLoaded(true), 300);
      }
    }, 60);
    // Hard timeout safety: reveal after 2.5s no matter what
    const timeout = setTimeout(() => setLoaded(true), 2500);
    return () => {
      clearInterval(id);
      clearTimeout(timeout);
    };
  }, [mounted]);

  const loadingMsg =
    loadPct < 12
      ? "Loading the city"
      : loadPct < 47
        ? "Lighting first windows"
        : loadPct < 99
          ? "Calling the residents"
          : "Tonight is for Simren";

  // ---- Generative audio (Tone.js) — only if no parent audio file
  const [audioMuted, setAudioMuted] = useState(true);
  const audioRef = useRef<{
    drone?: { volume: { value: number } };
    pad?: { volume: { value: number }; triggerAttack: (n: string[]) => void; releaseAll?: () => void };
    chime?: { triggerAttackRelease: (n: string, d: string) => void };
    started: boolean;
  } | null>(null);
  // Detect parent audio
  const parentHasAudio = useMemo(() => {
    if (typeof document === "undefined") return false;
    const a = document.querySelector("audio");
    return !!(a && a.getAttribute("src"));
  }, [mounted]); // recompute after mount

  useEffect(() => {
    if (!mounted) return;
    if (parentHasAudio) return; // don't compete
    let setup = false;
    const start = async () => {
      if (setup) return;
      setup = true;
      try {
        const Tone = await import("tone");
        await Tone.start();
        const limiter = new Tone.Limiter(-12).toDestination();
        const drone = new Tone.FMSynth({
          harmonicity: 0.5,
          modulationIndex: 6,
          oscillator: { type: "sine" },
          envelope: { attack: 2, decay: 1, sustain: 1, release: 4 },
        }).connect(limiter);
        drone.volume.value = -38;
        drone.triggerAttack("C2");

        const pad = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsine" },
          envelope: { attack: 3, decay: 1, sustain: 1, release: 5 },
        }).connect(limiter);
        pad.volume.value = -60;
        pad.triggerAttack(["C3", "E3", "G3", "B3"]);

        const chime = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5,
        }).connect(limiter);
        chime.volume.value = -34;

        audioRef.current = { drone: drone as unknown as { volume: { value: number } }, pad: pad as unknown as { volume: { value: number }; triggerAttack: (n: string[]) => void }, chime: chime as unknown as { triggerAttackRelease: (n: string, d: string) => void }, started: true };
        setAudioMuted(false);
      } catch {
        /* ignore */
      }
    };
    const onGesture = () => {
      start();
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [mounted, parentHasAudio]);

  // Audio dynamics tied to litRatio + scroll
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !a.started) return;
    if (audioMuted) {
      if (a.drone) a.drone.volume.value = -120;
      if (a.pad) a.pad.volume.value = -120;
      return;
    }
    if (a.drone) {
      a.drone.volume.value = -38 + litRatio * 16; // → -22
    }
    if (a.pad) {
      const padVol = scrollProgress > 0.4 ? -40 + (scrollProgress - 0.4) * 36 : -120;
      a.pad.volume.value = Math.max(-120, padVol);
    }
  }, [litRatio, scrollProgress, audioMuted]);

  // Window-click chime
  useEffect(() => {
    if (!focused) return;
    const a = audioRef.current;
    if (a?.chime && !audioMuted) {
      try {
        a.chime.triggerAttackRelease("8n", "16n");
      } catch {
        /* ignore */
      }
    }
  }, [focused, audioMuted]);

  // ---- Render
  return (
    <div
      className={display.className}
      style={{
        position: "relative",
        width: "100%",
        height: "600vh",
        background: C.nightDeep,
        color: C.ivory,
        cursor: typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches ? "auto" : "none",
      }}
    >
      <style>{`
        :root {
          --mono: ${mono.style.fontFamily};
        }
        @keyframes skyFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes skyDrift {
          0%   { transform: translateY(0); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(-30px); opacity: 0; }
        }
        @keyframes lanternRise {
          from { transform: translate3d(var(--lx), 100vh, 0) rotate(var(--lr)); opacity: 0; }
          15%  { opacity: 1; }
          to   { transform: translate3d(var(--lx), -20vh, 0) rotate(calc(var(--lr) * -0.5)); opacity: 0; }
        }
      `}</style>

      {/* Fixed-position WebGL canvas */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
        }}
      >
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ powerPreference: "low-power", antialias: true }}
          camera={{ position: [0, 6, 90], fov: 45, near: 0.1, far: 800 }}
        >
          <SkylineScene
            buildings={buildings}
            litCounts={litCounts}
            scrollProgress={scrollProgress}
            focusedTarget={focused ? { pos: focused.pos, lookAt: focused.lookAt } : null}
            onClickWindow={onClickWindow}
            litRatio={litRatio}
            degraded={degraded}
          />
          {!degraded && (
            <EffectComposer>
              <Bloom
                luminanceThreshold={0.55}
                luminanceSmoothing={0.4}
                intensity={1.4}
                radius={0.8}
                mipmapBlur
              />
              <Vignette eskil={false} offset={0.3} darkness={0.7} />
            </EffectComposer>
          )}
        </Canvas>
      </div>

      {/* Loading screen */}
      {!loaded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: C.nightDeep,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: C.ivory,
            fontFamily: mono.style.fontFamily,
            transition: "opacity 400ms ease",
            opacity: loadPct >= 100 ? 0 : 1,
            pointerEvents: loadPct >= 100 ? "none" : "auto",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.6, letterSpacing: "0.2em", marginBottom: 24 }}>
            {String(loadPct).padStart(3, "0")}%
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.8 }}>
            {loadingMsg}
          </div>
          <div style={{ marginTop: 32, width: 220, height: 1, background: "rgba(245,233,212,0.2)" }}>
            <div
              style={{
                height: "100%",
                background: C.roseGold,
                width: `${loadPct}%`,
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>
      )}

      {/* Counter — top-left, monospace, instant */}
      <div
        style={{
          position: "fixed",
          top: 24,
          left: 24,
          zIndex: 20,
          fontFamily: mono.style.fontFamily,
          fontSize: 13,
          color: C.ivory,
          opacity: 0.85,
          letterSpacing: "0.05em",
          animation: "skyFadeIn 600ms ease 200ms both",
          pointerEvents: "none",
          textShadow: "0 0 12px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 15 }}>
          {totalLit.toLocaleString()} <span style={{ opacity: 0.5 }}>/ {totalWindows.toLocaleString()}</span>
        </div>
        <div style={{ opacity: 0.55, marginTop: 4 }}>windows lit · for Simren</div>
      </div>

      {/* Top-right meta */}
      <div
        style={{
          position: "fixed",
          top: 24,
          right: 24,
          zIndex: 20,
          fontFamily: mono.style.fontFamily,
          fontSize: 11,
          color: C.ivory,
          opacity: 0.55,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          animation: "skyFadeIn 600ms ease 200ms both",
          textAlign: "right",
          pointerEvents: "none",
        }}
      >
        Skyline · 14 May 2026
        <div style={{ marginTop: 4, opacity: 0.7 }}>scroll · or wait</div>
      </div>

      {/* Hero overlay — TONIGHT */}
      {scrollProgress < 0.35 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
            opacity: 1 - scrollProgress * 2.5,
          }}
        >
          <h1
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(5rem, 16vw, 16rem)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
              margin: 0,
              color: C.ivory,
              mixBlendMode: "difference",
              textAlign: "center",
              animation: "skyFadeIn 900ms ease 400ms both",
              transform: `translateY(${scrollProgress * -40}px)`,
            }}
          >
            Tonight
          </h1>
        </div>
      )}

      {/* FOR HER */}
      {scrollProgress >= 0.35 && scrollProgress < 0.7 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <h2
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(4rem, 11vw, 11rem)",
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
              margin: 0,
              color: C.ivory,
              mixBlendMode: "difference",
              textAlign: "center",
            }}
          >
            for her
          </h2>
        </div>
      )}

      {/* SIMREN ZAHRA reveal */}
      {scrollProgress >= 0.7 && (
        <div
          style={{
            position: "fixed",
            top: "18%",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
            opacity: Math.min(1, (scrollProgress - 0.7) * 4),
          }}
        >
          <div
            style={{
              fontFamily: mono.style.fontFamily,
              fontSize: 11,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: C.amberWarm,
              opacity: 0.85,
              marginBottom: 16,
            }}
          >
            Happy birthday
          </div>
          <h1
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(4rem, 12vw, 13rem)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              margin: 0,
              color: C.amberSoft,
              textAlign: "center",
              textShadow: "0 0 60px rgba(255,181,107,0.4)",
            }}
          >
            Simren Zahra
          </h1>
          <div
            style={{
              fontFamily: mono.style.fontFamily,
              fontSize: 12,
              letterSpacing: "0.2em",
              color: C.ivory,
              opacity: 0.6,
              marginTop: 18,
            }}
          >
            14 · 05 · 2026
          </div>
        </div>
      )}

      {/* Lanterns: photos rising at the very end */}
      {scrollProgress >= 0.88 && photos.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {photos.map((src, i) => {
            const lx = `${(i * 137) % 90 + 5 - 50}vw`;
            const lr = `${(i * 31) % 18 - 9}deg`;
            const delay = (i * 0.6) % 6;
            const dur = 14 + (i % 5);
            return (
              <div
                key={src}
                style={
                  {
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    width: 140,
                    height: 180,
                    marginLeft: -70,
                    "--lx": lx,
                    "--lr": lr,
                    animation: `lanternRise ${dur}s ease-in-out ${delay}s infinite`,
                    pointerEvents: "auto",
                    cursor: "pointer",
                  } as React.CSSProperties
                }
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "#fff",
                    padding: 8,
                    paddingBottom: 28,
                    boxShadow: "0 20px 60px -10px rgba(255,181,107,0.4), 0 0 40px rgba(255,216,155,0.3)",
                    transform: "rotate(0deg)",
                    borderRadius: 2,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    loading="lazy"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Focused window glass card */}
      {focused && (
        <div
          onClick={() => setFocused(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            background: "rgba(10,20,36,0.45)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "skyFadeIn 500ms ease 400ms both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              padding: "40px 36px",
              background: "rgba(245,233,212,0.06)",
              backdropFilter: "blur(20px)",
              border: `1px solid ${C.roseGold}40`,
              borderRadius: 4,
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
              color: C.ivory,
            }}
          >
            <div
              style={{
                fontFamily: mono.style.fontFamily,
                fontSize: 10,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: C.roseGold,
                marginBottom: 24,
              }}
            >
              window {focused.wish.name.toLowerCase()} · lit
            </div>
            <p
              style={{
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: "clamp(1.5rem, 2.4vw, 2rem)",
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
                margin: 0,
                color: C.amberSoft,
              }}
            >
              &ldquo;{focused.wish.text}&rdquo;
            </p>
            <div
              style={{
                marginTop: 28,
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                fontFamily: mono.style.fontFamily,
                fontSize: 11,
                letterSpacing: "0.15em",
                color: C.ivory,
                opacity: 0.65,
              }}
            >
              <span>
                {focused.wish.name}, {focused.wish.role}
              </span>
              <span>{focused.wish.city}</span>
            </div>
            <button
              onClick={() => setFocused(null)}
              style={{
                marginTop: 32,
                background: "none",
                border: `1px solid ${C.ivory}30`,
                color: C.ivory,
                padding: "10px 22px",
                fontFamily: mono.style.fontFamily,
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
                opacity: 0.8,
              }}
            >
              return to skyline
            </button>
          </div>
        </div>
      )}

      {/* Mute toggle for generative audio (only if active) */}
      {!parentHasAudio && audioRef.current?.started && (
        <button
          onClick={() => setAudioMuted((m) => !m)}
          aria-label={audioMuted ? "Unmute ambient" : "Mute ambient"}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 40,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(10,20,36,0.5)",
            backdropFilter: "blur(10px)",
            border: `1px solid ${C.ivory}30`,
            color: C.ivory,
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.7,
          }}
        >
          {audioMuted ? "·" : "♪"}
        </button>
      )}

      {/* Footer sign-off (visible at very end) */}
      {scrollProgress > 0.95 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 0,
            right: 0,
            zIndex: 10,
            textAlign: "center",
            fontFamily: mono.style.fontFamily,
            fontSize: 10,
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            color: C.ivory,
            opacity: 0.5,
            pointerEvents: "none",
          }}
        >
          made with quiet hands
        </div>
      )}

      {/* Custom cursor */}
      <CustomCursor />
    </div>
  );
}
