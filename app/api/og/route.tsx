/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/**
 * Dynamic Open Graph image generator.
 *
 * Renders a 1200x630 branded preview image at the edge. Reads query params:
 *   - type:     default | tool | region | blog | broker | network
 *   - title:    main heading
 *   - subtitle: secondary line
 *   - region:   region code (drives flag + footer label)
 *   - accent:   violet | emerald | purple | blue | rose | amber
 *   - author:   optional byline (blog)
 *   - date:     optional ISO date (blog)
 *
 * Uses system-ish fonts (no @vercel/og font bundling — keeps edge cold start fast
 * and bundle small). Dark background, subtle grid overlay, L-shaped corner
 * accents to match the site aesthetic.
 */

export const runtime = "edge";
export const revalidate = 86400;

const WIDTH = 1200;
const HEIGHT = 630;

type Accent = "violet" | "emerald" | "purple" | "blue" | "rose" | "amber";

const ACCENT: Record<Accent, { solid: string; glow: string; soft: string }> = {
  violet: { solid: "#a78bfa", glow: "rgba(167, 139, 250, 0.18)", soft: "rgba(167, 139, 250, 0.35)" },
  purple: { solid: "#c084fc", glow: "rgba(192, 132, 252, 0.18)", soft: "rgba(192, 132, 252, 0.35)" },
  emerald: { solid: "#34d399", glow: "rgba(52, 211, 153, 0.18)", soft: "rgba(52, 211, 153, 0.35)" },
  blue: { solid: "#60a5fa", glow: "rgba(96, 165, 250, 0.18)", soft: "rgba(96, 165, 250, 0.35)" },
  rose: { solid: "#fb7185", glow: "rgba(251, 113, 133, 0.18)", soft: "rgba(251, 113, 133, 0.35)" },
  amber: { solid: "#fbbf24", glow: "rgba(251, 191, 36, 0.18)", soft: "rgba(251, 191, 36, 0.35)" },
};

type OgType = "default" | "tool" | "region" | "blog" | "broker" | "network";

const TYPE_LABEL: Record<OgType, string> = {
  default: "Platform",
  tool: "Tool",
  region: "Region",
  blog: "Insights",
  broker: "Broker",
  network: "Network",
};

const REGION_FLAGS: Record<string, string> = {
  uae: "🇦🇪",
  uk: "🇬🇧",
  usa: "🇺🇸",
  monaco: "🇲🇨",
  tokyo: "🇯🇵",
  singapore: "🇸🇬",
  spain: "🇪🇸",
  portugal: "🇵🇹",
  turkey: "🇹🇷",
  saudi: "🇸🇦",
};

const REGION_NAMES: Record<string, string> = {
  uae: "UAE",
  uk: "United Kingdom",
  usa: "United States",
  monaco: "Monaco",
  tokyo: "Japan",
  singapore: "Singapore",
  spain: "Spain",
  portugal: "Portugal",
  turkey: "Türkiye",
  saudi: "Saudi Arabia",
};

function asAccent(v: string | null): Accent {
  const allowed: Accent[] = ["violet", "emerald", "purple", "blue", "rose", "amber"];
  return (allowed.includes(v as Accent) ? (v as Accent) : "violet");
}

function asType(v: string | null): OgType {
  const allowed: OgType[] = ["default", "tool", "region", "blog", "broker", "network"];
  return (allowed.includes(v as OgType) ? (v as OgType) : "default");
}

