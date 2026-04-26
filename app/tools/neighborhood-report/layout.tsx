import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dubai Neighborhood Quality Report — 50 Communities Scored | Asad Iqbal",
  description: "Comprehensive, data-driven neighborhood quality reports for 50 Dubai communities. Six scoring categories covering investment potential, livability, connectivity, family-friendliness, value for money, and future growth.",
  openGraph: {
    title: "Dubai Neighborhood Quality Report — 50 Communities Scored",
    description: "Compare 50 Dubai communities across investment potential, livability, connectivity, and more. Free, data-driven neighborhood quality reports.",
    type: "website",
    url: "https://example.com/tools/neighborhood-report",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dubai Neighborhood Quality Report — 50 Communities",
    description: "Compare 50 Dubai communities across investment potential, livability, connectivity, and more.",
  },
  alternates: {
    canonical: "https://example.com/tools/neighborhood-report",
  },
};

export default function NeighborhoodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
