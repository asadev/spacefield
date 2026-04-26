import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "tenant-screening",
    "Tenant Screening Tool",
    "Screen and evaluate potential tenants for Dubai rental properties."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
