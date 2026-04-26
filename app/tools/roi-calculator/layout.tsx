import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "roi-calculator",
    "ROI Calculator",
    "Calculate return on investment for Dubai real estate including rental yield and capital gains."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
