import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "property-valuation",
    "Property Valuation Tool",
    "Estimate Dubai property values using comparable sales and market data."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
