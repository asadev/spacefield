import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "regulation-monitor",
    "Regulation Monitor",
    "Stay updated on Dubai real estate regulations, RERA rules, and policy changes."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
