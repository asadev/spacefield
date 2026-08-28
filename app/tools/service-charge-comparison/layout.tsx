import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dubai Service Charge Comparison — 60+ Communities & Buildings | Spacefield",
  description:
    "Compare service charges across 60+ Dubai communities and buildings. From Downtown to JVC, find out what you'll really pay beyond your mortgage. Includes chiller status, trends, and annual estimates.",
  openGraph: {
    title: "Dubai Service Charge Comparison — 60+ Communities & Buildings",
    description:
      "Compare service charges across 60+ Dubai communities and buildings. Find out what you'll really pay beyond your mortgage.",
    type: "website",
    url: "https://spacefield.co/tools/service-charge-comparison",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dubai Service Charge Comparison — 60+ Communities",
    description: "Compare service charges across 60+ Dubai communities and buildings. Find out what you'll really pay.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/service-charge-comparison",
  },
};

export default function ServiceChargeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
