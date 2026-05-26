/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/registry.ts — Industry-keyed catalog of poster templates
   ───────────────────────────────────────────────────────────────────────────
   The Poster Creator tool filters its template gallery by the active
   industry (defaulting to workspace.industry, falling back to 'generic').

   New templates: drop a new `PosterTemplate` into the matching industry
   array. Lazily importing template modules keeps the initial route bundle
   small (mostly the real-estate templates already on the page).
═══════════════════════════════════════════════════════════════════════════ */

import type { PosterIndustry, PosterTemplate } from "./types";

import { REAL_ESTATE_TEMPLATES } from "./templates/real-estate";
import { CLOTHING_RETAIL_TEMPLATES } from "./templates/clothing-retail";
import { MARKETING_AGENCY_TEMPLATES } from "./templates/marketing-agency";
import { RESTAURANT_TEMPLATES } from "./templates/restaurant";
import { SALON_TEMPLATES } from "./templates/salon";
import { FITNESS_TEMPLATES } from "./templates/fitness";
import { AUTOMOTIVE_TEMPLATES } from "./templates/automotive";
import { GENERIC_TEMPLATES } from "./templates/generic";

/** Industry → ordered list of templates. Order = display order in the gallery. */
const REGISTRY: Record<PosterIndustry, PosterTemplate[]> = {
  real_estate: REAL_ESTATE_TEMPLATES,
  clothing_retail: CLOTHING_RETAIL_TEMPLATES,
  marketing_agency: MARKETING_AGENCY_TEMPLATES,
  restaurant: RESTAURANT_TEMPLATES,
  salon: SALON_TEMPLATES,
  fitness: FITNESS_TEMPLATES,
  automotive: AUTOMOTIVE_TEMPLATES,
  generic: GENERIC_TEMPLATES,
};

export function getTemplatesForIndustry(industry: PosterIndustry): PosterTemplate[] {
  return REGISTRY[industry] ?? REGISTRY.generic;
}

export function getTemplateById(industry: PosterIndustry, id: string): PosterTemplate | undefined {
  return getTemplatesForIndustry(industry).find((t) => t.id === id);
}

export function getAllTemplates(): PosterTemplate[] {
  return Object.values(REGISTRY).flat();
}

export { REGISTRY as POSTER_TEMPLATE_REGISTRY };
