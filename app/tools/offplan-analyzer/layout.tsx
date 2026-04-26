import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "offplan-analyzer",
    "Off-Plan Analyzer",
    "Analyze off-plan Dubai property deals for value, risk, and payment plan comparison."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
