"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";

type Props = { photos: string[] };

const WISHES = [
  "May this year unfold softer than the last, and brighter in every quiet way.",
  "Health that hums in the background — never something you have to think about.",
  "Rooms full of people who already understand you, before you finish the sentence.",
  "Work that feels like play, and play that feels like coming home.",
  "Slow mornings, warm light, and coffee that's still hot when you remember it.",
  "Confidence that doesn't need a mirror — the kind that lives in your shoulders.",
  "Every wish you didn't say out loud — granted anyway.",
];

type Bubble = {
  id: number;
  wish: string;
  x: number;
  delay: number;
  size: number;
  drift: number;
  duration: number;
};

export default function GlassExperience({ photos }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [poppedIds, setPoppedIds] = useState<Set<number>>(new Set());
  const [activeWish, setActiveWish] = useState<{ id: number; text: string } | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [shattered, setShattered] = useState(false);
  const [candlesLit, setCandlesLit] = useState(true);
  const bubbleSeqRef = useRef(0);

  const { scrollYProgress } = useScroll({ container: wrapRef });
  const blobY = useTransform(scrollYProgress, [0, 1], ["0%", "-15%"]);

  // Spawn bubbles continuously, each carrying one wish
  useEffect(() => {
    function spawn() {
      const id = ++bubbleSeqRef.current;
      const wish = WISHES[id % WISHES.length];
      const newBubble: Bubble = {
        id,
        wish,
        x: 6 + Math.random() * 88,
        delay: 0,
        size: 64 + Math.random() * 56,
        drift: (Math.random() - 0.5) * 80,
        duration: 14 + Math.random() * 8,
      };
      setBubbles((b) => [...b.slice(-14), newBubble]);
    }
    // initial burst
    for (let i = 0; i < 4; i++) setTimeout(spawn, i * 600);
    const t = setInterval(spawn, 2400);
    return () => clearInterval(t);
  }, []);

  // Mouse parallax
  useEffect(() => {
    function onMove(e: MouseEvent) {
      setMouse({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  function popBubble(b: Bubble) {
    if (poppedIds.has(b.id)) return;
    setPoppedIds((s) => new Set(s).add(b.id));
    setActiveWish({ id: b.id, text: b.wish });
    // remove the bubble after pop animation
    setTimeout(() => setBubbles((arr) => arr.filter((x) => x.id !== b.id)), 700);
    // auto-dismiss the revealed wish
    setTimeout(() => {
      setActiveWish((cur) => (cur && cur.id === b.id ? null : cur));
    }, 4200);
  }

  function blowOut() {
    if (shattered) return;
    setCandlesLit(false);
    setTimeout(() => setShattered(true), 400);
    setTimeout(() => {
      setShattered(false);
      setCandlesLit(true);
    }, 3600);
  }

  const heroPhoto = photos[0];
  const galleryPhotos = useMemo(() => photos.slice(1), [photos]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        background: "#eaf2fb",
        color: "#1c2540",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <style>{glassCss}</style>

      {/* Animated gradient sky */}
      <div className="sky" aria-hidden>
        <div className="sky-layer sky-1" />
        <div className="sky-layer sky-2" />
        <div className="sky-layer sky-3" />
        <div className="grain" />
      </div>

      {/* Floating SVG blobs (liquid) */}
      <motion.svg
        aria-hidden
        className="blobs"
        viewBox="0 0 1200 800"
        style={{ y: blobY }}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="bgrad1" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd1dc" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#c5b8ff" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="bgrad2" x1="1" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffe6b8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#bde0ff" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <motion.path
          fill="url(#bgrad1)"
          animate={{
            d: [
              "M150,300 Q400,150 700,260 T1100,300 L1100,800 L150,800 Z",
              "M150,260 Q420,200 680,300 T1100,260 L1100,800 L150,800 Z",
              "M150,300 Q400,150 700,260 T1100,300 L1100,800 L150,800 Z",
            ],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          fill="url(#bgrad2)"
          animate={{
            d: [
              "M0,500 Q300,420 600,500 T1200,500 L1200,800 L0,800 Z",
              "M0,520 Q320,460 600,470 T1200,520 L1200,800 L0,800 Z",
              "M0,500 Q300,420 600,500 T1200,500 L1200,800 L0,800 Z",
            ],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.svg>

      {/* HERO */}
      <section className="hero">
        <motion.div
          className="glass hero-card"
          initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="eyebrow">May 14, 2026</div>
          <h1 className="title">
            Happy Birthday,<br />
            <span className="name">Simren</span>
          </h1>
          <p className="subtitle">
            A small page made of light and glass — tap the rising bubbles to read the wishes inside.
          </p>
        </motion.div>

        {heroPhoto && (
          <motion.div
            className="glass hero-photo"
            style={{
              transform: `translate3d(${(mouse.x - 0.5) * -18}px, ${(mouse.y - 0.5) * -12}px, 0)`,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, delay: 0.3 }}
          >
            <img src={heroPhoto} alt="Simren" loading="eager" />
            <div className="photo-sheen" />
          </motion.div>
        )}

        <div className="scroll-hint" aria-hidden>
          <span>scroll</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* WISH SKY */}
      <section className="wish-sky">
        <motion.div
          className="glass section-head"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8 }}
        >
          <div className="eyebrow">Seven wishes</div>
          <h2>Pop a bubble. Read what's inside.</h2>
        </motion.div>

        <div className="bubble-field" aria-label="Floating wish bubbles">
          {bubbles.map((b) => (
            <motion.button
              key={b.id}
              type="button"
              className="bubble"
              style={{
                left: `${b.x}%`,
                width: b.size,
                height: b.size,
              }}
              initial={{ y: 60, opacity: 0, scale: 0.6 }}
              animate={
                poppedIds.has(b.id)
                  ? { scale: 1.5, opacity: 0, transition: { duration: 0.5 } }
                  : {
                      y: -700,
                      x: b.drift,
                      opacity: [0, 1, 1, 0.9, 0],
                      scale: [0.6, 1, 1, 1, 0.95],
                      transition: { duration: b.duration, ease: "easeOut" },
                    }
              }
              onClick={() => popBubble(b)}
              aria-label="Pop a wish"
            >
              <span className="bubble-shine" />
              <span className="bubble-glow" />
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {activeWish && (
            <motion.div
              key={activeWish.id}
              className="glass wish-card"
              initial={{ opacity: 0, y: 30, scale: 0.92, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, scale: 0.95, filter: "blur(8px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="wish-mark">wish</div>
              <p>{activeWish.text}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* LIQUID DIVIDER */}
      <svg className="divider" viewBox="0 0 1440 120" aria-hidden preserveAspectRatio="none">
        <motion.path
          fill="rgba(255,255,255,0.55)"
          animate={{
            d: [
              "M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,120 L0,120 Z",
              "M0,70 C260,110 460,20 720,70 C980,120 1180,10 1440,70 L1440,120 L0,120 Z",
              "M0,60 C240,120 480,0 720,60 C960,120 1200,0 1440,60 L1440,120 L0,120 Z",
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>

      {/* CAKE */}
      <section className="cake-section">
        <motion.div
          className="glass section-head"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8 }}
        >
          <div className="eyebrow">Make a wish</div>
          <h2>{shattered ? "shhh — it's coming true" : candlesLit ? "Tap the cake to blow them out" : "almost…"}</h2>
        </motion.div>

        <div className="cake-stage">
          <button
            type="button"
            className={`cake ${shattered ? "shattered" : ""}`}
            onClick={blowOut}
            aria-label="Blow out the candles"
          >
            <div className="plate" />
            <div className="tier tier-3">
              <div className="tier-shine" />
              <div className="drip" />
            </div>
            <div className="tier tier-2">
              <div className="tier-shine" />
              <div className="drip" />
            </div>
            <div className="tier tier-1">
              <div className="tier-shine" />
              <div className="drip" />
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="candle" style={{ left: `${22 + i * 14}%` }}>
                <div className="wick" />
                <div className={`flame ${candlesLit ? "lit" : "out"}`}>
                  <div className="flame-inner" />
                </div>
                <div className={`smoke ${candlesLit ? "" : "rising"}`} />
              </div>
            ))}
            {shattered && (
              <div className="shards">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="shard"
                    style={{
                      // deterministic pseudo-random based on index so SSR/CSR match isn't an issue (client-only anyway)
                      ["--tx" as string]: `${(i * 53) % 360 - 180}px`,
                      ["--ty" as string]: `${-((i * 37) % 220 + 60)}px`,
                      ["--rot" as string]: `${(i * 47) % 360}deg`,
                      animationDelay: `${(i % 6) * 0.04}s`,
                    }}
                  />
                ))}
              </div>
            )}
          </button>
        </div>
      </section>

      {/* PHOTO GALLERY */}
      {galleryPhotos.length > 0 && (
        <section className="gallery">
          <motion.div
            className="glass section-head"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8 }}
          >
            <div className="eyebrow">Through glass</div>
            <h2>Moments, softly held</h2>
          </motion.div>

          <div className="gallery-grid">
            {galleryPhotos.map((src, i) => {
              const px = (mouse.x - 0.5) * (i % 2 === 0 ? -22 : 22);
              const py = (mouse.y - 0.5) * (i % 3 === 0 ? -16 : 16);
              return (
                <motion.div
                  key={src}
                  className="glass photo-card"
                  style={{
                    transform: `translate3d(${px}px, ${py}px, 0) rotate(${(i % 5 - 2) * 1.4}deg)`,
                  }}
                  initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.9, delay: (i % 4) * 0.08 }}
                >
                  <img src={src} alt={`Simren ${i + 2}`} loading="lazy" />
                  <div className="photo-sheen" />
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* SIGN-OFF */}
      <section className="signoff">
        <motion.div
          className="glass signoff-card"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1 }}
        >
          <div className="eyebrow">May 14, 2026</div>
          <h3>
            Happy birthday, <span className="name">Simren Zahra</span>.
          </h3>
          <p>Wishing you a year that feels exactly like you.</p>
          <div className="hearts" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.span
                key={i}
                className="heart"
                animate={{ y: [-2, -10, -2], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3 + i * 0.4, repeat: Infinity, delay: i * 0.3 }}
              >
                ♡
              </motion.span>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}

const glassCss = `
  .sky {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background: linear-gradient(180deg, #cfe3ff 0%, #e6dcff 45%, #ffe1d0 100%);
  }
  .sky-layer {
    position: absolute; inset: -10%; filter: blur(60px); opacity: 0.85;
    will-change: transform;
  }
  .sky-1 {
    background: radial-gradient(40% 35% at 20% 25%, #b7d6ff 0%, transparent 60%),
                radial-gradient(35% 30% at 80% 30%, #ffd0e0 0%, transparent 65%);
    animation: drift 22s ease-in-out infinite alternate;
  }
  .sky-2 {
    background: radial-gradient(40% 40% at 70% 70%, #d6c6ff 0%, transparent 60%),
                radial-gradient(30% 30% at 25% 75%, #ffe1b8 0%, transparent 65%);
    animation: drift2 28s ease-in-out infinite alternate;
  }
  .sky-3 {
    background: radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.45) 0%, transparent 65%);
    animation: pulse 12s ease-in-out infinite alternate;
  }
  .grain {
    position: absolute; inset: 0; opacity: 0.06; mix-blend-mode: overlay;
    background-image: radial-gradient(rgba(0,0,0,0.5) 1px, transparent 1px);
    background-size: 3px 3px;
  }
  @keyframes drift  { from { transform: translate3d(-3%,-2%,0) scale(1); } to { transform: translate3d(4%,3%,0) scale(1.05); } }
  @keyframes drift2 { from { transform: translate3d(2%,3%,0)  scale(1); } to { transform: translate3d(-3%,-4%,0) scale(1.08); } }
  @keyframes pulse  { from { opacity: 0.4; } to { opacity: 0.9; } }

  .blobs {
    position: fixed; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 1; opacity: 0.7;
  }

  .glass {
    position: relative;
    background: linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.25));
    -webkit-backdrop-filter: blur(28px) saturate(160%);
    backdrop-filter: blur(28px) saturate(160%);
    border: 1px solid rgba(255,255,255,0.55);
    border-radius: 28px;
    box-shadow:
      0 20px 60px rgba(60, 80, 140, 0.18),
      inset 0 1px 0 rgba(255,255,255,0.7);
  }

  .eyebrow {
    text-transform: uppercase; letter-spacing: 0.22em; font-size: 11px;
    color: #5a6a8e; margin-bottom: 14px; font-weight: 500;
  }

  /* HERO */
  .hero {
    position: relative; z-index: 2;
    min-height: 100vh;
    padding: 28px 22px 80px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px;
  }
  .hero-card {
    padding: 36px 28px;
    max-width: 620px; width: 100%;
    text-align: center;
  }
  .title {
    font-size: clamp(38px, 8vw, 72px);
    line-height: 1.05; margin: 0 0 18px; font-weight: 300; letter-spacing: -0.02em;
  }
  .name {
    font-style: italic; font-weight: 400;
    background: linear-gradient(135deg, #6c7bff 0%, #ff8fb8 60%, #ffb070 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .subtitle {
    font-size: 15px; line-height: 1.6; color: #45527a; margin: 0;
    max-width: 460px; margin-inline: auto;
  }
  .hero-photo {
    width: min(420px, 80vw); aspect-ratio: 4/5;
    overflow: hidden; padding: 12px;
    transition: transform 0.4s ease;
  }
  .hero-photo img {
    width: 100%; height: 100%; object-fit: cover; border-radius: 18px; display: block;
  }
  .photo-sheen {
    position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
    background: linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 35%, transparent 65%, rgba(255,255,255,0.15) 100%);
  }
  .scroll-hint {
    position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: #5a6a8e; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3em;
  }
  .scroll-line {
    width: 1px; height: 32px;
    background: linear-gradient(180deg, #5a6a8e, transparent);
    animation: scrollPulse 2s ease-in-out infinite;
  }
  @keyframes scrollPulse {
    0%,100% { opacity: 0.3; transform: scaleY(0.6); transform-origin: top; }
    50%     { opacity: 1;   transform: scaleY(1);   transform-origin: top; }
  }

  /* SECTION HEAD */
  .section-head {
    padding: 22px 26px; max-width: 520px; margin: 0 auto 36px;
    text-align: center;
  }
  .section-head h2 {
    margin: 0; font-size: clamp(22px, 4.5vw, 32px); font-weight: 300; letter-spacing: -0.01em;
  }

  /* WISH BUBBLES */
  .wish-sky {
    position: relative; z-index: 2;
    min-height: 100vh; padding: 80px 18px 100px;
    overflow: hidden;
  }
  .bubble-field {
    position: relative; height: 60vh; min-height: 420px; pointer-events: none;
  }
  .bubble {
    position: absolute; bottom: 0;
    border: none; padding: 0; cursor: pointer; pointer-events: auto;
    border-radius: 50%;
    background:
      radial-gradient(circle at 30% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 18%, rgba(255,255,255,0.05) 50%, rgba(180,200,255,0.15) 100%);
    box-shadow:
      inset 0 0 24px rgba(255,255,255,0.5),
      inset 0 0 6px rgba(255,255,255,0.9),
      0 4px 18px rgba(120,140,200,0.25);
    backdrop-filter: blur(2px);
  }
  .bubble-shine {
    position: absolute; top: 12%; left: 18%; width: 28%; height: 22%;
    background: radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, transparent 70%);
    border-radius: 50%;
  }
  .bubble-glow {
    position: absolute; bottom: 14%; right: 18%; width: 18%; height: 14%;
    background: radial-gradient(ellipse, rgba(255,210,230,0.7) 0%, transparent 70%);
    border-radius: 50%;
  }
  .bubble:hover { filter: brightness(1.08); }
  .wish-card {
    position: relative; z-index: 5;
    margin: -120px auto 0; max-width: 540px;
    padding: 32px 30px; text-align: center;
  }
  .wish-mark {
    text-transform: uppercase; letter-spacing: 0.3em; font-size: 10px;
    color: #6c7bff; margin-bottom: 14px;
  }
  .wish-card p {
    margin: 0; font-size: clamp(17px, 2.6vw, 22px); line-height: 1.55;
    font-weight: 300; color: #1c2540; font-style: italic;
  }

  /* DIVIDER */
  .divider {
    position: relative; z-index: 2;
    display: block; width: 100%; height: 80px;
    margin-top: -10px;
  }

  /* CAKE */
  .cake-section {
    position: relative; z-index: 2;
    padding: 60px 18px 90px;
  }
  .cake-stage {
    display: flex; justify-content: center; align-items: flex-end;
    min-height: 380px;
    perspective: 1200px;
  }
  .cake {
    position: relative;
    width: 280px; height: 340px;
    background: transparent; border: 0; padding: 0;
    cursor: pointer;
    transform-style: preserve-3d;
    transition: transform 0.4s ease;
  }
  .cake:hover { transform: translateY(-4px) rotateX(2deg); }
  .cake.shattered { animation: cakeShake 0.4s ease; }
  @keyframes cakeShake {
    0%,100% { transform: translateX(0); }
    25%     { transform: translateX(-4px) rotate(-1deg); }
    75%     { transform: translateX(4px) rotate(1deg); }
  }
  .plate {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 280px; height: 24px; border-radius: 50%;
    background: linear-gradient(180deg, rgba(255,255,255,0.65), rgba(220,225,245,0.45));
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.8);
    box-shadow: 0 12px 28px rgba(60,80,140,0.25), inset 0 1px 0 rgba(255,255,255,0.9);
  }
  .tier {
    position: absolute; left: 50%; transform: translateX(-50%);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,210,230,0.35) 50%, rgba(200,210,255,0.45) 100%);
    backdrop-filter: blur(18px) saturate(140%);
    border: 1px solid rgba(255,255,255,0.7);
    box-shadow:
      0 12px 30px rgba(120,140,200,0.22),
      inset 0 1px 0 rgba(255,255,255,0.85),
      inset 0 -10px 24px rgba(180,200,240,0.25);
    overflow: hidden;
  }
  .tier-1 { width: 240px; height: 86px; bottom: 22px; }
  .tier-2 { width: 190px; height: 72px; bottom: 102px; }
  .tier-3 { width: 140px; height: 60px; bottom: 168px; }
  .tier-shine {
    position: absolute; top: 0; left: 0; right: 0; height: 60%;
    background: linear-gradient(180deg, rgba(255,255,255,0.55), transparent);
  }
  .drip {
    position: absolute; top: -2px; left: 0; right: 0; height: 16px;
    background:
      radial-gradient(circle 8px at 12% 100%, rgba(255,255,255,0.7) 50%, transparent 52%),
      radial-gradient(circle 6px at 28% 100%, rgba(255,255,255,0.6) 50%, transparent 52%),
      radial-gradient(circle 9px at 48% 100%, rgba(255,255,255,0.7) 50%, transparent 52%),
      radial-gradient(circle 7px at 68% 100%, rgba(255,255,255,0.65) 50%, transparent 52%),
      radial-gradient(circle 8px at 86% 100%, rgba(255,255,255,0.7) 50%, transparent 52%);
  }

  .candle {
    position: absolute; bottom: 222px; width: 8px; height: 32px;
    transform: translateX(-50%);
  }
  .wick {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 6px; height: 28px; border-radius: 3px;
    background: linear-gradient(180deg, #ffd6e6, #ff9abf 60%, #c97aa3);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
  }
  .flame {
    position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
    width: 12px; height: 18px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    background: radial-gradient(ellipse at 50% 70%, #fff5b8 0%, #ffb84d 45%, #ff7a3d 75%, transparent 100%);
    filter: drop-shadow(0 0 12px rgba(255,180,80,0.8)) drop-shadow(0 0 20px rgba(255,140,60,0.5));
    transform-origin: bottom center;
    transition: opacity 0.3s ease, transform 0.3s ease;
  }
  .flame.lit { animation: flicker 1.6s ease-in-out infinite; }
  .flame.out { opacity: 0; transform: translateX(-50%) scaleY(0.2); }
  .flame-inner {
    position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);
    width: 5px; height: 9px; border-radius: 50%;
    background: radial-gradient(ellipse, #fff 0%, #ffe9a8 70%, transparent 100%);
  }
  @keyframes flicker {
    0%,100% { transform: translateX(-50%) scaleY(1) rotate(-1deg); }
    50%     { transform: translateX(-50%) scaleY(1.1) rotate(1deg); }
  }
  .smoke {
    position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
    width: 6px; height: 14px; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(200,200,210,0.7), transparent);
    opacity: 0; pointer-events: none;
  }
  .smoke.rising { animation: smokeRise 1.4s ease-out forwards; }
  @keyframes smokeRise {
    0%   { opacity: 0.7; transform: translate(-50%, 0)   scale(0.6); }
    100% { opacity: 0;   transform: translate(-50%, -60px) scale(1.6); }
  }

  .shards { position: absolute; inset: 0; pointer-events: none; }
  .shard {
    position: absolute; left: 50%; top: 50%;
    width: 10px; height: 14px;
    background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(200,220,255,0.7));
    border: 1px solid rgba(255,255,255,0.8);
    transform: translate(-50%, -50%);
    animation: shatter 1.6s ease-out forwards;
  }
  @keyframes shatter {
    0%   { opacity: 1; transform: translate(-50%, -50%) rotate(0); }
    100% { opacity: 0; transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)); }
  }

  /* GALLERY */
  .gallery {
    position: relative; z-index: 2;
    padding: 80px 18px 100px;
  }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 22px;
    max-width: 1100px; margin: 0 auto;
  }
  .photo-card {
    aspect-ratio: 3/4; overflow: hidden; padding: 10px;
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .photo-card img {
    width: 100%; height: 100%; object-fit: cover; border-radius: 18px; display: block;
  }

  /* SIGN-OFF */
  .signoff {
    position: relative; z-index: 2;
    padding: 60px 18px 120px;
    display: flex; justify-content: center;
  }
  .signoff-card {
    padding: 40px 32px; max-width: 540px; width: 100%; text-align: center;
  }
  .signoff-card h3 {
    margin: 0 0 12px; font-size: clamp(24px, 5vw, 34px); font-weight: 300; letter-spacing: -0.01em;
  }
  .signoff-card p {
    margin: 0; color: #45527a; font-size: 16px; line-height: 1.6;
  }
  .hearts {
    margin-top: 22px; display: flex; justify-content: center; gap: 14px;
    color: #ff8fb8; font-size: 18px;
  }

  @media (max-width: 540px) {
    .hero { padding-top: 18px; gap: 22px; }
    .hero-card { padding: 28px 22px; }
    .gallery-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .cake { width: 240px; }
    .plate { width: 240px; }
    .tier-1 { width: 210px; }
    .tier-2 { width: 165px; }
    .tier-3 { width: 120px; }
  }
`;
