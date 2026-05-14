"use client";

import { Fraunces, Manrope } from "next/font/google";
import { motion, useReducedMotion } from "framer-motion";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const WISHES = [
  "That the year ahead unfold the way good chapters do — slowly, then all at once.",
  "That every room you enter remember you for the right reasons.",
  "That the work you make outlives the noise around it.",
  "That you keep the friends who tell you the truth and lose the ones who flinch from it.",
  "That mornings stay yours, and nights stay easy.",
  "That whatever you are building this year quietly arrives.",
  "That this year feels less like a number and more like a doorway you walked through on purpose.",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export default function MagazineExperience({ photos }: { photos: string[] }) {
  const reduce = useReducedMotion();

  // Safe accessors — gracefully degrade if photos are missing
  const photo = (i: number) => photos[i % Math.max(photos.length, 1)] ?? photos[0] ?? "";
  const haveCover = photos.length > 0;

  // Page-turn transition factory (respects reduced motion)
  const turn = reduce
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.3 },
      }
    : {
        initial: { rotateY: 6, opacity: 0.85 },
        whileInView: { rotateY: 0, opacity: 1 },
        viewport: { once: true, amount: 0.25 },
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div
      className={`${display.variable} ${body.variable}`}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: "var(--cream)",
        color: "var(--ink)",
        fontFamily: "var(--font-body), system-ui, sans-serif",
        WebkitFontSmoothing: "antialiased",
        perspective: "2400px",
      }}
    >
      <style>{css}</style>

      {/* ============ SPREAD 1 — COVER ============ */}
      {/* CRITICAL: animate (not whileInView) so above-the-fold content shows at t=0 */}
      <section className="spread cover" style={{ minHeight: "100svh" }}>
        {haveCover && (
          <motion.img
            src={photo(0)}
            alt=""
            className="cover-photo"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
        {/* Vignette as a sibling — never blur the text container */}
        <div className="cover-vignette" aria-hidden />

        {/* Masthead */}
        <div className="masthead">
          <span className="mast-left">SIMREN</span>
          <span className="mast-center">ISSUE NO. 14 &nbsp;·&nbsp; MAY 2026 &nbsp;·&nbsp; VOL. I</span>
          <span className="mast-right">EDITION D&apos;ANNIVERSAIRE</span>
        </div>

        {/* Cover-line teasers */}
        <div className="coverline coverline-tr">
          <span>ON LIGHT,</span>
          <span>AND THE WOMEN</span>
          <span>WHO CARRY IT</span>
        </div>
        <div className="coverline coverline-br">
          <span>A FIELD GUIDE</span>
          <span>TO BEING YOU</span>
        </div>

        {/* Cover title */}
        <motion.h1
          className="cover-title"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          SIMREN
        </motion.h1>
        <motion.p
          className="cover-subtitle"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          A COVER STORY &nbsp;·&nbsp; PLATES I–V &nbsp;·&nbsp; ONE CENTERFOLD,
          <br />
          AND SEVEN WISHES SET IN ITALIC
        </motion.p>

        {/* Barcode */}
        <div className="barcode-wrap">
          <div className="barcode" aria-hidden>
            {Array.from({ length: 38 }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i % 5 === 0 ? 2 : i % 3 === 0 ? 1.5 : 1,
                  background: "var(--ink)",
                }}
              />
            ))}
          </div>
          <div className="barcode-text">£14 · €17 · USD 18 &nbsp;·&nbsp; MAY MMXXVI</div>
        </div>

        <div className="page-num page-num-bl">01</div>
      </section>

      {/* ============ SPREAD 2 — FOREWORD ============ */}
      <motion.section className="spread foreword" {...turn}>
        <div className="section-label">
          <span>FROM THE EDITOR — A NOTE ON SIMREN</span>
          <i className="rule-accent" />
        </div>

        <h2 className="spread-headline">The light, kept.</h2>

        <div className="foreword-grid">
          <div className="foreword-text">
            <p>
              <span className="dropcap">T</span>
              here are people who arrive in a year and rearrange it. Simren is one of them. She does it
              quietly — the way good light moves a room before you notice the lamp was on. This issue is
              for her, and only for her: a single edition, printed in a run of one, dated the fourteenth
              of May, two thousand and twenty-six.
            </p>
            <p>
              We were going to write something clever. We tried; it was too clever. So we kept the photographs and
              we kept the language plain, because plain is what holds up. The pages that follow are not a
              biography. They are a posture — the way she holds herself in a frame, in a sentence, in a
              year.
            </p>
            <p>
              Read it slowly. There are seven wishes near the back. They are the only part you are allowed
              to take with you.
            </p>
          </div>

          {photos[1] && (
            <figure className="foreword-plate">
              <img src={photo(1)} alt="" />
              <figcaption>
                PLATE I &nbsp;—&nbsp; <i>Untitled (interior, afternoon)</i>
              </figcaption>
            </figure>
          )}
        </div>

        <div className="page-num page-num-bl">02</div>
        <div className="page-num page-num-br">03</div>
      </motion.section>

      {/* ============ SPREAD 3 — PLATE II FULL-BLEED ============ */}
      <motion.section className="spread plate-full" {...turn}>
        {photos[2] && <img className="plate-fullbleed" src={photo(2)} alt="" />}
        <div className="plate-full-caption">
          <div className="plate-numeral">PLATE II</div>
          <div className="plate-title">
            <i>A study in posture</i>
          </div>
          <div className="plate-line">
            On the way she occupies a frame without ever asking it for permission.
          </div>
        </div>
        <div className="page-num page-num-br dark">04</div>
      </motion.section>

      {/* ============ SPREAD 4 — PLATE III + COLUMN ============ */}
      <motion.section className="spread plate-split" {...turn}>
        <div className="split-photo">
          {photos[3] && <img src={photo(3)} alt="" />}
          <div className="split-caption">
            PLATE III &nbsp;—&nbsp; <i>Verso</i>
          </div>
        </div>
        <div className="split-text">
          <div className="section-label">
            <span>ON HER</span>
            <i className="rule-accent" />
          </div>
          <h3 className="split-head">She walks into a room and the room rearranges itself.</h3>
          <p>
            Not loudly. Not as a performance. The chairs simply turn a few degrees, the conversation finds a
            cleaner key, and somebody — usually the person who has been talking longest — stops to listen.
            This is a kind of authority that does not announce itself, and is therefore the only kind worth
            keeping.
          </p>
          <p>
            What she has, exactly, is hard to name. The French would call it a <i>tenue</i>. The English
            would call it bearing. We will call it — for the length of this paragraph — a refusal. A refusal
            to be hurried, or flattered, or made small.
          </p>
        </div>
        <div className="page-num page-num-bl">05</div>
        <div className="page-num page-num-br">06</div>
      </motion.section>

      {/* ============ SPREAD 5 — CAKE CENTERFOLD ============ */}
      <motion.section className="spread centerfold" {...turn}>
        <div className="spine" aria-hidden />
        <div className="center-left">
          <div className="section-label">
            <span>CENTERFOLD &nbsp;—&nbsp; THE CAKE</span>
            <i className="rule-accent" />
          </div>
          <h2 className="spread-headline">
            One cake,
            <br />
            <i>one wish.</i>
          </h2>
          <p className="center-blurb">
            Illustrated for this issue. Two tiers, cream icing, a single ribbon of accent across the upper
            band. Candles enough to count if you want to, and one more, unlit, set aside for whatever you
            decide the year ought to be.
          </p>
        </div>

        <div className="center-right">
          <CakeIllustration />
        </div>

        <div className="page-num page-num-bl">07</div>
        <div className="page-num page-num-br">08</div>
      </motion.section>

      {/* ============ SPREAD 6 — PLATE IV TWO-COLUMN ============ */}
      <motion.section className="spread plate-twocol" {...turn}>
        <div className="twocol-photo">
          {photos[4] && <img src={photo(4)} alt="" />}
        </div>
        <div className="twocol-text">
          <div className="plate-numeral">PLATE IV</div>
          <h3 className="twocol-title">
            <i>Late afternoon, west-facing</i>
          </h3>
          <p>
            The hour photographers wait for, the one painters lie about. Light at this angle does not
            flatter so much as it tells the truth gently. Notice what it does to the edge of the jaw, to
            the way the shoulder meets the collarbone — the small architectures that the rest of the day
            keeps hidden.
          </p>
          <p>
            We left this one almost unedited. There was nothing to fix.
          </p>
        </div>
        <div className="page-num page-num-bl">09</div>
        <div className="page-num page-num-br">10</div>
      </motion.section>

      {/* ============ SPREAD 7 — WISHES (7 pull-quote pages) ============ */}
      {WISHES.map((wish, i) => (
        <motion.section key={i} className="spread wish" {...turn}>
          {i === 0 && (
            <div className="section-label wish-label">
              <span>SEVEN WISHES &nbsp;—&nbsp; SET IN ITALIC</span>
              <i className="rule-accent" />
            </div>
          )}
          <div className="wish-block">
            <div className="wish-rule" aria-hidden />
            <blockquote className="wish-quote">{wish}</blockquote>
            <div className="wish-meta">
              — &nbsp; WISH {ROMAN[i]} &nbsp;/&nbsp; VII
            </div>
          </div>
          <div className="page-num page-num-br">{11 + i}</div>
        </motion.section>
      ))}

      {/* ============ SPREAD 8 — PLATE V + CLOSING ============ */}
      <motion.section className="spread closing" {...turn}>
        <figure className="closing-plate">
          {photos[5] ? (
            <img src={photo(5)} alt="" />
          ) : photos[0] ? (
            <img src={photo(0)} alt="" />
          ) : null}
          <figcaption>
            PLATE V &nbsp;—&nbsp; <i>The cover, unedited.</i>
          </figcaption>
        </figure>

        <div className="closing-essay">
          <p>
            <span className="dropcap">A</span>
            nd that, for now, is the issue. May the year be generous. May the room keep turning a few
            degrees toward you. May this year be the doorway, not the room. Happy birthday, Simren —
            <span className="fin">&nbsp;FIN</span>
          </p>
        </div>
        <div className="page-num page-num-br">18</div>
      </motion.section>

      {/* ============ SPREAD 9 — COLOPHON ============ */}
      <motion.section className="spread colophon" {...turn}>
        <div className="colophon-inner">
          <div className="section-label centered">
            <span>COLOPHON</span>
            <i className="rule-accent center" />
          </div>
          <div className="colo-body">
            <p>This issue was set in Fraunces and Manrope.</p>
            <p>
              Printed for one reader, in an edition of one, on the fourteenth of May, two thousand and
              twenty-six.
            </p>
            <p>Publisher: Maison Cinq — a fictitious press.</p>
            <p>Editor-at-large: anonymous.</p>
            <p>Photography: from the personal archive.</p>
            <p>All errors, ours.</p>
          </div>
          <div className="colo-end">END OF ISSUE NO. 14</div>
          <div className="page-num roman">XVIII</div>
        </div>
      </motion.section>
    </div>
  );
}

