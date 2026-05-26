/* lib/industry/registry-helpers.ts
 *
 * Pure synchronous helpers that operate on the in-memory registry.
 * No supabase, no Node-only modules — safe to import from "use client"
 * modules and from edge runtime API routes.
 *
 * Wrapped re-exports in lib/industry/helpers.ts keep the public import
 * path stable for callers.
 */

import { ALL_INDUSTRIES } from "./registry";
import { GENERIC_INDUSTRY } from "./types";
import type { Industry, IndustryConfig } from "./types";

/**
 * Lookup the config block for a given industry slug. Falls back to the
 * 'generic' config if the slug isn't registered — `null` callers get
 * 'generic' too. Always returns a valid IndustryConfig so call sites
 * never need to null-check before reading label/icon/description.
 */
export function getIndustryConfig(
  industry: Industry | null | undefined
): IndustryConfig {
  const slug = normaliseIndustry(industry ?? null);
  const found = ALL_INDUSTRIES.find((i) => i.slug === slug);
  return found ?? ALL_INDUSTRIES.find((i) => i.slug === GENERIC_INDUSTRY)!;
}

/**
 * Filter a list of records by their industry field, with a generic
 * fallback when the workspace's industry has no matching items.
 *
 * Rules:
 *   - Items whose `industryKey` value is null/undefined/"" are treated
 *     as universal and always returned.
 *   - Items whose `industryKey` matches the workspace's industry are
 *     returned.
 *   - If the first pass returns nothing AND the workspace is not
 *     already 'generic', fall back to items tagged 'generic' so the
 *     user isn't staring at an empty list.
 */
export function industryFilter<T extends Record<string, unknown>>(
  items: T[],
  industryKey: keyof T,
  workspaceIndustry: Industry | null | undefined
): T[] {
  if (!items.length) return [];
  const target = normaliseIndustry(workspaceIndustry ?? null);

  const direct = items.filter((it) => {
    const tag = it[industryKey];
    if (tag === null || tag === undefined || tag === "") return true;
    return tag === target;
  });
  if (direct.length > 0) return direct;

  if (target === GENERIC_INDUSTRY) return [];
  return items.filter((it) => it[industryKey] === GENERIC_INDUSTRY);
}

/**
 * Coerce an arbitrary stored value to a known Industry slug.
 * Unrecognised input becomes 'generic'.
 */
export function normaliseIndustry(value: string | null | undefined): Industry {
  if (!value) return GENERIC_INDUSTRY;
  return ALL_INDUSTRIES.some((i) => i.slug === value)
    ? (value as Industry)
    : GENERIC_INDUSTRY;
}
