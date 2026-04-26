import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Area Comparison Tool — Compare Dubai Communities Side by Side | Asad Iqbal",
  description:
    "Pick 2–3 Dubai areas and compare them side-by-side across price, yield, schools, commute, lifestyle, and more. Data-driven comparison powered by 50-community dataset.",
  openGraph: {
    title: "Area Comparison Tool — Compare Dubai Communities Side by Side",
    description:
      "Compare Dubai neighborhoods across price per sqft, rental yield, schools, commute times, walkability, and 20+ metrics. Free, data-driven tool.",
    type: "website",
    url: "https://example.com/tools/area-comparison",
  },
  twitter: {
    card: "summary_large_image",
    title: "Area Comparison Tool — Compare Dubai Communities",
    description: "Pick 2-3 Dubai areas and compare them side-by-side across price, yield, schools, commute, and more.",
  },
  alternates: {
    canonical: "https://example.com/tools/area-comparison",
  },
};

export default function AreaComparisonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
