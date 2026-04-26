import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "sales-offer-generator",
    "Sales Offer Generator",
    "Generate professional property sales offers and proposals for Dubai listings."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
