import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dubai Rental Yield Heatmap — Interactive Map of 40+ Areas | Asad Iqbal",
  description:
    "Explore rental yields across 40+ Dubai communities on an interactive heatmap. Compare gross yields, average rents, price per sqft, and year-over-year changes to find the best investment areas.",
  openGraph: {
    title: "Dubai Rental Yield Heatmap — 40+ Areas Mapped",
    description:
      "Interactive rental yield map for Dubai investors. Compare yields, rents, and prices across Marina, Downtown, JVC, and 40+ other communities.",
    type: "website",
    url: "https://spacefield.co/tools/yield-heatmap",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dubai Rental Yield Heatmap — 40+ Areas Mapped",
    description: "Interactive rental yield map for Dubai investors. Compare yields across Marina, Downtown, JVC, and 40+ communities.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/yield-heatmap",
  },
};

export default function YieldHeatmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
