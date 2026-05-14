"use client";

import { Caveat, Sacramento, Cormorant_Garamond } from "next/font/google";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* LETTER variant — see design-spec.md in this folder. */

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});
const sacramento = Sacramento({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

// ─── Palette ───────────────────────────────────────────────────────
const C = {
  walnut: "#5b4634",
  honey: "#9a7a55",
  cream: "#f3ead4",
  tea: "#d8c89a",
  ink: "#1f2440",
  inkSoft: "rgba(31, 36, 64, 0.62)",
  wax: "#7a1322",
  waxDeep: "#4a0a14",
  waxGlint: "#c64152",
  brass: "#b08a48",
  brassDark: "#7a5e30",
  graphite: "#3a342b",
};

// ─── The letter content ────────────────────────────────────────────
const SALUTATION = "My dear Simren,";
const PARAGRAPHS = [
  "It is the fourteenth of May, and somewhere in the world a kettle is whistling, a sparrow is being insufferable, and you have arrived at another year. I thought I would write it down rather than say it — the page keeps better than my voice does.",
  "You are the kind of person who notices things. The unimportant ones especially: a song someone half-hummed, the way a friend's mood turns three sentences before they admit it, a wrong colour on the wrong wall. That noticing is not small. Most people walk past what you stop to see.",
  "I will not pretend you have no faults. You overthink your text messages, you treat sleep as a hobby you keep meaning to take up, and your standards for tea would unsettle a duchess. These are also the reasons people stay.",
  "When the year was hard, you did not become smaller. You did the unglamorous work of staying yourself — answering messages you did not feel like answering, showing up to rooms that asked too much of you, being kind to people who had not yet earned it. That is a quieter kind of brave.",
  "So this is what I want for you, this year: a little more selfishness, a little more trouble, a little more of the thing you keep almost ordering and then don't. Take the longer route home. Buy the absurd flowers. Reply later than is strictly polite.",
  "The pictures tucked behind the page are evidence, not decoration. Proof that you have been collected — by people, by places, by ordinary afternoons that turned out to matter more than they advertised. Pull them out if you forget.",
  "This year is not a number, it is a doorway. Walk through it slowly. Look around. The room is yours.",
];
const SIGNOFF = "Yours, always —";
const PS = "P.S. read this again whenever you forget.";

// ─── Type ──────────────────────────────────────────────────────────
type Stage = "sealed" | "cracking" | "unfolding" | "open";

export default function LetterExperience({ photos }: { photos: string[] }) {
  const [stage, setStage] = useState<Stage>("sealed");
  const [reduced, setReduced] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [activePara, setActivePara] = useState(-1); // -1 means salutation only
  const [paraDone, setParaDone] = useState<boolean[]>(
    () => PARAGRAPHS.map(() => false),
  );
  const [candles, setCandles] = useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
  ]); // true = lit
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [vw, setVw] = useState(0);

  // Reduced motion + viewport width
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onMq);

    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);

    return () => {
      mq.removeEventListener?.("change", onMq);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const isMobile = vw > 0 && vw < 640;

  // Open the letter
  const openLetter = useCallback(() => {
    if (stage !== "sealed") return;
    setStage("cracking");
    const crack = reduced ? 180 : 550;
    const fold = reduced ? 180 : 850;
    setTimeout(() => setStage("unfolding"), crack);
    setTimeout(() => {
      setStage("open");
      setActivePara(0);
    }, crack + fold);
  }, [stage, reduced]);

  // Skip to fully open + all text rendered
  const skipAll = useCallback(() => {
    setSkipped(true);
    setStage("open");
    setActivePara(PARAGRAPHS.length);
    setParaDone(PARAGRAPHS.map(() => true));
  }, []);

  // Sequence paragraphs after each finishes
  const onParagraphDone = useCallback((idx: number) => {
    setParaDone((prev) => {
      if (prev[idx]) return prev;
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    setTimeout(() => {
      setActivePara((curr) => Math.max(curr, idx + 1));
    }, 350);
  }, []);

  const allDone = paraDone.every(Boolean);

  // Candle blow
  const blowCandle = useCallback((i: number) => {
    setCandles((prev) => {
      if (!prev[i]) return prev;
      const next = [...prev];
      next[i] = false;
      return next;
    });
  }, []);

  const allBlown = candles.every((c) => !c);

  // Photos to tuck behind the letter (use first 5, rest go in a small "more" tray)
  const tuckedPhotos = useMemo(() => photos.slice(0, 5), [photos]);
  const morePhotos = useMemo(() => photos.slice(5), [photos]);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        overflowY: "auto",
        overflowX: "hidden",
        background:
          "radial-gradient(ellipse at 18% 12%, " +
          C.honey +
          " 0%, " +
          C.walnut +
          " 55%, #3a2a1c 110%)",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Wood-grain noise overlay */}
      <DeskGrain />

      {/* Skip button — visible after seal cracked */}
      {stage !== "sealed" && !skipped && !allDone && (
        <button
          onClick={skipAll}
          aria-label="Skip animation and read the full letter"
          className={cormorant.className}
          style={{
            position: "fixed",
            top: 18,
            right: 18,
            zIndex: 5,
            background: "rgba(243,234,212,0.85)",
            color: C.ink,
            border: "1px solid rgba(31,36,64,0.18)",
            padding: "8px 14px",
            borderRadius: 999,
            fontSize: 13,
            fontStyle: "italic",
            letterSpacing: "0.04em",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          skip ▸
        </button>
      )}

      {/* Desk objects (desktop only) */}
      {!isMobile && <DeskObjects />}

      {/* Stage container */}
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? "32px 16px 64px" : "60px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: "min(620px, 92vw)",
            position: "relative",
            perspective: "1600px",
          }}
        >
          {/* SEALED + CRACKING — folded letter, seal cracks in place */}
          {(stage === "sealed" || stage === "cracking") && (
            <SealedLetter
              onOpen={openLetter}
              reduced={reduced}
              cracking={stage === "cracking"}
            />
          )}

          {/* UNFOLDING + OPEN — paper unfolds and reveals content */}
          {(stage === "unfolding" || stage === "open") && (
            <OpenLetter
              stage={stage}
              isMobile={isMobile}
              reduced={reduced}
              activePara={activePara}
              skipped={skipped}
              onParagraphDone={onParagraphDone}
              candles={candles}
              blowCandle={blowCandle}
              allBlown={allBlown}
              tuckedPhotos={tuckedPhotos}
              morePhotos={morePhotos}
              onPhotoClick={(i) => setLightboxIdx(i)}
              allDone={allDone}
            />
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <Lightbox
          src={photos[lightboxIdx]}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {/* Global font defaults for body text */}
      <style>{`
        .letter-body, .letter-body * {
          font-family: ${caveat.style.fontFamily}, "Caveat", "Bradley Hand", cursive;
        }
        .letter-display {
          font-family: ${sacramento.style.fontFamily}, "Sacramento", "Snell Roundhand", cursive;
        }
        .letter-meta {
          font-family: ${cormorant.style.fontFamily}, "Cormorant Garamond", Georgia, serif;
        }
        @keyframes letterPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.95; }
        }
        @keyframes letterCaret {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes letterFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes letterFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes letterRise {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes letterSmoke {
          0% { opacity: 0.85; transform: translateY(0) scale(0.5); }
          100% { opacity: 0; transform: translateY(-22px) scale(1.4); }
        }
        @keyframes letterDrawStroke {
          to { stroke-dashoffset: 0; }
        }
        @keyframes letterFlame {
          0%, 100% { transform: scaleY(1) translateY(0); }
          50% { transform: scaleY(1.12) translateY(-1px); }
        }
        @keyframes letterCrackL {
          to { transform: translate(-26px, 6px) rotate(-22deg); opacity: 0; }
        }
        @keyframes letterCrackR {
          to { transform: translate(26px, 6px) rotate(22deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Desk noise (subtle wood grain via SVG) ───────────────────────
function DeskGrain() {
  return (
    <svg
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.16,
        pointerEvents: "none",
        zIndex: 0,
        mixBlendMode: "overlay",
      }}
    >
      <filter id="deskNoise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix
          values="0 0 0 0 0.3
                  0 0 0 0 0.22
                  0 0 0 0 0.15
                  0 0 0 0.6 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#deskNoise)" />
    </svg>
  );
}

// ─── Decorative desk objects ──────────────────────────────────────
function DeskObjects() {
  return (
    <>
      {/* Fountain pen (top-right) */}
      <svg
        aria-hidden
        viewBox="0 0 200 40"
        style={{
          position: "absolute",
          top: 90,
          right: -10,
          width: 220,
          height: 44,
          opacity: 0.55,
          transform: "rotate(28deg)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <defs>
          <linearGradient id="penBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2a1a0e" />
            <stop offset="1" stopColor="#5a3a20" />
          </linearGradient>
          <linearGradient id="penNib" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={C.brass} />
            <stop offset="1" stopColor={C.brassDark} />
          </linearGradient>
        </defs>
        <rect x="20" y="14" width="140" height="12" rx="6" fill="url(#penBody)" />
        <polygon points="160,14 195,20 160,26" fill="url(#penNib)" />
        <line
          x1="178"
          y1="20"
          x2="190"
          y2="20"
          stroke="#1f1408"
          strokeWidth="0.8"
        />
        <circle cx="22" cy="20" r="6" fill={C.brass} />
      </svg>
      {/* Postage stamp (bottom-left) */}
      <svg
        aria-hidden
        viewBox="0 0 80 96"
        style={{
          position: "absolute",
          bottom: 80,
          left: 60,
          width: 84,
          height: 100,
          opacity: 0.55,
          transform: "rotate(-14deg)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="76"
          height="92"
          fill={C.cream}
          stroke={C.tea}
          strokeWidth="1"
          strokeDasharray="3 1.5"
        />
        <rect x="10" y="10" width="60" height="60" fill="#b8694a" opacity="0.7" />
        <text
          x="40"
          y="86"
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontSize="9"
          fill={C.ink}
        >
          POST · 2026
        </text>
      </svg>
      {/* Small wax stick on a dish (bottom-right) */}
      <svg
        aria-hidden
        viewBox="0 0 120 60"
        style={{
          position: "absolute",
          bottom: 100,
          right: 50,
          width: 130,
          height: 64,
          opacity: 0.55,
          transform: "rotate(-8deg)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      >
        <ellipse cx="60" cy="48" rx="50" ry="8" fill="#3a2a1c" />
        <ellipse cx="60" cy="46" rx="46" ry="6" fill={C.brassDark} />
        <rect x="38" y="22" width="44" height="22" rx="3" fill={C.wax} />
        <rect x="38" y="22" width="44" height="6" fill={C.waxGlint} opacity="0.5" />
      </svg>
    </>
  );
}

// ─── SEALED letter ────────────────────────────────────────────────
function SealedLetter({
  onOpen,
  reduced,
  cracking,
}: {
  onOpen: () => void;
  reduced: boolean;
  cracking: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2.1",
        animation: reduced
          ? undefined
          : "letterFadeUp 600ms ease-out both",
      }}
    >
      {/* Shadow under letter */}
      <div
        style={{
          position: "absolute",
          inset: "10% 4% -6% 4%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%)",
          filter: "blur(20px)",
          zIndex: 0,
        }}
      />
      {/* Folded letter (envelope-look) */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(180deg, " +
            C.cream +
            " 0%, " +
            C.cream +
            " 60%, #ebe0c2 100%)",
          borderRadius: 4,
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.35), inset 0 0 80px rgba(216, 200, 154, 0.4)",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        {/* Paper noise */}
        <PaperGrain />
        {/* Tri-fold seam lines */}
        <div
          style={{
            position: "absolute",
            top: "33%",
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(31,36,64,0.18), transparent)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "67%",
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(31,36,64,0.18), transparent)",
          }}
        />
        {/* Brass paper-clip */}
        <PaperClip />
        {/* Address line — calligraphic "Simren" centred */}
        <div
          style={{
            position: "absolute",
            top: "16%",
            left: 0,
            right: 0,
            textAlign: "center",
            color: C.ink,
            opacity: 0.78,
          }}
        >
          <div
            className="letter-meta"
            style={{
              fontSize: 11,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              opacity: 0.65,
              marginBottom: 4,
            }}
          >
            for
          </div>
          <div
            className="letter-display"
            style={{
              fontSize: "clamp(34px, 6.4vw, 48px)",
              lineHeight: 1,
            }}
          >
            Simren
          </div>
        </div>

        {/* Wax seal — intact button (sealed) OR split halves (cracking) */}
        {!cracking ? (
          <button
            onClick={onOpen}
            aria-label="Open the letter"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "clamp(86px, 14vw, 110px)",
              height: "clamp(86px, 14vw, 110px)",
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              zIndex: 3,
              outline: "none",
            }}
          >
            <WaxSeal />
          </button>
        ) : (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "clamp(86px, 14vw, 110px)",
              height: "clamp(86px, 14vw, 110px)",
              zIndex: 3,
              pointerEvents: "none",
            }}
          >
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  clipPath: "polygon(0 0, 50% 0, 50% 100%, 0 100%)",
                  animation: reduced
                    ? "letterFadeIn 200ms ease-in reverse forwards"
                    : "letterCrackL 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                }}
              >
                <WaxSeal />
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  clipPath: "polygon(50% 0, 100% 0, 100% 100%, 50% 100%)",
                  animation: reduced
                    ? "letterFadeIn 200ms ease-in reverse forwards"
                    : "letterCrackR 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                }}
              >
                <WaxSeal />
              </div>
            </div>
          </div>
        )}

        {/* "tap the seal" hint — hide once cracking starts */}
        {!cracking && (
          <div
            className="letter-meta"
            style={{
              position: "absolute",
              bottom: "10%",
              left: 0,
              right: 0,
              textAlign: "center",
              color: C.ink,
              opacity: 0.55,
              fontSize: 14,
              fontStyle: "italic",
              letterSpacing: "0.04em",
              animation: reduced
                ? undefined
                : "letterPulse 1600ms ease-in-out infinite",
            }}
          >
            tap the seal
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wax seal SVG ─────────────────────────────────────────────────
function WaxSeal() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="waxBody" cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor={C.waxGlint} />
          <stop offset="0.4" stopColor={C.wax} />
          <stop offset="1" stopColor={C.waxDeep} />
        </radialGradient>
        <radialGradient id="waxShadow" cx="0.5" cy="0.6" r="0.6">
          <stop offset="0" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.5)" />
        </radialGradient>
      </defs>
      {/* Outer drip-edge */}
      <path
        d="M50 4
           C 70 6, 92 18, 94 44
           C 96 64, 88 84, 70 92
           L 64 96 L 58 88 L 50 94 L 42 88 L 36 96 L 30 92
           C 12 84, 4 64, 6 44
           C 8 18, 30 6, 50 4 Z"
        fill="url(#waxBody)"
        stroke={C.waxDeep}
        strokeWidth="0.6"
      />
      {/* Inner shadow ring */}
      <circle cx="50" cy="50" r="38" fill="url(#waxShadow)" opacity="0.55" />
      {/* Embossed monogram — a simple "S" in serif */}
      <text
        x="50"
        y="64"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="42"
        fontStyle="italic"
        fontWeight="600"
        fill={C.waxDeep}
        opacity="0.65"
      >
        S
      </text>
      {/* Specular highlight */}
      <ellipse
        cx="36"
        cy="30"
        rx="14"
        ry="7"
        fill={C.waxGlint}
        opacity="0.55"
      />
    </svg>
  );
}

// ─── Brass paper-clip ─────────────────────────────────────────────
function PaperClip() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 60 90"
      style={{
        position: "absolute",
        top: -12,
        left: 30,
        width: 36,
        height: 56,
        zIndex: 4,
      }}
    >
      <defs>
        <linearGradient id="clipGrad" x1="0" x2="1">
          <stop offset="0" stopColor={C.brass} />
          <stop offset="0.5" stopColor="#e0bc78" />
          <stop offset="1" stopColor={C.brassDark} />
        </linearGradient>
      </defs>
      <path
        d="M14 4
           L 14 70
           A 12 12 0 0 0 38 70
           L 38 16
           A 8 8 0 0 0 22 16
           L 22 64"
        fill="none"
        stroke="url(#clipGrad)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Paper grain (noise SVG) ──────────────────────────────────────
function PaperGrain() {
  return (
    <svg
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.35,
        pointerEvents: "none",
        mixBlendMode: "multiply",
      }}
    >
      <filter id="paperNoise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.6"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix
          values="0 0 0 0 0.78
                  0 0 0 0 0.7
                  0 0 0 0 0.55
                  0 0 0 0.18 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#paperNoise)" />
    </svg>
  );
}

// ─── OPEN letter (unfolding + content) ────────────────────────────
function OpenLetter({
  stage,
  isMobile,
  reduced,
  activePara,
  skipped,
  onParagraphDone,
  candles,
  blowCandle,
  allBlown,
  tuckedPhotos,
  morePhotos,
  onPhotoClick,
  allDone,
}: {
  stage: Stage;
  isMobile: boolean;
  reduced: boolean;
  activePara: number;
  skipped: boolean;
  onParagraphDone: (i: number) => void;
  candles: boolean[];
  blowCandle: (i: number) => void;
  allBlown: boolean;
  tuckedPhotos: string[];
  morePhotos: string[];
  onPhotoClick: (idx: number) => void;
  allDone: boolean;
}) {
  // Paper transform during unfold: mount in folded state, flip on next frame so
  // CSS transitions actually animate the unfold rather than appearing instantly.
  const open = stage === "open";
  const [folded, setFolded] = useState(stage === "unfolding" && !skipped && !reduced);
  useEffect(() => {
    if (folded) {
      const id = requestAnimationFrame(() => {
        // small delay so the folded state actually paints first
        requestAnimationFrame(() => setFolded(false));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [folded]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        transformStyle: "preserve-3d",
        animation:
          reduced || skipped
            ? "letterFadeIn 200ms ease-out both"
            : "letterFadeUp 500ms ease-out both",
        transform: !isMobile ? "rotate(-1.2deg)" : undefined,
      }}
    >
      {/* The opened letter sheet */}
      <div
        style={{
          position: "relative",
          background:
            "linear-gradient(180deg, " +
            C.cream +
            " 0%, " +
            C.cream +
            " 70%, #ebe0c2 100%)",
          borderRadius: 4,
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.35), inset 0 0 80px rgba(216,200,154,0.35)",
          padding: isMobile ? "44px 26px 38px" : "60px 64px 50px",
          color: C.ink,
          overflow: "hidden",
          transformOrigin: "center top",
          transition: reduced
            ? "transform 200ms ease-out, opacity 200ms ease-out"
            : "transform 850ms cubic-bezier(0.16, 1, 0.3, 1), opacity 600ms ease-out",
          transform: folded
            ? "scaleY(0.5) rotateX(40deg)"
            : "scaleY(1) rotateX(0deg)",
          opacity: folded ? 0.6 : 1,
        }}
      >
        <PaperGrain />

        {/* Brass paper-clip on opened sheet */}
        <div style={{ position: "absolute", top: 0, left: isMobile ? 22 : 38, zIndex: 5 }}>
          <PaperClip />
        </div>

        {/* Postmark */}
        <div
          className="letter-meta"
          style={{
            position: "absolute",
            top: 18,
            right: isMobile ? 18 : 30,
            fontSize: 11,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: C.inkSoft,
            opacity: 0.85,
            zIndex: 4,
          }}
        >
          May · 14 · 2026
        </div>

        {/* Salutation */}
        <h1
          className="letter-display"
          style={{
            fontSize: "clamp(36px, 7vw, 56px)",
            lineHeight: 1,
            margin: 0,
            marginBottom: isMobile ? 24 : 32,
            color: C.ink,
            opacity: open ? 1 : 0,
            transition: "opacity 500ms ease-out 120ms",
            position: "relative",
            zIndex: 2,
          }}
        >
          {SALUTATION}
        </h1>

        {/* Body */}
        <article
          className="letter-body"
          style={{
            position: "relative",
            zIndex: 2,
            color: C.ink,
            fontSize: isMobile ? 20 : 24,
            lineHeight: 1.55,
            letterSpacing: "0.01em",
          }}
          aria-label="Letter body"
        >
          {PARAGRAPHS.map((p, i) => (
            <Typewriter
              key={i}
              text={p}
              active={skipped || i <= activePara}
              instant={skipped || reduced}
              speedMs={isMobile ? 35 : 50}
              showCaret={i === activePara && !skipped}
              onDone={() => onParagraphDone(i)}
              marginBottom={i === PARAGRAPHS.length - 1 ? (isMobile ? 24 : 32) : (isMobile ? 16 : 20)}
            />
          ))}
        </article>

        {/* Pencil cake — desktop in margin, mobile inline below para 4 area */}
        <PencilCake
          isMobile={isMobile}
          reduced={reduced}
          visible={open}
          candles={candles}
          blowCandle={blowCandle}
          allBlown={allBlown}
        />

        {/* Sign-off */}
        <div
          style={{
            opacity: skipped || allDone ? 1 : 0,
            transition: "opacity 600ms ease-out",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            className="letter-display"
            style={{
              fontSize: "clamp(28px, 5vw, 42px)",
              lineHeight: 1.1,
              color: C.ink,
              marginBottom: 6,
            }}
          >
            {SIGNOFF}
          </div>
          <Flourish />
          <p
            className="letter-body"
            style={{
              marginTop: 26,
              marginLeft: isMobile ? 12 : 26,
              fontSize: isMobile ? 18 : 21,
              color: C.inkSoft,
              fontStyle: "italic",
            }}
          >
            {PS}
          </p>
        </div>
      </div>

      {/* Photo strip tucked behind the bottom of the letter */}
      {tuckedPhotos.length > 0 && (
        <PhotoStrip
          photos={tuckedPhotos}
          isMobile={isMobile}
          visible={skipped || allDone}
          reduced={reduced}
          onPhotoClick={onPhotoClick}
        />
      )}

      {/* Extra photos as a small "more" tray */}
      {morePhotos.length > 0 && (skipped || allDone) && (
        <MorePhotos
          startIdx={tuckedPhotos.length}
          photos={morePhotos}
          isMobile={isMobile}
          onPhotoClick={onPhotoClick}
        />
      )}
    </div>
  );
}

// ─── Typewriter ───────────────────────────────────────────────────
function Typewriter({
  text,
  active,
  instant,
  speedMs,
  showCaret,
  onDone,
  marginBottom,
}: {
  text: string;
  active: boolean;
  instant: boolean;
  speedMs: number;
  showCaret: boolean;
  onDone: () => void;
  marginBottom: number;
}) {
  const [n, setN] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setN(0);
      doneRef.current = false;
      return;
    }
    if (instant) {
      setN(text.length);
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    if (n >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    const t = setTimeout(() => setN((x) => x + 1), speedMs);
    return () => clearTimeout(t);
  }, [active, instant, n, text.length, speedMs, onDone]);

  // Visible chars vs hidden chars — keep full text in DOM for screen readers
  const visible = text.slice(0, n);
  const hidden = text.slice(n);

  return (
    <p
      style={{
        margin: 0,
        marginBottom,
        minHeight: "1.5em",
      }}
    >
      <span>{visible}</span>
      {showCaret && n < text.length && (
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 2,
            height: "1em",
            background: C.ink,
            marginLeft: 1,
            verticalAlign: "text-bottom",
            animation: "letterCaret 1s steps(1) infinite",
          }}
        />
      )}
      {/* Screen-reader-only full text */}
      {hidden && (
        <span
          aria-hidden={false}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
          }}
        >
          {hidden}
        </span>
      )}
    </p>
  );
}

// ─── Pencil cake with candles ─────────────────────────────────────
function PencilCake({
  isMobile,
  reduced,
  visible,
  candles,
  blowCandle,
  allBlown,
}: {
  isMobile: boolean;
  reduced: boolean;
  visible: boolean;
  candles: boolean[];
  blowCandle: (i: number) => void;
  allBlown: boolean;
}) {
  const w = isMobile ? 220 : 200;
  const h = isMobile ? 170 : 160;

  // Cake dimensions inside the SVG viewBox 200x160
  // Top tier polygon spans y=80 (top edge) to y=100 (bottom edge).
  // Candles sit ON the top edge (y=80) and rise upward to y=52.
  const candleX = [70, 84, 100, 116, 130]; // positions on top of top tier
  const candleTopY = 52; // candle top (flame just above)
  const candleBaseY = 80; // sits on the cake's top tier top edge

  return (
    <div
      style={{
        position: isMobile ? "relative" : "absolute",
        right: isMobile ? undefined : -10,
        top: isMobile ? undefined : 220,
        margin: isMobile ? "12px auto 24px" : 0,
        width: w,
        height: h,
        opacity: visible ? 1 : 0,
        transition: "opacity 800ms ease-out 400ms",
        zIndex: 3,
      }}
      aria-label="Pencil sketch of a birthday cake with five candles"
    >
      <svg viewBox="0 0 200 160" width={w} height={h} style={{ overflow: "visible" }}>
        {/* Sketch lines */}
        <g
          stroke={C.graphite}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.7"
        >
          {/* Plate */}
          <path
            d={`M 30 130 Q 100 145, 170 130`}
            strokeDasharray={reduced ? undefined : "180"}
            strokeDashoffset={reduced ? undefined : "180"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 700ms ease-out 500ms forwards"
                      : undefined,
                  }
            }
          />
          {/* Bottom tier */}
          <path
            d="M 40 128 L 40 100 Q 100 90, 160 100 L 160 128"
            strokeDasharray={reduced ? undefined : "260"}
            strokeDashoffset={reduced ? undefined : "260"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 800ms ease-out 700ms forwards"
                      : undefined,
                  }
            }
          />
          <path
            d="M 40 100 Q 100 110, 160 100"
            strokeDasharray={reduced ? undefined : "120"}
            strokeDashoffset={reduced ? undefined : "120"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 400ms ease-out 1100ms forwards"
                      : undefined,
                  }
            }
          />
          {/* Top tier */}
          <path
            d="M 60 100 L 60 80 Q 100 72, 140 80 L 140 100"
            strokeDasharray={reduced ? undefined : "180"}
            strokeDashoffset={reduced ? undefined : "180"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 700ms ease-out 1300ms forwards"
                      : undefined,
                  }
            }
          />
          <path
            d="M 60 80 Q 100 88, 140 80"
            strokeDasharray={reduced ? undefined : "100"}
            strokeDashoffset={reduced ? undefined : "100"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 400ms ease-out 1700ms forwards"
                      : undefined,
                  }
            }
          />
          {/* Drip icing on bottom tier */}
          <path
            d="M 50 100 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0 q 5 8 10 0"
            strokeDasharray={reduced ? undefined : "200"}
            strokeDashoffset={reduced ? undefined : "200"}
            style={
              reduced
                ? undefined
                : {
                    animation: visible
                      ? "letterDrawStroke 800ms ease-out 1900ms forwards"
                      : undefined,
                  }
            }
          />
          {/* Candles & flames are drawn as children below — they live inside the cake group */}
          {candles.map((lit, i) => {
            const x = candleX[i];
            return (
              <g key={i}>
                {/* candle stick */}
                <line
                  x1={x}
                  y1={candleBaseY}
                  x2={x}
                  y2={candleTopY}
                  stroke={lit ? C.graphite : "#6b6357"}
                  strokeWidth="2"
                  strokeDasharray={reduced ? undefined : "26"}
                  strokeDashoffset={reduced ? undefined : "26"}
                  style={
                    reduced
                      ? undefined
                      : {
                          animation: visible
                            ? `letterDrawStroke 250ms ease-out ${2200 + i * 80}ms forwards`
                            : undefined,
                        }
                  }
                />
                {/* strike-through if blown */}
                {!lit && (
                  <line
                    x1={x - 5}
                    y1={(candleBaseY + candleTopY) / 2}
                    x2={x + 5}
                    y2={(candleBaseY + candleTopY) / 2}
                    stroke="#6b6357"
                    strokeWidth="1.4"
                    opacity="0.85"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Flame layer + smoke layer (separate groups so we can toggle) */}
        {candles.map((lit, i) => {
          const x = candleX[i];
          if (!lit) {
            return (
              <g
                key={`smoke-${i}`}
                style={{
                  transformOrigin: `${x}px ${candleTopY - 6}px`,
                  transformBox: "view-box",
                  animation: "letterSmoke 900ms ease-out forwards",
                }}
              >
                <ellipse
                  cx={x}
                  cy={candleTopY - 6}
                  rx="5"
                  ry="6"
                  fill="#cfc8b8"
                />
              </g>
            );
          }
          return (
            <g key={`flame-${i}`}>
              {/* flame */}
              <path
                d={`M ${x} ${candleTopY - 10} q -3 4, 0 8 q 3 -4, 0 -8 z`}
                fill="#f4b740"
                style={{
                  transformOrigin: `${x}px ${candleTopY}px`,
                  animation: reduced
                    ? undefined
                    : `letterFlame ${1200 + i * 90}ms ease-in-out infinite`,
                }}
              />
              <ellipse cx={x} cy={candleTopY - 6} rx="1.4" ry="2.4" fill="#fff8c8" />
            </g>
          );
        })}

        {/* Tap targets — invisible buttons on top of each candle */}
        {candles.map((_lit, i) => {
          const x = candleX[i];
          return (
            <foreignObject
              key={`btn-${i}`}
              x={x - 14}
              y={candleTopY - 18}
              width="28"
              height="44"
            >
              <button
                onClick={() => blowCandle(i)}
                aria-label={`Blow out candle ${i + 1}`}
                style={{
                  width: "100%",
                  height: "100%",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: candles[i] ? "pointer" : "default",
                }}
              />
            </foreignObject>
          );
        })}
      </svg>
      {/* Caption */}
      <div
        className="letter-meta"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -6,
          textAlign: "center",
          fontSize: 13,
          fontStyle: "italic",
          color: C.inkSoft,
          letterSpacing: "0.04em",
        }}
      >
        {allBlown ? "wish made." : "make a wish"}
      </div>
    </div>
  );
}

// ─── Hand-drawn flourish under the sign-off ───────────────────────
function Flourish() {
  return (
    <svg viewBox="0 0 240 40" width="180" height="32" aria-hidden>
      <path
        d="M 4 22 Q 30 4, 60 22 T 120 22 T 180 22 Q 200 30, 220 14 Q 230 8, 236 16"
        stroke={C.ink}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="236" cy="16" r="1.6" fill={C.ink} opacity="0.85" />
    </svg>
  );
}

// ─── Photo strip tucked behind the letter ─────────────────────────
function PhotoStrip({
  photos,
  isMobile,
  visible,
  reduced,
  onPhotoClick,
}: {
  photos: string[];
  isMobile: boolean;
  visible: boolean;
  reduced: boolean;
  onPhotoClick: (i: number) => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        marginTop: -32, // tuck under the bottom of the letter
        display: "flex",
        flexWrap: "wrap",
        gap: isMobile ? 10 : 16,
        justifyContent: "center",
        padding: "0 12px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: reduced
          ? "opacity 200ms ease-out"
          : "opacity 600ms ease-out, transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {photos.map((src, i) => (
        <PhotoCard
          key={src}
          src={src}
          alt={`Simren — moment ${i + 1}`}
          rotate={(i % 2 === 0 ? -1 : 1) * (3 + (i % 3) * 1.8)}
          onClick={() => onPhotoClick(i)}
        />
      ))}
    </div>
  );
}

function PhotoCard({
  src,
  alt,
  rotate,
  onClick,
}: {
  src: string;
  alt: string;
  rotate: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`View ${alt}`}
      style={{
        background: "#fff",
        padding: "8px 8px 22px 8px",
        boxShadow:
          "0 12px 24px rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.25)",
        border: "none",
        borderRadius: 2,
        cursor: "pointer",
        transform: `rotate(${rotate}deg)`,
        transition: "transform 200ms ease-out",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = `rotate(${rotate * 0.4}deg) translateY(-4px) scale(1.03)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = `rotate(${rotate}deg)`;
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: 120,
          height: 150,
          objectFit: "cover",
          display: "block",
          background: "#eee",
        }}
      />
    </button>
  );
}

// ─── Extra photos tray ────────────────────────────────────────────
function MorePhotos({
  startIdx,
  photos,
  isMobile,
  onPhotoClick,
}: {
  startIdx: number;
  photos: string[];
  isMobile: boolean;
  onPhotoClick: (i: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 28,
        display: "flex",
        flexWrap: "wrap",
        gap: isMobile ? 8 : 12,
        justifyContent: "center",
        padding: "0 12px 20px",
        animation: "letterRise 600ms ease-out 200ms both",
      }}
    >
      {photos.map((src, i) => (
        <PhotoCard
          key={src}
          src={src}
          alt={`Simren — moment ${startIdx + i + 1}`}
          rotate={(i % 2 === 0 ? -1 : 1) * (2 + (i % 3))}
          onClick={() => onPhotoClick(startIdx + i)}
        />
      ))}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(20,12,6,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        cursor: "zoom-out",
        animation: "letterFadeIn 200ms ease-out both",
      }}
    >
      <img
        src={src}
        alt="Simren"
        style={{
          maxWidth: "92vw",
          maxHeight: "88vh",
          borderRadius: 4,
          background: "#fff",
          padding: 10,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        aria-label="Close photo"
        style={{
          position: "fixed",
          top: 18,
          right: 18,
          background: "rgba(243,234,212,0.9)",
          color: C.ink,
          border: "none",
          borderRadius: 999,
          width: 40,
          height: 40,
          fontSize: 18,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        ✕
      </button>
    </div>
  );
}
