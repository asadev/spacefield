import type { Metadata } from "next";
import { toolMeta } from "@/lib/seo";

export const metadata: Metadata = {
  ...toolMeta(
    "cash-flow-modeler",
    "Cash Flow Modeler",
    "Model rental income, expenses, and net cash flow for Dubai investment properties."
  ),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
