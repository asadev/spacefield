import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Global Market Comparison – Real-Time Real Estate Data | Spacefield",
  description:
    "Compare real estate markets worldwide with live data from BIS, OECD, and World Bank. Property price indices, affordability ratios, economic fundamentals across 60+ countries.",
  openGraph: {
    title: "Global Market Comparison – Real-Time Real Estate Data",
    description:
      "Compare property markets across 60+ countries. Live price indices, affordability ratios, GDP, population, and more.",
    url: "https://spacefield.co/tools/global-market-comparison",
  },
  twitter: {
    card: "summary_large_image",
    title: "Global Market Comparison – Real-Time Real Estate Data",
    description: "Compare real estate markets across 60+ countries with live data from BIS, OECD, and World Bank.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/global-market-comparison",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
