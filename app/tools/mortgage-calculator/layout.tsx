import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "mortgage-calculator",
    "Mortgage Calculator",
    "Calculate UAE mortgage payments, compare rates, and plan your property financing."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
