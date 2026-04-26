import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "affordability",
    "Affordability Calculator",
    "Check what you can afford in Dubai real estate based on income, savings, and financing options."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
