import type { Metadata } from "next";
import Link from "next/link";

/* Gallery hub — lists every birthday-page variant for Simren.
 *
 * Each variant lives at /birthday/simren/<slug> and is its own
 * self-contained experience. Add a new entry here when a variant
 * ships. Variants marked `live: false` show as "in progress".
 */

export const metadata: Metadata = {
  title: "Happy Birthday, Simren",
  description: "Pick a feeling.",
  robots: { index: false, follow: false },
};

type Variant = {
  slug: string;
  name: string;
  tagline: string;
  mode: "dark" | "light";
  accent: string; // gradient css for the card
  live: boolean;
};

const VARIANTS: Variant[] = [
  {
    slug: "letter",
    name: "Letter",
    tagline: "A folded letter, sealed in wax.",
    mode: "light",
    accent: "linear-gradient(135deg, #f6efe2, #e8d5b5, #b85042)",
    live: true,
  },
  {
    slug: "magazine",
    name: "Magazine",
    tagline: "An issue made for one reader.",
    mode: "light",
    accent: "linear-gradient(135deg, #fafaf7, #e8e6e1, #1a1a1a)",
    live: true,
  },
  {
    slug: "constellation",
    name: "Constellation",
    tagline: "A celestial chart of you.",
    mode: "dark",
    accent: "linear-gradient(135deg, #050a1a, #0a1428, #d4a949)",
    live: true,
  },
  {
    slug: "garden",
    name: "Garden",
    tagline: "Pastel blooms on a quiet afternoon.",
    mode: "light",
    accent: "linear-gradient(135deg, #f4ead8, #d9c8b3, #c9a382)",
    live: true,
  },
  {
    slug: "atelier",
    name: "Atelier",
    tagline: "A mood board, pinned with care.",
    mode: "light",
    accent: "linear-gradient(135deg, #f4ead8, #d4b896, #b8923f)",
    live: true,
  },
  {
    slug: "lantern",
    name: "Lantern",
    tagline: "Floating lights, each carrying you.",
    mode: "dark",
    accent: "linear-gradient(135deg, #0a0610, #1a0e1f, #ffb56b)",
    live: true,
  },
];

export default function Page() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        overflowY: "auto",
        background: "linear-gradient(180deg, #0a0612 0%, #1a0f2e 100%)",
        color: "#f5e9d4",
        fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "80px 24px 120px",
        }}
      >
        <header style={{ textAlign: "center", marginBottom: 80 }}>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: "rgba(245,233,212,0.5)",
              margin: "0 0 16px 0",
            }}
          >
            May 14, 2026
          </p>
          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 64px)",
              fontWeight: 300,
              fontStyle: "italic",
              margin: 0,
              lineHeight: 1.1,
              background:
                "linear-gradient(135deg, #ffd89b 0%, #ff9a76 50%, #ff7eb3 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Happy Birthday, Simren
          </h1>
          <p
            style={{
              marginTop: 28,
              fontSize: 16,
              color: "rgba(245,233,212,0.7)",
              fontStyle: "italic",
              maxWidth: 480,
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.6,
            }}
          >
            Pick a feeling. Each one&apos;s a different kind of small thing
            for a big day.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 24,
          }}
        >
          {VARIANTS.map((v) => {
            const isLight = v.mode === "light";
            return (
              <Link
                key={v.slug}
                href={v.live ? `/birthday/simren/${v.slug}` : "#"}
                aria-disabled={!v.live}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  opacity: v.live ? 1 : 0.4,
                  pointerEvents: v.live ? "auto" : "none",
                  borderRadius: 16,
                  overflow: "hidden",
                  background: v.accent,
                  border: "1px solid rgba(255,255,255,0.08)",
                  transition: "transform 200ms ease, box-shadow 200ms ease",
                  position: "relative",
                  aspectRatio: "3 / 4",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
                }}
                className="variant-card"
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background: isLight
                      ? "linear-gradient(180deg, transparent 50%, rgba(255,255,255,0.5) 100%)"
                      : "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.5) 100%)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.3em",
                      textTransform: "uppercase",
                      color: isLight
                        ? "rgba(0,0,0,0.55)"
                        : "rgba(255,255,255,0.6)",
                      fontWeight: 500,
                    }}
                  >
                    {v.mode} · {v.live ? "live" : "soon"}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 300,
                        fontStyle: "italic",
                        color: isLight ? "#1a1a1a" : "#fff",
                        marginBottom: 6,
                      }}
                    >
                      {v.name}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: isLight
                          ? "rgba(0,0,0,0.65)"
                          : "rgba(255,255,255,0.75)",
                        lineHeight: 1.45,
                      }}
                    >
                      {v.tagline}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <p
          style={{
            marginTop: 80,
            textAlign: "center",
            fontSize: 12,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(245,233,212,0.4)",
          }}
        >
          made with care · toshare.net
        </p>
      </div>

      <style>{`
        .variant-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }
      `}</style>
    </div>
  );
}