function sizeForTitle(title: string): number {
  // Larger for short titles, smaller for long.
  if (title.length <= 22) return 88;
  if (title.length <= 40) return 72;
  if (title.length <= 60) return 60;
  if (title.length <= 80) return 52;
  return 44;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const type = asType(searchParams.get("type"));
  const accentKey = asAccent(searchParams.get("accent"));
  const accent = ACCENT[accentKey];

  const title = searchParams.get("title") || "example.com";
  const subtitle = searchParams.get("subtitle") || "Real Estate Intelligence";
  const region = searchParams.get("region") || "";
  const author = searchParams.get("author") || "";
  const date = searchParams.get("date") || "";

  const sectionLabel = TYPE_LABEL[type];
  const flag = REGION_FLAGS[region] || "";
  const regionName = REGION_NAMES[region] || "";
  const titleSize = sizeForTitle(title);

  // Dot-grid SVG background: subtle, matches the site's InteractiveGrid aesthetic.
  const gridUrl =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='1' cy='1' r='1' fill='rgba(255,255,255,0.06)'/></svg>`
    );

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "#0a0a0a",
          fontFamily:
            '"Inter", "Helvetica Neue", Arial, system-ui, -apple-system, "Segoe UI", sans-serif',
          color: "#f5f5f5",
          padding: "56px 64px",
        }}
      >
        {/* Background dotted grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${gridUrl}")`,
            backgroundSize: "40px 40px",
            opacity: 1,
          }}
        />
        {/* Accent top rule */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: accent.solid,
            opacity: 0.55,
          }}
        />
        {/* Accent glow bottom-right corner */}
        <div
          style={{
            position: "absolute",
            right: -180,
            bottom: -180,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: accent.glow,
            filter: "blur(60px)",
          }}
        />
        {/* L-shaped corner accents (match site's card corners) */}
        <span
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            width: 16,
            height: 16,
            borderTop: "2px solid rgba(255,255,255,0.28)",
            borderLeft: "2px solid rgba(255,255,255,0.28)",
          }}
        />
        <span
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            width: 16,
            height: 16,
            borderTop: "2px solid rgba(255,255,255,0.28)",
            borderRight: "2px solid rgba(255,255,255,0.28)",
          }}
        />
        <span
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            width: 16,
            height: 16,
            borderBottom: "2px solid rgba(255,255,255,0.28)",
            borderLeft: "2px solid rgba(255,255,255,0.28)",
          }}
        />
        <span
          style={{
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 16,
            height: 16,
            borderBottom: "2px solid rgba(255,255,255,0.28)",
            borderRight: "2px solid rgba(255,255,255,0.28)",
          }}
        />

        {/* Top row: wordmark + section label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "#f5f5f5",
            }}
          >
            <span
              style={{
                display: "flex",
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: "#f5f5f5",
              }}
            />
            example.com
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 14px",
              border: `1px solid ${accent.soft}`,
              borderRadius: 999,
              fontSize: 14,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: accent.solid,
              background: accent.glow,
            }}
          >
            <span
              style={{
                display: "flex",
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: accent.solid,
              }}
            />
            {sectionLabel}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Middle: title + subtitle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
            maxWidth: 1080,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: "#ffffff",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 26,
                lineHeight: 1.35,
                color: "rgba(245, 245, 245, 0.62)",
                letterSpacing: "-0.005em",
                maxWidth: 960,
              }}
            >
              {subtitle}
            </div>
          ) : null}
          {type === "blog" && (author || date) ? (
            <div
              style={{
                display: "flex",
                marginTop: 22,
                gap: 14,
                alignItems: "center",
                fontSize: 18,
                color: "rgba(245, 245, 245, 0.55)",
              }}
            >
              {author ? <span style={{ display: "flex" }}>{author}</span> : null}
              {author && date ? (
                <span
                  style={{
                    display: "flex",
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    background: "rgba(255,255,255,0.35)",
                  }}
                />
              ) : null}
              {date ? <span style={{ display: "flex" }}>{date}</span> : null}
            </div>
          ) : null}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, display: "flex" }} />

        {/* Bottom row: platform tagline + region */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 18,
              color: "rgba(245, 245, 245, 0.55)",
              letterSpacing: "0.02em",
            }}
          >
            Real Estate Intelligence Platform
          </div>
          {flag ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 18,
                color: "rgba(245, 245, 245, 0.7)",
              }}
            >
              <span style={{ display: "flex", fontSize: 28 }}>{flag}</span>
              <span style={{ display: "flex" }}>{regionName}</span>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 16,
                color: "rgba(245, 245, 245, 0.4)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: accent.solid,
                }}
              />
              10 Markets
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
