import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Investment Simulator | Dubai Real Estate Tool",
  description:
    "What if you bought property in Dubai? Simulate historical returns across 25+ areas from 2019–2026. Compare property appreciation + rental income vs bank deposits.",
  openGraph: {
    title: "Property Investment Simulator | Dubai Real Estate",
    description:
      "Simulate Dubai property returns based on historical data. Compare capital appreciation, rental income, and bank deposit alternatives across 25+ areas.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Property Investment Simulator | Dubai Real Estate",
    description:
      "What if you bought property in Dubai? See actual returns based on historical data.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/investment-simulator",
  },
};

export default function InvestmentSimulatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
