import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMeta(
    "/solutions/tools",
    "All Solutions Tools",
    "Complete index of business utilities — productivity, finance, HR, marketing, legal, and data tools. Filterable, free, and fully functional."
  ),
};

export default function SolutionsToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
