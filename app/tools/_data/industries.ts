import { TOOL_ICONS } from "./tools-list";

/**
 * Industry is the top-level grouping shown in onboarding before roles.
 * Real Estate is the default (product started as an RE workspace).
 */
export type IndustryKey =
  | "real-estate"
  | "marketing"
  | "sales"
  | "hr"
  | "finance"
  | "ops"
  | "product"
  | "design"
  | "consulting"
  | "other";

export interface Industry {
  key: IndustryKey;
  label: string;
  tagline: string;
  icon: keyof typeof TOOL_ICONS;
}

export const INDUSTRIES: Industry[] = [
  {
    key: "real-estate",
    label: "Real Estate",
    tagline: "Investing, selling, developing, or managing property.",
    icon: "building",
  },
  {
    key: "marketing",
    label: "Marketing",
    tagline: "Growth, funnels, acquisition, content.",
    icon: "trending",
  },
  {
    key: "sales",
    label: "Sales",
    tagline: "Pipeline, quota, closing.",
    icon: "target",
  },
  {
    key: "hr",
    label: "HR & People",
    tagline: "Hiring, headcount, retention.",
    icon: "users",
  },
  {
    key: "finance",
    label: "Finance",
    tagline: "Models, cash, investing, planning.",
    icon: "wallet",
  },
  {
    key: "ops",
    label: "Operations & Support",
    tagline: "Runbooks, SLAs, on-call, productivity.",
    icon: "refresh",
  },
  {
    key: "product",
    label: "Product & Engineering",
    tagline: "Building, shipping, measuring.",
    icon: "flow",
  },
  {
    key: "design",
    label: "Design & Creative",
    tagline: "Palettes, type, contrast, content.",
    icon: "image",
  },
  {
    key: "consulting",
    label: "Consulting & Services",
    tagline: "Projects, proposals, retainers.",
    icon: "document",
  },
  {
    key: "other",
    label: "Something else",
    tagline: "Founder, generalist, or just exploring.",
    icon: "compass",
  },
];

export const DEFAULT_INDUSTRY: IndustryKey = "real-estate";

export function industryBySlug(key: string) {
  return INDUSTRIES.find((i) => i.key === key);
}
