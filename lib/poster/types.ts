/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/types.ts — shared types for the Poster Creator tool
   ───────────────────────────────────────────────────────────────────────────
   The Poster Creator started life as a Property Poster Creator with six
   real-estate-flavored templates. The 2026-05-27 refactor (Agent D) split
   the rendering engine from the template definitions so any industry can
   ship its own pack of templates.

   Coordination with Agent C (industry system): the `PosterIndustry` union
   below mirrors the workspace.industry enum being introduced in the same
   build. If Agent C's enum is broader, the two unions are intentionally
   compatible at the string-literal level — any industry slug from C that
   isn't in the registry just falls back to 'generic'.
═══════════════════════════════════════════════════════════════════════════ */

import type { ComponentType, RefObject } from "react";

/* ───────────── Industries ───────────── */

export type PosterIndustry =
  | "real_estate"
  | "clothing_retail"
  | "marketing_agency"
  | "restaurant"
  | "salon"
  | "fitness"
  | "automotive"
  | "generic";

export const POSTER_INDUSTRIES: { id: PosterIndustry; label: string; emoji: string }[] = [
  { id: "real_estate", label: "Real Estate", emoji: "🏠" },
  { id: "clothing_retail", label: "Clothing & Retail", emoji: "👗" },
  { id: "marketing_agency", label: "Marketing Agency", emoji: "📈" },
  { id: "restaurant", label: "Restaurant / F&B", emoji: "🍽️" },
  { id: "salon", label: "Salon / Beauty", emoji: "💇" },
  { id: "fitness", label: "Fitness / Gym", emoji: "🏋️" },
  { id: "automotive", label: "Automotive", emoji: "🚗" },
  { id: "generic", label: "Generic", emoji: "✨" },
];

/* ───────────── Image / field primitives ───────────── */

export interface PosterImage {
  src: string;
  x: number;       // 0..100 — focal-point %
  y: number;       // 0..100
  scale: number;   // 1..3
}

export type PosterFieldType =
  | "text"
  | "multiline"
  | "number"
  | "price"        // text-typed, currency rendered from workspaceCurrency
  | "enum"
  | "image";

export interface PosterField {
  /** unique key inside the template's data record */
  key: string;
  /** UI label */
  label: string;
  type: PosterFieldType;
  required: boolean;
  /** for enum only */
  enumOptions?: string[];
  placeholder?: string;
  /** optional grouping label for the form ("Basics", "Branding", ...) */
  group?: string;
}

/* ───────────── Template definition ───────────── */

/** Raw data record — a flat key→value map. Image fields hold PosterImage. */
export type PosterData = Record<string, string | number | PosterImage | null | undefined | boolean>;

export interface PosterRenderProps {
  data: PosterData;
  posterRef: RefObject<HTMLDivElement | null>;
  /** "post" → square or 4:5, "story" → 1080×1920 */
  format: PosterFormat;
  /** ISO currency code rendered next to price fields, e.g. "AED", "PKR", "USD" */
  currency: string;
  /** Common branding row (agent / shop owner / studio). All optional. */
  branding: PosterBranding;
}

export type PosterFormat = "post" | "story";

/** Shared branding row used in every template. */
export interface PosterBranding {
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyName?: string;
  contactPhoto?: PosterImage | null;
  logoImage?: PosterImage | null;
  showContactPhoto?: boolean;
  showLogo?: boolean;
}

export interface PosterTemplate {
  id: string;
  industry: PosterIndustry;
  name: string;
  description: string;
  /** Emoji or symbol shown in the template-picker pill. */
  thumbnail: string;
  fields: PosterField[];
  /** Pre-filled fields shown the first time a user opens this template. */
  defaultData: PosterData;
  /**
   * Aspect-ratio support. Most templates render in BOTH square/4:5 post and
   * 1080×1920 story; some "bold gradient" templates lock to square 1:1.
   */
  dimensions: "post" | "story" | "both";
  /** Renderer — same engine, different layouts. */
  Render: ComponentType<PosterRenderProps>;
}
