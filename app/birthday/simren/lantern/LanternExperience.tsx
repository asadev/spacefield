"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";

/* ──────────────────────────────────────────────────────────────────────── *
 *  LANTERN — warm dark night sky, paper lanterns rising with photos
 *  inside. Tap a lantern to bring it forward. Wish lanterns drift up
 *  the right column. A cake-sparkler section anchors the middle.
 *  SVG + CSS keyframes only. No WebGL.
 * ──────────────────────────────────────────────────────────────────────── */

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

/* ── Palette ───────────────────────────────────────────────────────────── */
const C = {
  inkDeep: "#0a0610",
  inkWarm: "#1a0e1f",
  inkMid: "#2a1530",
  ember: "#ff9a4d",
  amber: "#ffb56b",
  cream: "#fff1d6",
  gold: "#f4c97e",
  paperHi: "#ffd9a8",
};

/* ── Wishes (one per wish-lantern) ─────────────────────────────────────── */
const WISHES = [
  "May your year be made of soft mornings and loud laughter — both, in equal measure.",
  "May the people who already love you find new ways to show it.",
  "May the work you make this year feel like yours, fully.",
  "May rest find you before you ask for it, and joy find you when you forget to.",
  "May every room you walk into get a little warmer the moment you arrive.",
  "May the small wishes — the ones you almost don't say out loud — be the first to come true.",
  "May this year be kinder to you than the years before, and gentler still than the years after.",
];

const SIGN_OFF = "Happy birthday, Simren. The sky's been waiting for you.";

/* ── Deterministic pseudo-random so SSR/CSR hydration matches ──────────── */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Lantern SVG body (rice-paper). Photo (if any) is rendered as a sibling
 *    DOM <img> with the same wrapper transform — keeps EXIF rotation and
 *    avoids foreignObject quirks. ─────────────────────────────────────── */
