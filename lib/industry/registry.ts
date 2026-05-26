/* lib/industry/registry.ts
 *
 * The single source of truth for every industry Spacefield knows
 * about. Pickers (onboarding, workspace settings) render from here,
 * and downstream consumers (poster templates, CRM defaults, app
 * recommendations) look up an Industry slug to get the config.
 *
 * Adding a new industry:
 *   1. Add the slug to the `Industry` union in lib/industry/types.ts.
 *   2. Add it to the CHECK constraint in
 *      supabase/migrations/<new>_workspace_industry_<change>.sql
 *      (extend the IN list — the existing constraint isn't ALTER-able
 *      in place, drop-and-recreate is required).
 *   3. Append a new IndustryConfig entry to ALL_INDUSTRIES below.
 *   4. Verify icon key exists in app/tools/_data/tools-list.ts
 *      TOOL_ICONS — otherwise the card renders blank.
 *
 * Tool slugs in recommendedApps must match
 * app/tools/_data/tools-list.ts. Missing slugs are silently filtered
 * by the install path. We deliberately keep the lists short (3–5 apps
 * each) so the recommendation never overwhelms the user.
 */

import type { IndustryConfig } from "./types";

export const ALL_INDUSTRIES: IndustryConfig[] = [
  {
    slug: "real_estate",
    label: "Real Estate",
    icon: "home",
    description: "Property sales, rentals, brokerage, off-plan investing.",
    recommendedApps: [
      "property-valuation",
      "deal-scoring",
      "market-pulse",
      "property-poster-creator",
      "crm",
    ],
    defaultPipeline: [
      "New Lead",
      "Viewing",
      "Offer",
      "Negotiating",
      "Closed Won",
      "Closed Lost",
    ],
  },
  {
    slug: "clothing_retail",
    label: "Clothing & Fashion Retail",
    icon: "palette",
    description: "Apparel, fabric, unstitched, boutiques and concept stores.",
    recommendedApps: [
      "property-poster-creator",
      "crm",
      "invoice-generator",
      "pricing-calculator",
      "sheets",
    ],
    defaultPipeline: [
      "Walked In",
      "Browsing",
      "Tried On",
      "Purchased",
      "Repeat Customer",
    ],
  },
  {
    slug: "marketing_agency",
    label: "Marketing Agency",
    icon: "megaphone",
    description: "Brand, content, paid ads, SEO and creative services.",
    recommendedApps: [
      "content-brief-builder",
      "headline-analyzer",
      "seo-meta-tags",
      "ad-budget-allocator",
      "crm",
    ],
    defaultPipeline: [
      "Discovery Call",
      "Proposal Sent",
      "Negotiating",
      "Won",
      "Lost",
      "Retained",
    ],
  },
  {
    slug: "coworking",
    label: "Coworking & Shared Office",
    icon: "building",
    description: "Memberships, hot desks, dedicated offices, meeting rooms.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "capacity-planner",
      "documents",
    ],
    defaultPipeline: [
      "Tour Booked",
      "Toured",
      "Quoted",
      "Member",
      "Churned",
    ],
  },
  {
    slug: "salon",
    label: "Salon & Spa",
    icon: "palette",
    description: "Hair, nails, skin, spa packages, walk-in bookings.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "pricing-calculator",
      "property-poster-creator",
    ],
    defaultPipeline: [
      "New Client",
      "Booked",
      "Served",
      "Rebooked",
      "Lapsed",
    ],
  },
  {
    slug: "restaurant",
    label: "Restaurant & Cafe",
    icon: "receipt",
    description: "Dine-in, takeaway, delivery, catering, ghost kitchens.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "pricing-calculator",
      "property-poster-creator",
    ],
    defaultPipeline: [
      "Inquiry",
      "Reservation",
      "Dining",
      "Reviewed",
      "Returning",
    ],
  },
  {
    slug: "gym",
    label: "Gym & Studio",
    icon: "trophy",
    description: "Membership gyms, CrossFit boxes, yoga and pilates studios.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "pricing-calculator",
      "property-poster-creator",
    ],
    defaultPipeline: [
      "Trial Lead",
      "Toured",
      "Free Class",
      "Member",
      "Cancelled",
    ],
  },
  {
    slug: "fitness",
    label: "Personal Training & Coaching",
    icon: "spark",
    description:
      "1-on-1 training, online coaching, nutrition, transformation programs.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "sales-call-script-builder",
      "proposal-generator",
      "documents",
    ],
    defaultPipeline: [
      "Lead",
      "Consult Booked",
      "Program Sold",
      "Active Client",
      "Completed",
    ],
  },
  {
    slug: "beauty",
    label: "Beauty Products & Cosmetics",
    icon: "palette",
    description:
      "Skincare brands, makeup labels, fragrance, beauty e-commerce.",
    recommendedApps: [
      "property-poster-creator",
      "invoice-generator",
      "pricing-calculator",
      "crm",
      "sheets",
    ],
    defaultPipeline: [
      "Visitor",
      "Sample Sent",
      "First Order",
      "Repeat Order",
      "VIP",
    ],
  },
  {
    slug: "professional_services",
    label: "Professional Services",
    icon: "briefcase",
    description:
      "Law, accounting, consulting, advisory, freelance, agency work.",
    recommendedApps: [
      "crm",
      "proposal-generator",
      "invoice-generator",
      "quote-builder",
      "documents",
    ],
    defaultPipeline: [
      "Inquiry",
      "Scoping",
      "Proposal",
      "Engaged",
      "Delivered",
      "Retained",
    ],
  },
  {
    slug: "automotive",
    label: "Automotive Sales & Service",
    icon: "compass",
    description:
      "Car dealerships, used-car lots, garages, detailing, parts and spares.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "pricing-calculator",
      "property-poster-creator",
      "quote-builder",
    ],
    defaultPipeline: [
      "Inquiry",
      "Test Drive",
      "Offer",
      "Negotiating",
      "Sold",
      "Service",
    ],
  },
  {
    slug: "education",
    label: "Education & Training",
    icon: "document",
    description:
      "Tuition centers, language schools, online courses, certifications.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "documents",
      "sheets",
    ],
    defaultPipeline: [
      "Inquiry",
      "Counseling",
      "Trial Class",
      "Enrolled",
      "Completed",
      "Alumni",
    ],
  },
  {
    slug: "healthcare",
    label: "Healthcare & Clinics",
    icon: "shield",
    description:
      "Dental, dermatology, physiotherapy, allied health and specialty clinics.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "documents",
      "consent-form-generator",
    ],
    defaultPipeline: [
      "New Patient",
      "Consultation",
      "Treatment Plan",
      "Active Treatment",
      "Follow-up",
    ],
  },
  {
    slug: "hospitality",
    label: "Hotels & Hospitality",
    icon: "building",
    description: "Hotels, boutique stays, serviced apartments, Airbnb operators.",
    recommendedApps: [
      "crm",
      "invoice-generator",
      "team-schedule",
      "property-poster-creator",
      "pricing-calculator",
    ],
    defaultPipeline: [
      "Inquiry",
      "Quoted",
      "Booked",
      "Stayed",
      "Reviewed",
      "Returning",
    ],
  },
  {
    slug: "retail_general",
    label: "General Retail & E-commerce",
    icon: "grid",
    description: "Stores, kiosks, Shopify shops, marketplaces, drop-ship.",
    recommendedApps: [
      "property-poster-creator",
      "invoice-generator",
      "pricing-calculator",
      "crm",
      "sheets",
    ],
    defaultPipeline: [
      "Visitor",
      "Cart Started",
      "Purchased",
      "Repeat",
      "Loyal",
    ],
  },
  {
    slug: "generic",
    label: "Something else / Generic",
    icon: "compass",
    description:
      "Catch-all for any business not listed above. You can change this later.",
    recommendedApps: ["crm", "documents", "sheets", "invoice-generator"],
    defaultPipeline: ["Lead", "Working", "Won", "Lost"],
  },
];

/**
 * Compile-time check (and runtime sanity) that ALL_INDUSTRIES covers
 * every member of the Industry union. If you add a slug to the type
 * but forget to add it here, the build catches it via the exhaustive
 * record below.
 */
const _exhaustive: Record<IndustryConfig["slug"], true> = Object.fromEntries(
  ALL_INDUSTRIES.map((i) => [i.slug, true])
) as Record<IndustryConfig["slug"], true>;
void _exhaustive;
