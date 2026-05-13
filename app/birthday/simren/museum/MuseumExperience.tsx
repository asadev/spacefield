"use client";

import { Fraunces, Inter_Tight } from "next/font/google";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

const PAPER = "#fafaf7";
const INK = "#111111";
const RULE = "#1a1a1a";
const MUTE = "#6b6b66";
const HAIR = "#d8d6cf";

type Plate = {
  no: string;
  title: string;
  caption: string;
  medium: string;
};

const PLATES: Plate[] = [
  { no: "I",    title: "Untitled",                  caption: "Studio portrait, c. 2025",         medium: "Digital photograph" },
  { no: "II",   title: "Afternoon, Interior",       caption: "Available light, undated",          medium: "Digital photograph" },
  { no: "III",  title: "A Quiet Likeness",          caption: "Private collection, 2024",          medium: "Digital photograph" },
  { no: "IV",   title: "Study in Composure",        caption: "From the personal archive",         medium: "Digital photograph" },
  { no: "V",    title: "Figure, Seated",            caption: "Unknown date",                       medium: "Digital photograph" },
  { no: "VI",   title: "On Looking",                caption: "Documented 2025",                    medium: "Digital photograph" },
  { no: "VII",  title: "Self, In Passing",          caption: "From a series in progress",          medium: "Digital photograph" },
  { no: "VIII", title: "Portrait, Three-Quarter",   caption: "Collected 2026",                     medium: "Digital photograph" },
  { no: "IX",   title: "Untitled (Centerfold)",     caption: "Print, edition of one",              medium: "Digital photograph" },
];

const WISHES = [
  "May the year arrive the way good light does — quietly, and on its own schedule.",
  "May the rooms you walk into already feel like yours.",
  "May your softness never be mistaken for smallness.",
  "May the people who love you say so out loud, and often.",
  "May the work you make this year outlast the moods that made it.",
  "May rest find you before exhaustion has to ask for it.",
  "May twenty-six be a long, slow exhale you didn't know you'd been holding.",
];

const SECTIONS = [
  { id: "cover",     label: "Cover" },
  { id: "colophon",  label: "Colophon" },
  { id: "contents",  label: "Contents" },
  { id: "foreword",  label: "Foreword" },
  { id: "plates",    label: "Plates" },
  { id: "centerfold",label: "Centerfold" },
  { id: "captions",  label: "Wall Texts" },
  { id: "cake",      label: "An Object" },
  { id: "afterword", label: "Afterword" },
  { id: "imprint",   label: "Imprint" },
];

