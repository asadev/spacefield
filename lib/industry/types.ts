/* lib/industry/types.ts
 *
 * Shared industry-classification types. The slug enum here MUST stay in
 * sync with the CHECK constraint in
 * supabase/migrations/20260527c_workspace_industry.sql and with the
 * registry array in lib/industry/registry.ts.
 *
 * Why "Industry | null":
 *   - The workspaces.industry column is nullable (legacy rows + during
 *     onboarding before the user picks).
 *   - Downstream code that wants a guaranteed value should call
 *     getWorkspaceIndustry() in lib/industry/helpers.ts — that helper
 *     defaults null → 'generic' for tools that need a concrete slug.
 */

export type Industry =
  | "real_estate"
  | "clothing_retail"
  | "marketing_agency"
  | "coworking"
  | "salon"
  | "restaurant"
  | "gym"
  | "fitness"
  | "beauty"
  | "professional_services"
  | "automotive"
  | "education"
  | "healthcare"
  | "hospitality"
  | "retail_general"
  | "generic";

/** Possible stored value (nullable in DB, optional in form state). */
export type IndustryOrNull = Industry | null;

export interface IndustryConfig {
  slug: Industry;
  /** Human-readable label shown in pickers and settings. */
  label: string;
  /**
   * Icon key. Spacefield uses its own icon set in
   * app/tools/_data/tools-list.ts → TOOL_ICONS. The pickers we render
   * resolve this through that map. Keep the name to a TOOL_ICONS key
   * that actually exists, otherwise the card renders a missing-icon
   * placeholder. The brief asked for "lucide icon names" but Spacefield
   * doesn't ship lucide-react; the project's existing icon vocabulary
   * is what consumers will pass through.
   */
  icon: string;
  /** One-line description shown under the label on cards. */
  description: string;
  /**
   * Optional default UI language code (e.g. 'en', 'ar', 'ur'). Most
   * industries leave this undefined → 'en'. Reserved for future i18n
   * pre-selection.
   */
  defaultLanguage?: string;
  /**
   * Tool slugs (matching app/tools/_data/tools-list.ts) we recommend
   * pre-installing for this industry. The onboarding step surfaces these
   * as a follow-up suggestion; we do NOT auto-install them — the user
   * stays in control of what's on their dock.
   */
  recommendedApps: string[];
  /**
   * Default CRM deal pipeline stages. The CRM templates layer reads this
   * when a workspace has no template_id assigned. Empty array means
   * "no opinion — keep the CRM default".
   */
  defaultPipeline?: string[];
}

/** Sentinel value for the catch-all bucket. */
export const GENERIC_INDUSTRY: Industry = "generic";
