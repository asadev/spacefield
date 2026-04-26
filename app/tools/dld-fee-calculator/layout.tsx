import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "dld-fee-calculator",
    "DLD Fee Calculator",
    "Calculate Dubai Land Department transfer fees, registration, and transaction costs."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
