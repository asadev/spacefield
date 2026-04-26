import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "deal-scoring",
    "Deal Scoring Engine",
    "Score any Dubai property deal on yield, location, risk, and growth potential."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