/* ---------------- Cake illustration (SVG, no photo) ---------------- */
function CakeIllustration() {
  const candles = Array.from({ length: 23 });
  return (
    <svg
      viewBox="0 0 360 440"
      className="cake-svg"
      role="img"
      aria-label="Illustrated two-tier birthday cake with candles"
    >
      {/* Banner ribbon */}
      <g>
        <path
          d="M 30 60 L 330 60 L 320 84 L 330 108 L 30 108 L 40 84 Z"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.25"
        />
        <text
          x="180"
          y="92"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontSize="14"
          fontWeight="500"
          letterSpacing="4"
          fill="var(--accent)"
        >
          MAY · XIV · MMXXVI
        </text>
      </g>

      {/* Candles + flames */}
      <g transform="translate(0, 130)">
        {candles.map((_, i) => {
          const x = 60 + (i % 12) * 20;
          const y = i < 12 ? 0 : 14;
          return (
            <g key={i} transform={`translate(${x}, ${y})`}>
              {/* flame */}
              <path
                d="M 0 0 C -2.5 -3 -2.5 -7 0 -10 C 2.5 -7 2.5 -3 0 0 Z"
                fill="var(--accent)"
              />
              {/* wick */}
                <line x1="0" y1="0" x2="0" y2="3" stroke="var(--ink)" strokeWidth="0.6" />
              {/* candle body */}
              <line x1="0" y1="3" x2="0" y2="22" stroke="var(--ink)" strokeWidth="1.1" />
            </g>
          );
        })}
      </g>

      {/* Top tier */}
      <g>
        <rect
          x="80"
          y="170"
          width="200"
          height="80"
          fill="var(--cream)"
          stroke="var(--ink)"
          strokeWidth="1.1"
        />
        {/* drip line */}
        <path
          d="M 80 200 Q 105 215 130 200 T 180 200 T 230 200 T 280 200"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="0.9"
        />
        {/* accent band */}
        <line x1="80" y1="180" x2="280" y2="180" stroke="var(--accent)" strokeWidth="0.8" />
      </g>

      {/* Bottom tier */}
      <g>
        <rect
          x="40"
          y="260"
          width="280"
          height="120"
          fill="var(--cream)"
          stroke="var(--ink)"
          strokeWidth="1.1"
        />
        <path
          d="M 40 290 Q 75 308 110 290 T 180 290 T 250 290 T 320 290"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="0.9"
        />
        {/* small dots / piping */}
        {Array.from({ length: 11 }).map((_, i) => (
          <circle key={i} cx={56 + i * 26} cy={368} r="1.6" fill="var(--ink)" />
        ))}
      </g>

      {/* base plate */}
      <line x1="20" y1="395" x2="340" y2="395" stroke="var(--ink)" strokeWidth="1.1" />
      <line x1="60" y1="402" x2="300" y2="402" stroke="var(--sub)" strokeWidth="0.6" />

      {/* tiny "23" in lower right */}
      <text
        x="332"
        y="420"
        textAnchor="end"
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontSize="14"
        fill="var(--sub)"
      >
        no. 23
      </text>
    </svg>
  );
}

