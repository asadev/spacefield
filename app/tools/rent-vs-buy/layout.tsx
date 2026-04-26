import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "rent-vs-buy",
    "Rent vs Buy Calculator",
    "Compare the cost of renting versus buying property in Dubai over time."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