export default function MuseumExperience({ photos }: { photos: string[] }) {
  const reduce = useReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const pics = useMemo(() => {
    if (photos.length === 0) return [];
    const out: string[] = [];
    for (let i = 0; i < PLATES.length; i++) out.push(photos[i % photos.length]);
    return out;
  }, [photos]);

  const centerfold = pics[0] ?? null;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`#${id}`);
    if (el && scrollerRef.current) {
      scrollerRef.current.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
    }
  };

  const fade = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div
      ref={scrollerRef}
      className={`${display.className}`}
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background: PAPER,
        color: INK,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      {/* Top hairline + reading progress */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: HAIR,
          zIndex: 50,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: 1,
          width: `${progress * 100}%`,
          background: INK,
          zIndex: 51,
          transition: "width 120ms linear",
        }}
      />

      {/* Folio: top-left masthead + top-right gallery */}
      <div
        className={sans.className}
        style={{
          position: "fixed",
          top: 14,
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: MUTE,
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        <span>The Simren Zahra Retrospective</span>
        <span>Gallery&nbsp;I &nbsp;·&nbsp; Vol. XXVI</span>
      </div>

      <Style />

      <main style={{ paddingTop: 60, paddingBottom: 120 }}>
        {/* ============== COVER ============== */}
        <Section id="cover" page="i">
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "10vh 24px 8vh" }}>
            <Eyebrow>An Exhibition Catalog</Eyebrow>
            <motion.h1
              {...fade}
              style={{
                fontFamily: display.style.fontFamily,
                fontWeight: 300,
                fontSize: "clamp(56px, 12vw, 168px)",
                lineHeight: 0.92,
                letterSpacing: "-0.03em",
                marginTop: 28,
                marginBottom: 0,
              }}
            >
              Simren
              <br />
              <em style={{ fontStyle: "italic", fontWeight: 400 }}>Zahra</em>
            </motion.h1>

            <motion.div
              {...fade}
              style={{
                marginTop: 56,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 16,
              }}
            >
              <Hairline />
              <span
                className={sans.className}
                style={{
                  fontSize: 11,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: INK,
                }}
              >
                A Retrospective &nbsp;·&nbsp; 14 May 2026
              </span>
              <Hairline />
            </motion.div>

            <motion.p
              {...fade}
              style={{
                marginTop: 64,
                fontSize: 15,
                lineHeight: 1.7,
                color: MUTE,
                maxWidth: 480,
                marginInline: "auto",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              On the occasion of her birthday, a small exhibition of pictures, of
              sentences, of one or two quiet objects.
            </motion.p>
          </div>
        </Section>

        {/* ============== COLOPHON ============== */}
        <Section id="colophon" page="ii">
          <Spread>
            <div>
              <Eyebrow>Colophon</Eyebrow>
              <p style={paraStyle}>
                This catalog accompanies a one-day exhibition mounted on the
                fourteenth of May, two thousand and twenty-six, in honor of its
                subject. The works gathered here have been selected without
                ceremony and presented without correction. No piece is for sale.
              </p>
              <p style={{ ...paraStyle, marginTop: 18 }}>
                Texts have been set in Fraunces; small capitals in Inter Tight.
                The paper, were there paper, would be uncoated and slightly
                warm. The light, in the room, would be northern and patient.
              </p>
            </div>
            <div>
              <Eyebrow>Subject</Eyebrow>
              <DefList
                rows={[
                  ["Name", "Simren Zahra"],
                  ["Occasion", "Twenty-sixth year"],
                  ["Date of opening", "14 May 2026"],
                  ["Hours", "All of them"],
                  ["Admission", "By affection"],
                  ["Catalog no.", "SZ-2026-01"],
                ]}
              />
            </div>
          </Spread>
        </Section>

        {/* ============== CONTENTS ============== */}
        <Section id="contents" page="iii">
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Contents</Eyebrow>
            <motion.div {...fade} style={{ marginTop: 48 }}>
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={sans.className}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: 0,
                    borderBottom: `1px solid ${HAIR}`,
                    padding: "18px 0",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr auto",
                    alignItems: "baseline",
                    gap: 16,
                    cursor: "pointer",
                    color: INK,
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 11, color: MUTE, letterSpacing: "0.1em" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: display.style.fontFamily,
                      fontSize: 22,
                      fontWeight: 400,
                    }}
                  >
                    {s.label}
                  </span>
                  <span style={{ fontSize: 11, color: MUTE, letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    p.&nbsp;{romanize(i + 1)}
                  </span>
                </button>
              ))}
            </motion.div>
          </div>
        </Section>

        {/* ============== FOREWORD ============== */}
        <Section id="foreword" page="iv">
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Foreword</Eyebrow>
            <motion.p
              {...fade}
              style={{
                marginTop: 56,
                fontSize: "clamp(22px, 3.4vw, 34px)",
                lineHeight: 1.4,
                fontWeight: 300,
                letterSpacing: "-0.005em",
              }}
            >
              <DropCap>T</DropCap>here are people who arrive into a room and
              rearrange it without lifting a thing. The catalog you are
              holding — for it is, in spirit, a thing one holds — is dedicated
              to one of them.
            </motion.p>

            <motion.p
              {...fade}
              style={{
                marginTop: 28,
                fontSize: 17,
                lineHeight: 1.75,
                color: "#2a2a26",
              }}
            >
              The exhibition is small on purpose. Nine plates, seven sentences,
              one object. The intention is not to summarize a life — that would
              be impertinent at twenty-six — but to mark a date with the
              attention it deserves. Stand close. Read slowly. Notice what
              repeats.
            </motion.p>

            <motion.p
              {...fade}
              className={sans.className}
              style={{
                marginTop: 40,
                fontSize: 11,
                letterSpacing: "0.24em",
                textTransform: "uppercase",
                color: MUTE,
              }}
            >
              — The Curator
            </motion.p>
          </div>
        </Section>

        {/* ============== PLATES ============== */}
        <section id="plates" style={{ padding: "120px 0 40px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Plates · I — VIII</Eyebrow>
            <motion.h2
              {...fade}
              style={{
                marginTop: 24,
                marginBottom: 0,
                fontSize: "clamp(34px, 5.5vw, 56px)",
                fontWeight: 300,
                fontStyle: "italic",
                letterSpacing: "-0.02em",
                textAlign: "center",
                lineHeight: 1.05,
              }}
            >
              The Gallery
            </motion.h2>
            <motion.p
              {...fade}
              style={{
                marginTop: 18,
                textAlign: "center",
                color: MUTE,
                fontSize: 14,
                fontStyle: "italic",
              }}
            >
              Selected pictures, hung in sequence, with wall texts opposite.
            </motion.p>
          </div>

          <div
            style={{
              maxWidth: 1100,
              margin: "80px auto 0",
              padding: "0 24px",
              display: "grid",
              gap: "min(14vw, 140px)",
            }}
          >
            {PLATES.slice(0, 8).map((plate, i) => {
              const src = pics[i];
              const flip = i % 2 === 1;
              return (
                <motion.figure
                  key={plate.no}
                  {...fade}
                  style={{
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr)",
                    gap: 20,
                  }}
                >
                  <div
                    className="plate-row"
                    style={{
                      display: "grid",
                      gap: 28,
                      alignItems: "start",
                    }}
                  >
                    <div
                      style={{
                        order: flip ? 2 : 1,
                        background: "#ffffff",
                        padding: 14,
                        boxShadow:
                          "0 1px 0 rgba(0,0,0,0.04), 0 24px 60px -28px rgba(0,0,0,0.18)",
                      }}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={`${plate.title} — Plate ${plate.no}`}
                          loading="lazy"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "auto",
                            filter: "saturate(0.92) contrast(1.02)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            aspectRatio: "4 / 5",
                            background: "#f0efe9",
                            display: "grid",
                            placeItems: "center",
                            color: MUTE,
                            fontStyle: "italic",
                            fontSize: 13,
                          }}
                        >
                          [ image not on view ]
                        </div>
                      )}
                    </div>

                    <figcaption
                      style={{
                        order: flip ? 1 : 2,
                        alignSelf: "end",
                        paddingTop: 8,
                        borderTop: `1px solid ${HAIR}`,
                      }}
                    >
                      <div
                        className={sans.className}
                        style={{
                          fontSize: 10,
                          letterSpacing: "0.3em",
                          textTransform: "uppercase",
                          color: MUTE,
                          marginBottom: 14,
                        }}
                      >
                        Plate&nbsp;{plate.no}
                      </div>
                      <div
                        style={{
                          fontSize: 22,
                          fontStyle: "italic",
                          fontWeight: 400,
                          lineHeight: 1.25,
                        }}
                      >
                        {plate.title}
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 13,
                          color: MUTE,
                          lineHeight: 1.6,
                        }}
                      >
                        {plate.caption}
                        <br />
                        {plate.medium}.
                      </div>
                    </figcaption>
                  </div>
                </motion.figure>
              );
            })}
          </div>
        </section>

        {/* ============== CENTERFOLD ============== */}
        <section
          id="centerfold"
          style={{
            padding: "140px 0 120px",
            background: "#f3f1ea",
            borderTop: `1px solid ${HAIR}`,
            borderBottom: `1px solid ${HAIR}`,
            marginTop: 100,
          }}
        >
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Plate IX · Centerfold</Eyebrow>
            <motion.div
              {...fade}
              style={{
                marginTop: 60,
                background: "#ffffff",
                padding: "min(3vw, 28px)",
                boxShadow:
                  "0 2px 0 rgba(0,0,0,0.04), 0 60px 120px -40px rgba(0,0,0,0.22)",
              }}
            >
              {centerfold ? (
                <img
                  src={centerfold}
                  alt="Plate IX — Untitled (Centerfold)"
                  style={{
                    display: "block",
                    width: "100%",
                    maxHeight: "82vh",
                    height: "auto",
                    objectFit: "contain",
                    margin: "0 auto",
                    filter: "saturate(0.92) contrast(1.02)",
                  }}
                />
              ) : (
                <div
                  style={{
                    aspectRatio: "3 / 4",
                    background: "#f0efe9",
                    display: "grid",
                    placeItems: "center",
                    color: MUTE,
                    fontStyle: "italic",
                  }}
                >
                  [ centerfold not on view ]
                </div>
              )}
              <figcaption
                style={{
                  marginTop: 22,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "baseline",
                  gap: 16,
                  borderTop: `1px solid ${HAIR}`,
                  paddingTop: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 22,
                      fontStyle: "italic",
                      fontWeight: 400,
                    }}
                  >
                    Untitled (Centerfold)
                  </div>
                  <div style={{ fontSize: 13, color: MUTE, marginTop: 6 }}>
                    Print, edition of one. Lent by the artist's life.
                  </div>
                </div>
                <div
                  className={sans.className}
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: MUTE,
                  }}
                >
                  Plate IX
                </div>
              </figcaption>
            </motion.div>
          </div>
        </section>

        {/* ============== WALL TEXTS / WISHES ============== */}
        <section id="captions" style={{ padding: "140px 0 80px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Wall Texts</Eyebrow>
            <motion.h2
              {...fade}
              style={{
                marginTop: 24,
                fontSize: "clamp(34px, 5.5vw, 56px)",
                fontWeight: 300,
                fontStyle: "italic",
                letterSpacing: "-0.02em",
                textAlign: "center",
                lineHeight: 1.05,
              }}
            >
              Seven wishes, hung at eye level.
            </motion.h2>
          </div>

          <div
            style={{
              maxWidth: 820,
              margin: "80px auto 0",
              padding: "0 24px",
              display: "grid",
              gap: 64,
            }}
          >
            {WISHES.map((w, i) => (
              <motion.blockquote
                key={i}
                {...fade}
                style={{
                  margin: 0,
                  paddingLeft: 28,
                  borderLeft: `1px solid ${RULE}`,
                  display: "grid",
                  gap: 14,
                }}
              >
                <span
                  className={sans.className}
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: MUTE,
                  }}
                >
                  Wall Text · No.&nbsp;{romanize(i + 1)}
                </span>
                <p
                  style={{
                    margin: 0,
                    fontSize: "clamp(22px, 3.2vw, 30px)",
                    lineHeight: 1.45,
                    fontStyle: "italic",
                    fontWeight: 300,
                    letterSpacing: "-0.005em",
                    color: INK,
                  }}
                >
                  &ldquo;{w}&rdquo;
                </p>
              </motion.blockquote>
            ))}
          </div>
        </section>

        {/* ============== AN OBJECT (the cake, minimized) ============== */}
        <section id="cake" style={{ padding: "120px 0" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px", textAlign: "center" }}>
            <Eyebrow center>One Object</Eyebrow>
            <motion.h2
              {...fade}
              style={{
                marginTop: 24,
                fontSize: "clamp(32px, 5vw, 50px)",
                fontWeight: 300,
                fontStyle: "italic",
                letterSpacing: "-0.02em",
              }}
            >
              A small cake, drawn from memory.
            </motion.h2>

            <motion.div {...fade} style={{ marginTop: 56, display: "grid", placeItems: "center" }}>
              <CakeLineDrawing />
            </motion.div>

            <motion.p
              {...fade}
              style={{
                marginTop: 36,
                fontSize: 14,
                lineHeight: 1.7,
                color: MUTE,
                fontStyle: "italic",
              }}
            >
              Object, no. SZ-09. Graphite on warm paper. <br />
              Two layers, one candle, plenty of room for a wish.
            </motion.p>
          </div>
        </section>

        {/* ============== AFTERWORD ============== */}
        <section id="afterword" style={{ padding: "100px 0 60px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 24px" }}>
            <Eyebrow center>Afterword</Eyebrow>
            <motion.p
              {...fade}
              style={{
                marginTop: 48,
                fontSize: "clamp(22px, 3.2vw, 30px)",
                lineHeight: 1.45,
                fontWeight: 300,
                fontStyle: "italic",
                textAlign: "center",
                letterSpacing: "-0.005em",
              }}
            >
              The exhibition closes when you do, Simren.
              <br />
              Until then — happy birthday, with great care.
            </motion.p>

            <motion.div
              {...fade}
              style={{
                marginTop: 56,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 14,
              }}
            >
              <Hairline width={56} />
              <span
                className={sans.className}
                style={{
                  fontSize: 10,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: MUTE,
                }}
              >
                Fin
              </span>
              <Hairline width={56} />
            </motion.div>
          </div>
        </section>

        {/* ============== IMPRINT ============== */}
        <section
          id="imprint"
          className={sans.className}
          style={{
            padding: "60px 24px 40px",
            borderTop: `1px solid ${HAIR}`,
            color: MUTE,
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            display: "flex",
            justifyContent: "space-between",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <span>Catalog SZ-2026-01</span>
          <span>Edition of one</span>
          <span>14 · V · MMXXVI</span>
        </section>
      </main>

      {/* Bottom-left page number stays visible */}
      <div
        aria-hidden
        className={sans.className}
        style={{
          position: "fixed",
          bottom: 16,
          left: 20,
          fontSize: 10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: MUTE,
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        SZ · 2026
      </div>
      <div
        aria-hidden
        className={sans.className}
        style={{
          position: "fixed",
          bottom: 16,
          right: 20,
          fontSize: 10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: MUTE,
          zIndex: 40,
          pointerEvents: "none",
        }}
      >
        {Math.round(progress * 100)
          .toString()
          .padStart(2, "0")}
        &nbsp;/&nbsp;100
      </div>
    </div>
  );
}

/* ============== HELPERS ============== */

function Section({
  id,
  page,
  children,
}: {
  id: string;
  page: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ position: "relative", padding: "80px 0" }}>
      <div
        aria-hidden
        className="folio-page"
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          fontSize: 10,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: MUTE,
        }}
      >
        Page&nbsp;{page}
      </div>
      {children}
    </section>
  );
}

