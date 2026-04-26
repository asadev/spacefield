import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "portfolio-tracker",
    "Portfolio Tracker",
    "Track and analyze your Dubai real estate investment portfolio performance."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