function LanternSVG({
  size,
  photo,
  uid,
}: {
  size: { w: number; h: number };
  photo?: string;
  uid: string;
}) {
  const photoRadius = Math.min(size.w, size.h) * 0.32;
  const cx = 50;
  const cy = 64;

  return (
    <div
      style={{
        position: "relative",
        width: size.w,
        height: size.h,
        pointerEvents: "none",
      }}
    >
      {/* halo — sibling to the lantern, blurred, never on the photo */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-50%",
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 45%, rgba(255,181,107,0.55) 0%, rgba(255,154,77,0.28) 28%, rgba(255,154,77,0) 65%)`,
          filter: "blur(24px)",
          zIndex: 0,
        }}
      />
      {/* lantern body */}
      <svg
        viewBox="0 0 100 140"
        width={size.w}
        height={size.h}
        style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "visible" }}
      >
        <defs>
          <radialGradient id={`paper-${uid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor={C.paperHi} stopOpacity="0.95" />
            <stop offset="55%" stopColor={C.amber} stopOpacity="0.85" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0.7" />
          </radialGradient>
          <radialGradient id={`flame-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffe9b8" stopOpacity="1" />
            <stop offset="60%" stopColor={C.ember} stopOpacity="0.9" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0" />
          </radialGradient>
          {photo && (
            <clipPath id={`clip-${uid}`}>
              <circle cx={cx} cy={cy} r={photoRadius} />
            </clipPath>
          )}
        </defs>

        {/* top cap */}
        <path
          d="M 32 16 L 68 16 L 64 24 L 36 24 Z"
          fill={C.inkWarm}
          stroke={C.amber}
          strokeWidth="0.8"
          strokeOpacity="0.7"
        />
        {/* hanging string above cap */}
        <line x1="50" y1="2" x2="50" y2="16" stroke={C.amber} strokeWidth="0.5" strokeOpacity="0.5" />

        {/* body */}
        <path
          d="M 18 30 Q 14 64 18 100 Q 50 112 82 100 Q 86 64 82 30 Q 50 22 18 30 Z"
          fill={`url(#paper-${uid})`}
          stroke={C.amber}
          strokeWidth="0.7"
          strokeOpacity="0.6"
        />

        {/* paper panel folds */}
        <line x1="34" y1="28" x2="34" y2="104" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />
        <line x1="50" y1="26" x2="50" y2="106" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />
        <line x1="66" y1="28" x2="66" y2="104" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />

        {/* photo window — circular cutout with amber rim */}
        {photo && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={photoRadius + 1}
              fill="none"
              stroke={C.amber}
              strokeWidth="0.8"
              strokeOpacity="0.85"
            />
          </>
        )}

        {/* bottom rim + tassel */}
        <path
          d="M 22 100 L 24 108 L 76 108 L 78 100"
          fill={C.inkWarm}
          stroke={C.amber}
          strokeWidth="0.6"
          strokeOpacity="0.6"
        />
        <line x1="50" y1="108" x2="50" y2="120" stroke={C.amber} strokeWidth="0.6" strokeOpacity="0.7" />
        <circle cx="50" cy="123" r="2" fill={C.gold} opacity="0.85" />
        <line x1="46" y1="124" x2="44" y2="132" stroke={C.amber} strokeWidth="0.4" strokeOpacity="0.5" />
        <line x1="54" y1="124" x2="56" y2="132" stroke={C.amber} strokeWidth="0.4" strokeOpacity="0.5" />
        <line x1="50" y1="125" x2="50" y2="134" stroke={C.amber} strokeWidth="0.4" strokeOpacity="0.5" />

        {/* flame core (only if no photo — otherwise the photo IS the glow) */}
        {!photo && (
          <ellipse
            cx="50"
            cy="68"
            rx="6"
            ry="9"
            fill={`url(#flame-${uid})`}
            style={{ animation: `lanternFlame 1.6s ease-in-out infinite alternate` }}
          />
        )}
      </svg>

      {/* photo — DOM <img> positioned over the SVG circle. Browsers honor EXIF. */}
      {photo && (
        <img
          src={photo}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: `${(cx / 100) * size.w - photoRadius * (size.w / 100)}px`,
            top: `${(cy / 140) * size.h - photoRadius * (size.h / 140)}px`,
            width: `${photoRadius * 2 * (size.w / 100)}px`,
            height: `${photoRadius * 2 * (size.h / 140)}px`,
            borderRadius: "50%",
            objectFit: "cover",
            zIndex: 2,
            boxShadow: `inset 0 0 18px rgba(255,181,107,0.55), 0 0 14px rgba(255,154,77,0.35)`,
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      )}
    </div>
  );
}

/* ── A wish-lantern (large, no photo, wish text inside the body) ──────── */
function WishLanternSVG({ wish, uid, size }: { wish: string; uid: string; size: { w: number; h: number } }) {
  return (
    <div style={{ position: "relative", width: size.w, height: size.h, pointerEvents: "none" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-45%",
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 45%, rgba(255,181,107,0.5) 0%, rgba(255,154,77,0.22) 32%, rgba(255,154,77,0) 70%)`,
          filter: "blur(28px)",
          zIndex: 0,
        }}
      />
      <svg
        viewBox="0 0 100 140"
        width={size.w}
        height={size.h}
        style={{ position: "absolute", inset: 0, zIndex: 1, overflow: "visible" }}
      >
        <defs>
          <radialGradient id={`wishpaper-${uid}`} cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor={C.paperHi} stopOpacity="0.92" />
            <stop offset="60%" stopColor={C.amber} stopOpacity="0.78" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0.6" />
          </radialGradient>
        </defs>
        <path d="M 32 16 L 68 16 L 64 24 L 36 24 Z" fill={C.inkWarm} stroke={C.amber} strokeWidth="0.8" strokeOpacity="0.7" />
        <line x1="50" y1="2" x2="50" y2="16" stroke={C.amber} strokeWidth="0.5" strokeOpacity="0.5" />
        <path
          d="M 14 30 Q 10 66 14 102 Q 50 116 86 102 Q 90 66 86 30 Q 50 22 14 30 Z"
          fill={`url(#wishpaper-${uid})`}
          stroke={C.amber}
          strokeWidth="0.7"
          strokeOpacity="0.6"
        />
        <line x1="32" y1="28" x2="32" y2="106" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />
        <line x1="50" y1="26" x2="50" y2="108" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />
        <line x1="68" y1="28" x2="68" y2="106" stroke={C.ember} strokeWidth="0.4" strokeOpacity="0.18" />
        <path d="M 18 102 L 20 110 L 80 110 L 82 102" fill={C.inkWarm} stroke={C.amber} strokeWidth="0.6" strokeOpacity="0.6" />
        <line x1="50" y1="110" x2="50" y2="122" stroke={C.amber} strokeWidth="0.6" strokeOpacity="0.7" />
        <circle cx="50" cy="125" r="2" fill={C.gold} opacity="0.85" />
      </svg>
      {/* wish text overlaid on the body */}
      <div
        style={{
          position: "absolute",
          left: "14%",
          top: "26%",
          width: "72%",
          height: "52%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "4px 6px",
          color: "#3a1f10",
          fontFamily: display.style.fontFamily,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: Math.max(10, Math.round(size.w * 0.085)),
          lineHeight: 1.2,
          zIndex: 2,
          textShadow: "0 0 8px rgba(255,217,168,0.6)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {wish}
      </div>
    </div>
  );
}

/* ── Rising-lantern wrapper. Drives the CSS animation + tap handler. ───── */
type LanternKind = "photo" | "wish" | "small";
type LanternSlot = {
  id: string;
  kind: LanternKind;
  photo?: string;
  wish?: string;
  size: { w: number; h: number };
  startX: number; // vw, anchor for the column
  driftStart: number;
  driftMid: number;
  driftEnd: number;
  duration: number;
  delay: number;
};

function RisingLantern({
  slot,
  onTap,
}: {
  slot: LanternSlot;
  onTap: (slot: LanternSlot) => void;
}) {
  const interactive = slot.kind !== "small";
  return (
    <div
      onClick={interactive ? () => onTap(slot) : undefined}
      style={{
        position: "absolute",
        left: `${slot.startX}vw`,
        top: 0,
        width: slot.size.w,
        height: slot.size.h,
        marginLeft: -slot.size.w / 2,
        cursor: interactive ? "pointer" : "default",
        pointerEvents: interactive ? "auto" : "none",
        animation: `lanternRise ${slot.duration}s linear ${slot.delay}s infinite`,
        ["--driftStart" as string]: `${slot.driftStart}px`,
        ["--driftMid" as string]: `${slot.driftMid}px`,
        ["--driftEnd" as string]: `${slot.driftEnd}px`,
        willChange: "transform, opacity",
      } as React.CSSProperties}
    >
      <div style={{ pointerEvents: interactive ? "auto" : "none" }}>
        {slot.kind === "wish" && slot.wish ? (
          <WishLanternSVG wish={slot.wish} uid={slot.id} size={slot.size} />
        ) : (
          <LanternSVG photo={slot.photo} uid={slot.id} size={slot.size} />
        )}
      </div>
    </div>
  );
}

/* ── Hero "about-to-release" cluster (gentle bob, NOT rising) ──────────── */
function HeroLantern({ photo, uid, delay }: { photo?: string; uid: string; delay: number }) {
  return (
    <div
      style={{
        animation: `lanternBob 4.5s ease-in-out ${delay}s infinite alternate`,
        willChange: "transform",
      }}
    >
      <LanternSVG photo={photo} uid={uid} size={{ w: 110, h: 154 }} />
    </div>
  );
}

/* ── Cake-sparkler centerpiece ─────────────────────────────────────────── */
function CakeSparkler() {
  const sparks = useMemo(() => {
    const r = mulberry32(7777);
    return Array.from({ length: 24 }, (_, i) => ({
      id: i,
      sx: (r() - 0.5) * 120,
      sy: -20 - r() * 100,
      delay: r() * 2,
      dur: 1.6 + r() * 0.8,
    }));
  }, []);
  return (
    <div style={{ position: "relative", width: 220, height: 280 }}>
      {/* candle flame glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: 18,
          transform: "translateX(-50%)",
          width: 160,
          height: 160,
          background: `radial-gradient(circle, rgba(244,201,126,0.6) 0%, rgba(255,154,77,0.2) 40%, transparent 75%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />
      <svg viewBox="0 0 220 280" width={220} height={280} style={{ position: "absolute", inset: 0 }}>
        {/* candle */}
        <rect x="106" y="60" width="8" height="46" fill={C.cream} opacity="0.9" />
        {/* flame */}
        <ellipse
          cx="110"
          cy="50"
          rx="6"
          ry="12"
          fill="url(#cakeFlame)"
          style={{ animation: `lanternFlame 1.8s ease-in-out infinite alternate` }}
        />
        <defs>
          <radialGradient id="cakeFlame" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="#ffe9b8" />
            <stop offset="60%" stopColor={C.ember} />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cakeTier" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3a2540" />
            <stop offset="100%" stopColor="#1a0e1f" />
          </linearGradient>
        </defs>
        {/* cake tier */}
        <rect x="50" y="106" width="120" height="60" rx="6" fill="url(#cakeTier)" stroke={C.amber} strokeWidth="0.8" strokeOpacity="0.55" />
        {/* drip detail */}
        <path d="M 60 116 Q 70 122 80 116 Q 90 122 100 116 Q 110 122 120 116 Q 130 122 140 116 Q 150 122 160 116" fill="none" stroke={C.gold} strokeWidth="1" strokeOpacity="0.55" />
        {/* base plate */}
        <ellipse cx="110" cy="170" rx="78" ry="6" fill={C.inkDeep} stroke={C.amber} strokeWidth="0.5" strokeOpacity="0.4" />
        {/* sparks */}
        {sparks.map((s) => (
          <circle
            key={s.id}
            cx={110}
            cy={48}
            r={1.2}
            fill={C.gold}
            style={{
              animation: `spark ${s.dur}s ease-out ${s.delay}s infinite`,
              ["--sx" as string]: `${s.sx}px`,
              ["--sy" as string]: `${s.sy}px`,
              opacity: 0,
            } as React.CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}

/* ── Main experience ──────────────────────────────────────────────────── */
export default function LanternExperience({ photos }: { photos: string[] }) {
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [active, setActive] = useState<LanternSlot | null>(null);
  const skyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 640px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setMounted(true);
      setIsMobile(mqMobile.matches);
      setReduceMotion(mqMotion.matches);
    };
    sync();
    const onMobile = () => setIsMobile(mqMobile.matches);
    const onMotion = () => setReduceMotion(mqMotion.matches);
    mqMobile.addEventListener("change", onMobile);
    mqMotion.addEventListener("change", onMotion);
    return () => {
      mqMobile.removeEventListener("change", onMobile);
      mqMotion.removeEventListener("change", onMotion);
    };
  }, []);

  /* Build the slot list deterministically. Photos cycle if there are more
   * slots than photos. Wish-lanterns are exactly the WISHES list. */
  const slots = useMemo<LanternSlot[]>(() => {
    const r = mulberry32(20260514);
    const safePhotos = photos.length > 0 ? photos : [];

    const photoSlotCount = isMobile ? 4 : 8;
    const wishSlotCount = WISHES.length; // 7
    const smallCount = isMobile ? 0 : 6;

    const result: LanternSlot[] = [];

    // photo lanterns — left/center 60% column
    for (let i = 0; i < photoSlotCount; i++) {
      const photo = safePhotos.length ? safePhotos[i % safePhotos.length] : undefined;
      const w = 90 + Math.round(r() * 18);
      const h = Math.round(w * 1.42);
      result.push({
        id: `p${i}`,
        kind: "photo",
        photo,
        size: { w, h },
        startX: 8 + r() * 50, // 8vw → 58vw
        driftStart: (r() - 0.5) * 30,
        driftMid: (r() - 0.5) * 60,
        driftEnd: (r() - 0.5) * 40,
        duration: 16 + r() * 4, // 16-20s
        delay: -r() * 18, // negative delay so they're already mid-air at load
      });
    }

    // wish lanterns — right 40% column
    for (let i = 0; i < wishSlotCount; i++) {
      const w = 132 + Math.round(r() * 14);
      const h = Math.round(w * 1.42);
      result.push({
        id: `w${i}`,
        kind: "wish",
        wish: WISHES[i],
        size: { w, h },
        startX: 62 + r() * 32, // 62vw → 94vw
        driftStart: (r() - 0.5) * 24,
        driftMid: (r() - 0.5) * 48,
        driftEnd: (r() - 0.5) * 32,
        duration: 20 + r() * 4, // 20-24s — slower
        delay: -r() * 22,
      });
    }

    // small background lanterns — anywhere, no photo, just light
    for (let i = 0; i < smallCount; i++) {
      const w = 48 + Math.round(r() * 12);
      const h = Math.round(w * 1.42);
      result.push({
        id: `s${i}`,
        kind: "small",
        size: { w, h },
        startX: r() * 100,
        driftStart: (r() - 0.5) * 20,
        driftMid: (r() - 0.5) * 40,
        driftEnd: (r() - 0.5) * 28,
        duration: 14 + r() * 4,
        delay: -r() * 14,
      });
    }

    return result;
  }, [photos, isMobile]);

  /* Hero cluster — three big lanterns at the bottom of the hero,
   * carrying the first three photos. Bob in place. */
  const heroPhotos = photos.slice(0, 3);

  return (
    <div
      ref={skyRef}
      className={body.className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        overflowY: "auto",
        overflowX: "hidden",
        background: `radial-gradient(ellipse at 50% 110%, ${C.inkMid} 0%, ${C.inkWarm} 40%, ${C.inkDeep} 100%)`,
        color: C.cream,
      }}
    >
      {/* Global keyframes & font glue */}
      <style>{`
        @keyframes lanternRise {
          0%   { transform: translate3d(var(--driftStart, 0px), 110vh, 0) rotate(-1deg); opacity: 0; }
          6%   { opacity: 1; }
          50%  { transform: translate3d(var(--driftMid, 20px), 40vh, 0) rotate(1.5deg); }
          94%  { opacity: 1; }
          100% { transform: translate3d(var(--driftEnd, -10px), -25vh, 0) rotate(-1deg); opacity: 0; }
        }
        @keyframes lanternBob {
          0%   { transform: translateY(0px) rotate(-1deg); }
          100% { transform: translateY(-14px) rotate(1deg); }
        }
        @keyframes lanternFlame {
          0%   { opacity: 0.7; transform: scale(0.92); }
          100% { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes spark {
          0%   { transform: translate(0,0) scale(1); opacity: 0; }
          12%  { opacity: 0.6; }
          70%  { opacity: 0.35; }
          100% { transform: translate(var(--sx, 0px), var(--sy, -60px)) scale(0.2); opacity: 0; }
        }
        @keyframes scrollHint {
          0%, 100% { opacity: 0.35; transform: translateY(0); }
          50%      { opacity: 0.85; transform: translateY(6px); }
        }
        @keyframes signOffRise {
          0%   { transform: translate(-50%, 30vh) rotate(-1deg); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate(-50%, -10vh) rotate(1deg); opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-rising] { animation: none !important; opacity: 1 !important; }
          [data-bob]    { animation: none !important; }
          [data-spark]  { animation: none !important; }
        }
      `}</style>

      {/* ── Fixed full-bleed sky layer (lanterns are absolute over scroll
            content, so they appear to float through it). ──────────────── */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: `radial-gradient(ellipse at 50% 110%, ${C.inkMid} 0%, ${C.inkWarm} 40%, ${C.inkDeep} 100%)`,
          zIndex: -1,
        }}
      />

      {/* ── Lanterns layer — fixed across viewport, runs on time ────────── */}
      {mounted && !reduceMotion && (
        <div
          aria-hidden={false}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          {slots.map((slot) => (
            <div
              key={slot.id}
              data-rising
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <RisingLantern slot={slot} onTap={setActive} />
            </div>
          ))}
        </div>
      )}

      {/* ── Reduced-motion fallback: scatter slots statically so photos show */}
      {mounted && reduceMotion && (
        <div style={{ position: "relative", zIndex: 1 }}>
          {slots.filter((s) => s.kind !== "small").map((slot, i) => (
            <div
              key={slot.id}
              style={{
                position: "absolute",
                left: `${slot.startX}vw`,
                top: `${10 + (i * 70)}vh`,
                width: slot.size.w,
                height: slot.size.h,
                marginLeft: -slot.size.w / 2,
                pointerEvents: "auto",
                cursor: "pointer",
              }}
              onClick={() => setActive(slot)}
            >
              {slot.kind === "wish" && slot.wish ? (
                <WishLanternSVG wish={slot.wish} uid={slot.id} size={slot.size} />
              ) : (
                <LanternSVG photo={slot.photo} uid={slot.id} size={slot.size} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Scroll content layer (relative, above sky, below modal) ────── */}
      <div style={{ position: "relative", zIndex: 2 }}>
        {/* HERO — visible immediately */}
        <section
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: C.cream,
              opacity: 0.7,
              marginBottom: 24,
            }}
          >
            May 14, 2026
          </div>
          <h1
            className={display.className}
            style={{
              fontStyle: "italic",
              fontWeight: 700,
              fontSize: "clamp(72px, 16vw, 188px)",
              lineHeight: 0.95,
              margin: 0,
              background: `linear-gradient(180deg, ${C.gold} 0%, ${C.cream} 70%, ${C.amber} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 30px rgba(244,201,126,0.4)`,
              textAlign: "center",
            }}
          >
            Simren
          </h1>
          <div
            className={display.className}
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(18px, 2.4vw, 26px)",
              color: C.cream,
              opacity: 0.86,
              marginTop: 18,
              textAlign: "center",
              maxWidth: 640,
              padding: "0 16px",
            }}
          >
            a sky full of small lights, for you
          </div>

          {/* hero lantern cluster — at the bottom of the hero, bobbing */}
          <div
            data-bob
            style={{
              position: "absolute",
              bottom: 32,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: isMobile ? 8 : 28,
              alignItems: "flex-end",
              zIndex: 3,
            }}
          >
            {(heroPhotos.length > 0
              ? heroPhotos
              : [undefined, undefined, undefined]
            ).map((p, i) => (
              <HeroLantern key={i} photo={p} uid={`hero-${i}`} delay={i * 0.6} />
            ))}
          </div>

          {/* scroll hint */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 11,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: C.cream,
              animation: "scrollHint 2.4s ease-in-out infinite",
            }}
          >
            ↓ scroll
          </div>
        </section>

        {/* MEMORIES intro */}
        <section
          style={{
            minHeight: "120vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "12vh 24px 24vh",
          }}
        >
          <p
            className={display.className}
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(20px, 2.6vw, 30px)",
              lineHeight: 1.5,
              maxWidth: "36ch",
              textAlign: "center",
              color: C.cream,
              opacity: 0.92,
              textShadow: `0 0 18px rgba(255,217,168,0.18)`,
            }}
          >
            On the night before your birthday, a thousand small lights are sent up.
            Some carry photographs, some carry wishes — none of them carry weight.
            Tap one to bring it close.
          </p>
        </section>

        {/* CAKE */}
        <section
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            position: "relative",
          }}
        >
          <CakeSparkler />
          <div
            className={display.className}
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(18px, 2.2vw, 24px)",
              color: C.cream,
              opacity: 0.85,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            May 14, 2026 · today
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: C.cream,
              opacity: 0.55,
            }}
          >
            make a wish
          </div>
        </section>

        {/* WISHES intro */}
        <section
          style={{
            minHeight: "120vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: "12vh 24px 24vh",
          }}
        >
          <p
            className={display.className}
            style={{
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(20px, 2.6vw, 30px)",
              lineHeight: 1.5,
              maxWidth: "36ch",
              textAlign: "center",
              color: C.cream,
              opacity: 0.92,
              textShadow: `0 0 18px rgba(255,217,168,0.18)`,
            }}
          >
            Seven wishes, one per lantern, drifting up the right side of the sky.
            Tap any of them to read it close.
          </p>
        </section>

        {/* SIGN-OFF */}
        <section
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* a single very large lantern, slow rise, message inside */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              animation: mounted && !reduceMotion ? `signOffRise 26s ease-out 0.4s forwards` : "none",
              top: 0,
              willChange: "transform, opacity",
              opacity: reduceMotion ? 1 : 0,
              transform: reduceMotion ? "translate(-50%, 20vh)" : undefined,
            }}
          >
            <div style={{ position: "relative" }}>
              <WishLanternSVG wish={SIGN_OFF} uid="signoff" size={{ w: isMobile ? 220 : 280, h: isMobile ? 312 : 396 }} />
            </div>
          </div>

          <div
            className={display.className}
            style={{
              position: "absolute",
              bottom: 48,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: "clamp(14px, 1.6vw, 18px)",
              color: C.cream,
              opacity: 0.6,
              textAlign: "center",
              padding: "0 24px",
            }}
          >
            with love · May 14, 2026
          </div>
        </section>

        {/* small footer spacer */}
        <div style={{ height: 60 }} />
      </div>

      {/* ── Modal — tap-to-bring-forward ──────────────────────────────── */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setActive(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100000,
              background: "rgba(10,6,16,0.78)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              cursor: "pointer",
            }}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.7, opacity: 0, y: 20 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                cursor: "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 18,
              }}
            >
              {active.kind === "wish" && active.wish ? (
                <WishLanternSVG
                  wish={active.wish}
                  uid={`${active.id}-zoom`}
                  size={{ w: isMobile ? 280 : 360, h: isMobile ? 396 : 510 }}
                />
              ) : (
                <LanternSVG
                  photo={active.photo}
                  uid={`${active.id}-zoom`}
                  size={{ w: isMobile ? 280 : 360, h: isMobile ? 396 : 510 }}
                />
              )}
              <div
                className={display.className}
                style={{
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "clamp(15px, 1.8vw, 19px)",
                  color: C.cream,
                  opacity: 0.85,
                  textAlign: "center",
                  maxWidth: 380,
                }}
              >
                {active.kind === "photo" ? "a moment, held" : "a wish for you"}
              </div>
              <button
                onClick={() => setActive(null)}
                aria-label="release the lantern"
                style={{
                  marginTop: 6,
                  background: "transparent",
                  border: `1px solid ${C.amber}`,
                  color: C.cream,
                  padding: "8px 18px",
                  fontSize: 11,
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  borderRadius: 999,
                  cursor: "pointer",
                  opacity: 0.85,
                }}
              >
                release
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
