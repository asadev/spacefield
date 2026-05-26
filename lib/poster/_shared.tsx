/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/_shared.tsx — primitives shared by every template renderer
   ───────────────────────────────────────────────────────────────────────────
   PosterImageBox          — renders a focal-pointed cover image (or empty
                              placeholder gradient)
   LocationPin / DotIcon    — small inline SVGs reused across themes
   AgentBar                 — bottom contact/branding strip with theme
                              variants (dark / light / gold / gradient)
   StoryShell               — the shared 9:16 story layout, used as the
                              `format === "story"` fallback for templates
                              that don't ship a bespoke story renderer.

   Currency: every price field renders as `{currency} {value}`. The
   `currency` arg is forwarded from PosterRenderProps and originally
   comes from workspace settings via useWorkspaceCurrency().
═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { CSSProperties, RefObject } from "react";
import type { PosterBranding, PosterImage } from "./types";

export type PosterTheme = "dark" | "light" | "gold" | "gradient";

/* ────────── Image box ────────── */

export function PosterImageBox({
  image,
  className,
  style,
}: {
  image: PosterImage | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  if (!image) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 ${className ?? ""}`}
        style={style}
      >
        <svg
          className="h-16 w-16 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
          />
        </svg>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden ${className ?? ""}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt=""
        className="h-full w-full pointer-events-none select-none"
        style={{
          objectFit: "cover",
          objectPosition: `${image.x}% ${image.y}%`,
          transform: `scale(${image.scale})`,
        }}
      />
    </div>
  );
}

/* ────────── Icons ────────── */

export function LocationPin({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 1 1 9.9 9.9L10 18.9l-4.95-4.95a7 7 0 0 1 0-9.9ZM10 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ────────── Branding / contact bar ────────── */

export function AgentBar({
  branding,
  theme,
}: {
  branding: PosterBranding;
  theme: PosterTheme;
}) {
  const colors = {
    dark: {
      name: "text-white",
      phone: "text-white/60",
      company: "text-white/50",
      border: "border-white/10",
      photoBorder: "border-white/20",
    },
    light: {
      name: "text-[#1a1a2e]",
      phone: "text-gray-400",
      company: "text-gray-400",
      border: "border-gray-200",
      photoBorder: "border-gray-200",
    },
    gold: {
      name: "text-white",
      phone: "text-[#c9a96e]/60",
      company: "text-[#c9a96e]/50",
      border: "border-[#c9a96e]/20",
      photoBorder: "border-[#c9a96e]/40",
    },
    gradient: {
      name: "text-white",
      phone: "text-white/60",
      company: "text-white/50",
      border: "border-white/20",
      photoBorder: "border-white/30",
    },
  }[theme];

  const showPhoto = branding.showContactPhoto !== false && branding.contactPhoto;
  const showLogo = branding.showLogo !== false && branding.logoImage;

  return (
    <div className={`flex items-center gap-[0.6em] border-t ${colors.border} pt-[0.6em]`}>
      {showPhoto && branding.contactPhoto ? (
        <div className={`h-[2.4em] w-[2.4em] overflow-hidden rounded-full border-2 ${colors.photoBorder} flex-shrink-0`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.contactPhoto.src}
            alt=""
            className="h-full w-full object-cover"
            style={{ objectPosition: `${branding.contactPhoto.x}% ${branding.contactPhoto.y}%` }}
          />
        </div>
      ) : null}
      <div className="flex-1 min-w-0">
        {branding.contactName ? (
          <p className={`text-[0.6em] font-semibold ${colors.name} truncate`}>{branding.contactName}</p>
        ) : null}
        <div className="flex items-center gap-[0.4em]">
          {branding.contactPhone ? (
            <span className={`text-[0.45em] ${colors.phone}`}>{branding.contactPhone}</span>
          ) : null}
          {branding.contactPhone && branding.companyName ? (
            <span className={`text-[0.3em] ${colors.phone}`}>|</span>
          ) : null}
          {branding.companyName ? (
            <span className={`text-[0.45em] ${colors.company} uppercase tracking-wider`}>
              {branding.companyName}
            </span>
          ) : null}
        </div>
      </div>
      {showLogo && branding.logoImage ? (
        <div className="h-[2.2em] w-auto flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoImage.src} alt="" className="h-full w-auto object-contain" />
        </div>
      ) : null}
    </div>
  );
}

/* ────────── Generic story shell ────────── */
/**
 * Default 9:16 story renderer for any template. Templates may opt out and
 * ship their own story layout instead. Accepts a small set of "well known"
 * data fields so it can be shared across industries; absent fields are
 * silently omitted.
 *
 * Recognised keys:
 *   title          — required hero title
 *   subtitle       — small line above the title (status badge text)
 *   price          — large number rendered as `{currency} {price}`
 *   location       — small location line under the title
 *   image          — main image (PosterImage)
 *   features       — single-line free text rendered as the trailing caption
 *   stats[]        — optional array of { label, value } strings — keyed in
 *                    data as `statN_label` + `statN_value` for N=1..3
 */
export function StoryShell({
  posterRef,
  theme,
  title,
  subtitle,
  price,
  location,
  image,
  features,
  stats,
  currency,
  branding,
}: {
  posterRef: RefObject<HTMLDivElement | null>;
  theme: PosterTheme;
  title: string;
  subtitle?: string;
  price?: string;
  location?: string;
  image: PosterImage | null;
  features?: string;
  stats?: Array<{ label: string; value: string }>;
  currency: string;
  branding: PosterBranding;
}) {
  const bg = {
    dark: "bg-black",
    light: "bg-[#f8f8f5]",
    gold: "bg-[#0c0c0c]",
    gradient: "",
  }[theme];

  const gradientStyle =
    theme === "gradient" ? { background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" } : {};

  const statusBg = {
    dark: "bg-white text-black",
    light: "bg-[#1a1a2e] text-white",
    gold: "bg-[#c9a96e] text-[#0c0c0c]",
    gradient: "bg-white/20 backdrop-blur-sm text-white",
  }[theme];

  const titleColor = "text-white";
  const priceColor = theme === "gold" ? "text-[#c9a96e]" : "text-white";
  const specBg = {
    dark: "bg-white/10",
    light: "bg-white/15 backdrop-blur-sm",
    gold: "border border-[#c9a96e]/30",
    gradient: "bg-white/15 backdrop-blur-sm",
  }[theme];
  const specText = theme === "gold" ? "text-[#c9a96e]" : "text-white";
  const specLabel = {
    dark: "text-white/50",
    light: "text-white/60",
    gold: "text-white/40",
    gradient: "text-white/50",
  }[theme];
  const locColor = {
    dark: "text-white/60",
    light: "text-white/70",
    gold: "text-[#c9a96e]/80",
    gradient: "text-white/70",
  }[theme];

  return (
    <div
      ref={posterRef}
      className={`relative w-full overflow-hidden ${bg}`}
      style={{ aspectRatio: "1080/1920", ...gradientStyle }}
    >
      <PosterImageBox image={image} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />
      {theme === "gold" ? (
        <div className="absolute inset-[2.5%] border border-[#c9a96e]/30 pointer-events-none z-20" />
      ) : null}
      {theme === "gradient" ? (
        <>
          <div className="absolute -top-[20%] -right-[20%] h-[50%] w-[50%] rounded-full bg-white/5" />
          <div className="absolute -bottom-[10%] -left-[10%] h-[35%] w-[35%] rounded-full bg-white/5" />
        </>
      ) : null}

      <div className="absolute top-[13%] left-[6%] right-[6%] z-10 flex items-start justify-between">
        {subtitle ? (
          <div className={`inline-block px-[0.8em] py-[0.3em] ${statusBg} ${theme === "gradient" ? "rounded-full" : ""}`}>
            <span className="text-[0.55em] font-bold tracking-[0.2em] uppercase">{subtitle}</span>
          </div>
        ) : (
          <span />
        )}
        {branding.showLogo !== false && branding.logoImage ? (
          <div className="h-[2em] w-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoImage.src} alt="" className="h-full w-auto object-contain" />
          </div>
        ) : null}
      </div>

      <div className="absolute left-[6%] right-[6%] z-10" style={{ top: "50%" }}>
        {price ? (
          <p className={`text-[1.8em] font-bold ${priceColor} leading-none`}>
            {currency} {price}
          </p>
        ) : null}
        <h2 className={`mt-[0.4em] text-[1.3em] font-bold leading-[1.15] ${titleColor}`}>{title}</h2>
        {location ? (
          <div className="mt-[0.25em] flex items-center gap-[0.3em]">
            <LocationPin className={`h-[0.55em] w-[0.55em] ${locColor}`} />
            <span className={`text-[0.5em] ${locColor}`}>{location}</span>
          </div>
        ) : null}
        {stats && stats.length > 0 ? (
          <div className="mt-[0.6em] flex gap-[0.4em]">
            {stats.map((s, i) => (
              <div key={i} className={`${specBg} px-[0.6em] py-[0.3em] text-center rounded`}>
                <span className={`text-[0.75em] font-bold ${specText}`}>{s.value}</span>
                <span className={`block text-[0.3em] ${specLabel} uppercase`}>{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {features ? (
          <p className="mt-[0.4em] text-[0.42em] text-white/50">{features}</p>
        ) : null}
      </div>

      <div className="absolute bottom-[17%] left-[6%] right-[6%] z-10">
        <div className={`flex items-center gap-[0.6em] ${theme === "gradient" ? "bg-white/10 backdrop-blur-sm rounded-xl p-[0.5em]" : ""}`}>
          {branding.showContactPhoto !== false && branding.contactPhoto ? (
            <div className="h-[2.6em] w-[2.6em] overflow-hidden rounded-full border-2 border-white/25 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.contactPhoto.src}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: `${branding.contactPhoto.x}% ${branding.contactPhoto.y}%` }}
              />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            {branding.contactName ? (
              <p className="text-[0.6em] font-semibold text-white truncate">{branding.contactName}</p>
            ) : null}
            <div className="flex items-center gap-[0.4em]">
              {branding.contactPhone ? (
                <span className="text-[0.45em] text-white/55">{branding.contactPhone}</span>
              ) : null}
              {branding.contactPhone && branding.companyName ? (
                <span className="text-[0.3em] text-white/30">|</span>
              ) : null}
              {branding.companyName ? (
                <span className="text-[0.45em] text-white/45 uppercase tracking-wider">
                  {branding.companyName}
                </span>
              ) : null}
            </div>
          </div>
          {branding.showLogo !== false && branding.logoImage ? (
            <div className="h-[2em] w-auto flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logoImage.src}
                alt=""
                className="h-full w-auto object-contain brightness-0 invert opacity-70"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ────────── Data accessor helpers ────────── */

import type { PosterData } from "./types";

/** Read a string field from data, defaulting to "". Numbers are stringified. */
export function dataStr(data: PosterData, key: string): string {
  const v = data[key];
  if (v === null || v === undefined || v === false) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Read a PosterImage field, returning null if absent or wrong shape. */
export function dataImage(data: PosterData, key: string): PosterImage | null {
  const v = data[key];
  if (!v || typeof v !== "object") return null;
  const maybe = v as unknown as Record<string, unknown>;
  if ("src" in maybe && typeof maybe.src === "string") {
    return v as PosterImage;
  }
  return null;
}

/** Read a boolean field. Defaults provided. */
export function dataBool(data: PosterData, key: string, fallback: boolean): boolean {
  const v = data[key];
  if (typeof v === "boolean") return v;
  return fallback;
}
