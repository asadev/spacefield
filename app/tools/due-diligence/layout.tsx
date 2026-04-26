import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "due-diligence",
    "Due Diligence Checklist",
    "Complete property due diligence checklist for Dubai real estate transactions."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
