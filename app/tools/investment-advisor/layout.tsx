import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "investment-advisor",
    "AI Investment Advisor",
    "Personalized Dubai real estate investment recommendations powered by market data."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