function Eyebrow({
  children,
  center = false,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: center ? "center" : "flex-start",
        gap: 14,
      }}
    >
      <Hairline width={28} />
      <span
        style={{
          fontFamily:
            "InterTight, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize: 10,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: INK,
        }}
      >
        {children}
      </span>
      <Hairline width={28} />
    </div>
  );
}

function Hairline({ width }: { width?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        height: 1,
        width: width ?? "100%",
        background: RULE,
        opacity: 0.7,
      }}
    />
  );
}

function DropCap({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        float: "left",
        fontSize: "clamp(56px, 9vw, 92px)",
        lineHeight: 0.85,
        paddingRight: 12,
        paddingTop: 6,
        fontWeight: 400,
        fontStyle: "normal",
        color: INK,
      }}
    >
      {children}
    </span>
  );
}

function DefList({ rows }: { rows: [string, string][] }) {
  return (
    <dl
      style={{
        marginTop: 12,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: 24,
        rowGap: 10,
        fontSize: 14,
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt
            style={{
              fontFamily:
                "InterTight, ui-sans-serif, system-ui, -apple-system, sans-serif",
              fontSize: 10,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: MUTE,
              paddingTop: 4,
              borderTop: `1px solid ${HAIR}`,
            }}
          >
            {k}
          </dt>
          <dd
            style={{
              margin: 0,
              paddingTop: 4,
              borderTop: `1px solid ${HAIR}`,
              fontStyle: "italic",
            }}
          >
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Spread({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="spread"
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: "0 24px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 64,
      }}
    >
      {children}
    </div>
  );
}

const paraStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: 16,
  lineHeight: 1.75,
  color: "#2a2a26",
};

function CakeLineDrawing() {
  return (
    <svg
      width="200"
      height="170"
      viewBox="0 0 200 170"
      fill="none"
      stroke={INK}
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ opacity: 0.85 }}
    >
      {/* candle flame */}
      <path d="M100 10 C 96 18, 96 24, 100 28 C 104 24, 104 18, 100 10 Z" />
      {/* candle */}
      <line x1="100" y1="30" x2="100" y2="56" />
      {/* top tier */}
      <rect x="68" y="56" width="64" height="34" rx="2" />
      {/* drips top */}
      <path d="M72 90 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0 q 6 8 12 0" />
      {/* bottom tier */}
      <rect x="44" y="98" width="112" height="46" rx="2" />
      {/* drips bottom */}
      <path d="M48 144 q 8 10 16 0 q 8 10 16 0 q 8 10 16 0 q 8 10 16 0 q 8 10 16 0 q 8 10 16 0 q 8 10 16 0" />
      {/* plate */}
      <line x1="30" y1="156" x2="170" y2="156" />
      <line x1="36" y1="160" x2="164" y2="160" strokeOpacity="0.5" />
    </svg>
  );
}

function romanize(n: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

function Style() {
  return (
    <style>{`
      ::selection { background: #111; color: #fafaf7; }
      @media (max-width: 740px) {
        .spread { grid-template-columns: 1fr !important; gap: 48px !important; }
        .plate-row { grid-template-columns: 1fr !important; }
        .plate-row > *:first-child { order: 1 !important; }
        .plate-row > *:last-child { order: 2 !important; }
      }
      @media (min-width: 741px) {
        .plate-row { grid-template-columns: 1.4fr 1fr !important; gap: 48px !important; }
      }
    `}</style>
  );
}