/* ---------------- CSS ---------------- */
const css = `
:root {
  --cream: #fafaf7;
  --ink: #15140f;
  --sub: #5a564c;
  --accent: #a8321a;
}

* { box-sizing: border-box; }

.spread {
  position: relative;
  width: 100%;
  padding: 56px 24px;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  transform-origin: left center;
  backface-visibility: hidden;
}
@media (min-width: 900px) {
  .spread { padding: 80px 80px; }
}

.section-label {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.36em;
  text-transform: uppercase;
  color: var(--sub);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.section-label.centered { align-items: center; }
.section-label.wish-label {
  position: absolute;
  top: 56px;
  left: 24px;
}
@media (min-width: 900px) {
  .section-label { font-size: 11px; letter-spacing: 0.4em; }
  .section-label.wish-label { top: 80px; left: 80px; }
}
.rule-accent {
  display: block;
  width: 24px;
  height: 1px;
  background: var(--accent);
}
.rule-accent.center { margin: 0 auto; }

.spread-headline {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(36px, 6vw, 64px);
  line-height: 1.04;
  letter-spacing: -0.022em;
  margin: 28px 0 36px;
  color: var(--ink);
  max-width: 18ch;
}

/* ============ COVER ============ */
.cover {
  padding: 0;
  overflow: hidden;
  min-height: 100svh;
  height: 100svh;
}
.cover-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.9) contrast(1.02);
  z-index: 0;
}
.cover-vignette {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom, rgba(21,20,15,0.18) 0%, rgba(21,20,15,0) 22%, rgba(21,20,15,0) 55%, rgba(21,20,15,0.45) 100%),
    linear-gradient(to right, rgba(21,20,15,0.25) 0%, rgba(21,20,15,0) 30%);
  z-index: 1;
  pointer-events: none;
}
.masthead {
  position: absolute;
  top: 18px;
  left: 0;
  right: 0;
  z-index: 3;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0 24px;
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #fafaf7;
  text-shadow: 0 1px 14px rgba(0,0,0,0.45);
  gap: 12px;
}
.mast-left { text-align: left; }
.mast-center { text-align: center; }
.mast-right { text-align: right; opacity: 0.85; }
@media (min-width: 900px) {
  .masthead { padding: 0 56px; top: 28px; font-size: 11px; letter-spacing: 0.36em; }
}

.cover-title {
  position: absolute;
  left: 24px;
  bottom: 96px;
  z-index: 4;
  margin: 0;
  font-family: var(--font-display);
  font-weight: 900;
  font-size: clamp(88px, 17vw, 220px);
  line-height: 0.84;
  letter-spacing: -0.045em;
  color: #fafaf7;
  text-shadow: 0 2px 30px rgba(0,0,0,0.35);
}
@media (min-width: 900px) {
  .cover-title { left: 56px; bottom: 120px; }
}
.cover-subtitle {
  position: absolute;
  left: 24px;
  bottom: 56px;
  z-index: 4;
  margin: 0;
  font-family: var(--font-display);
  font-weight: 300;
  font-style: italic;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fafaf7;
  max-width: 80%;
  text-shadow: 0 1px 12px rgba(0,0,0,0.45);
}
@media (min-width: 900px) {
  .cover-subtitle { left: 56px; bottom: 64px; font-size: 16px; letter-spacing: 0.08em; }
}

.coverline {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  text-shadow: 0 1px 10px rgba(0,0,0,0.55);
}
.coverline-tr { top: 70px; right: 24px; text-align: right; }
.coverline-br { bottom: 200px; right: 24px; text-align: right; }
@media (min-width: 900px) {
  .coverline-tr { top: 110px; right: 56px; font-size: 12px; }
  .coverline-br { bottom: 220px; right: 56px; font-size: 12px; }
}

.barcode-wrap {
  position: absolute;
  bottom: 16px;
  right: 24px;
  z-index: 4;
  background: var(--cream);
  padding: 8px 10px 6px;
}
@media (min-width: 900px) {
  .barcode-wrap { bottom: 28px; right: 56px; padding: 10px 12px 8px; }
}
.barcode {
  display: flex;
  align-items: stretch;
  height: 32px;
  gap: 1.5px;
}
.barcode span { display: block; height: 100%; }
.barcode-text {
  font-family: var(--font-body);
  font-size: 8px;
  letter-spacing: 0.18em;
  color: var(--ink);
  margin-top: 4px;
  text-align: center;
}

.page-num {
  position: absolute;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--sub);
  font-variant-numeric: tabular-nums;
}
.page-num.dark { color: #fafaf7; text-shadow: 0 1px 8px rgba(0,0,0,0.5); }
.page-num.roman { font-family: var(--font-display); font-style: italic; font-size: 13px; letter-spacing: 0.15em; margin-top: 32px; }
.page-num-bl { left: 24px; bottom: 18px; z-index: 5; }
.page-num-br { right: 24px; bottom: 18px; z-index: 5; }
@media (min-width: 900px) {
  .page-num-bl { left: 56px; bottom: 28px; font-size: 11px; }
  .page-num-br { right: 56px; bottom: 28px; font-size: 11px; }
}

/* ============ FOREWORD ============ */
.foreword-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 36px;
  margin-top: 12px;
  flex: 1;
}
@media (min-width: 900px) {
  .foreword-grid { grid-template-columns: 1.4fr 1fr; gap: 72px; align-items: start; }
}
.foreword-text p {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 16px;
  line-height: 1.62;
  letter-spacing: -0.005em;
  color: var(--ink);
  max-width: 60ch;
  margin: 0 0 20px;
}
@media (min-width: 900px) {
  .foreword-text p { font-size: 18px; line-height: 1.7; margin-bottom: 24px; }
}
.dropcap {
  font-family: var(--font-display);
  font-weight: 900;
  color: var(--accent);
  float: left;
  font-size: 64px;
  line-height: 0.85;
  padding: 4px 12px 0 0;
  margin-top: 4px;
}
@media (min-width: 900px) {
  .dropcap { font-size: 96px; padding-right: 14px; }
}
.foreword-plate {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.foreword-plate img {
  width: 100%;
  height: auto;
  max-height: 70vh;
  object-fit: cover;
  display: block;
  outline: 1px solid rgba(21,20,15,0.08);
  outline-offset: 0;
}
.foreword-plate figcaption {
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--sub);
}

/* ============ PLATE FULL ============ */
.plate-full {
  padding: 0;
  min-height: 100svh;
  overflow: hidden;
}
.plate-fullbleed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.92);
}
.plate-full-caption {
  position: absolute;
  left: 24px;
  bottom: 56px;
  z-index: 2;
  background: var(--cream);
  padding: 14px 18px;
  max-width: 380px;
}
@media (min-width: 900px) {
  .plate-full-caption { left: 56px; bottom: 72px; padding: 18px 22px; max-width: 440px; }
}
.plate-numeral {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.36em;
  color: var(--accent);
  text-transform: uppercase;
}
.plate-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 22px;
  margin-top: 6px;
  color: var(--ink);
  line-height: 1.2;
}
.plate-line {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--sub);
  margin-top: 8px;
  letter-spacing: 0.02em;
  line-height: 1.55;
}

/* ============ PLATE SPLIT ============ */
.plate-split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 36px;
  padding: 56px 24px;
}
@media (min-width: 900px) {
  .plate-split { grid-template-columns: 1.5fr 1fr; gap: 64px; padding: 80px 80px; align-items: center; }
}
.split-photo { display: flex; flex-direction: column; gap: 10px; }
.split-photo img {
  width: 100%;
  height: auto;
  max-height: 80vh;
  object-fit: cover;
  outline: 1px solid rgba(21,20,15,0.08);
}
.split-caption {
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--sub);
}
.split-text { display: flex; flex-direction: column; gap: 18px; }
.split-head {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(28px, 3.2vw, 40px);
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 8px 0;
  color: var(--ink);
  max-width: 22ch;
}
.split-text p {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink);
  margin: 0;
  max-width: 50ch;
}
@media (min-width: 900px) {
  .split-text p { font-size: 17px; }
}

/* ============ CENTERFOLD ============ */
.centerfold {
  display: grid;
  grid-template-columns: 1fr;
  gap: 36px;
  align-items: center;
  position: relative;
}
@media (min-width: 900px) {
  .centerfold { grid-template-columns: 1fr 1fr; gap: 72px; padding: 96px 80px; }
}
.spine {
  display: none;
}
@media (min-width: 900px) {
  .spine {
    display: block;
    position: absolute;
    top: 80px;
    bottom: 80px;
    left: 50%;
    width: 1px;
    background: rgba(90, 86, 76, 0.4);
    z-index: 0;
  }
}
.center-left { display: flex; flex-direction: column; gap: 20px; z-index: 1; }
.center-right { display: flex; align-items: center; justify-content: center; z-index: 1; }
.center-blurb {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink);
  max-width: 42ch;
  margin: 0;
}
.cake-svg {
  width: 100%;
  max-width: 360px;
  height: auto;
  display: block;
}

/* ============ PLATE TWO-COL ============ */
.plate-twocol {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
}
@media (min-width: 900px) {
  .plate-twocol { grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; padding: 80px 80px; }
}
.twocol-photo img {
  width: 100%;
  height: auto;
  max-height: 80vh;
  object-fit: cover;
  outline: 1px solid rgba(21,20,15,0.08);
}
.twocol-text { display: flex; flex-direction: column; gap: 14px; }
.twocol-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.18;
  letter-spacing: -0.018em;
  margin: 4px 0 8px;
  color: var(--ink);
}
.twocol-text p {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink);
  max-width: 50ch;
  margin: 0;
}

/* ============ WISH ============ */
.wish {
  min-height: 85svh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wish-block {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 22px;
  max-width: 980px;
  margin: 0 auto;
  padding: 24px 8px;
}
.wish-rule {
  width: 1px;
  align-self: stretch;
  background: var(--sub);
  flex-shrink: 0;
  opacity: 0.7;
}
.wish-quote {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(26px, 3.6vw, 56px);
  line-height: 1.22;
  letter-spacing: -0.022em;
  color: var(--ink);
  margin: 0;
  max-width: 22ch;
}
.wish-meta {
  position: absolute;
  bottom: -8px;
  left: 44px;
  font-family: var(--font-body);
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: var(--sub);
  text-transform: uppercase;
}

/* ============ CLOSING ============ */
.closing {
  display: grid;
  grid-template-columns: 1fr;
  gap: 36px;
}
@media (min-width: 900px) {
  .closing { grid-template-columns: 1.1fr 1fr; gap: 72px; align-items: center; padding: 96px 80px; }
}
.closing-plate { margin: 0; display: flex; flex-direction: column; gap: 10px; }
.closing-plate img {
  width: 100%;
  height: auto;
  max-height: 75vh;
  object-fit: cover;
  outline: 1px solid rgba(21,20,15,0.08);
}
.closing-plate figcaption {
  font-family: var(--font-body);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--sub);
}
.closing-essay p {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.7;
  color: var(--ink);
  max-width: 48ch;
  margin: 0;
}
.fin {
  font-family: var(--font-display);
  font-weight: 700;
  font-style: italic;
  color: var(--accent);
  letter-spacing: 0.08em;
}

/* ============ COLOPHON ============ */
.colophon {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 100svh;
  padding: 80px 24px;
}
.colophon-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  max-width: 520px;
  margin: auto;
}
.colo-body p {
  font-family: var(--font-body);
  font-weight: 300;
  font-size: 13px;
  line-height: 1.85;
  letter-spacing: 0.03em;
  color: var(--sub);
  margin: 0 0 6px;
}
.colo-end {
  font-family: var(--font-display);
  font-weight: 500;
  letter-spacing: 0.32em;
  font-size: 14px;
  color: var(--ink);
  margin-top: 8px;
  text-transform: uppercase;
}
`;
