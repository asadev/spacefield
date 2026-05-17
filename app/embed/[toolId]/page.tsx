/* ─────────────────────────────────────────────────────────────────────────
 * /embed/<tool-id> — lightweight iframe-able tool widgets.
 *
 * Customers paste an `<iframe src="https://spacefield.co/embed/mortgage-
 * calculator">` onto their site and get a self-contained, brand-free
 * calculator. No Spacefield chrome, no auth, no nav. The CSP carve-out for
 * `/embed/*` (SE-008 in lib/security-headers.ts) drops X-Frame-Options +
 * frame-ancestors on these paths so any origin can iframe them.
 *
 * To add a widget, register it in WIDGETS below and drop a self-contained
 * component in app/embed/_components/. Keep them lean — these load on
 * customer sites under unknown network conditions, so no framer-motion,
 * no canvas charts, no Spacefield design tokens. Inline styles + native
 * inputs only. Light-theme-locked for predictable rendering inside iframes.
 * ───────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MortgageWidget from "../_components/MortgageWidget";
import RoiWidget from "../_components/RoiWidget";

export const dynamic = "force-static";

interface WidgetEntry {
  id: string;
  label: string;
  Component: () => React.JSX.Element;
}

const WIDGETS: WidgetEntry[] = [
  { id: "mortgage-calculator", label: "Mortgage Calculator", Component: MortgageWidget },
  { id: "roi-calculator", label: "ROI Calculator", Component: RoiWidget },
];

export function generateStaticParams() {
  return WIDGETS.map((w) => ({ toolId: w.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ toolId: string }> },
): Promise<Metadata> {
  const { toolId } = await params;
  const w = WIDGETS.find((x) => x.id === toolId);
  return {
    title: { absolute: w ? `${w.label} – Spacefield` : "Spacefield embed" },
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage(
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const widget = WIDGETS.find((w) => w.id === toolId);
  if (!widget) notFound();
  const Component = widget.Component;
  return <Component />;
}
