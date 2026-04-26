import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "developer-pipeline",
    "Developer Pipeline Tracker",
    "Track upcoming projects and launches from Dubai real estate developers."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
