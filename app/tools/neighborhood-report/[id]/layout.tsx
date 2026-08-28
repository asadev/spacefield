import type { Metadata } from "next";
import { communities } from "@/lib/neighborhood-data";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const community = communities.find((c) => c.id === id);
  
  if (!community) {
    return { title: "Community Not Found | Spacefield" };
  }

  const yieldRange = `${community.investment.rentalYieldPct.min}–${community.investment.rentalYieldPct.max}%`;
  const priceRange = `AED ${(community.pricing.priceRangeAed[0] / 1_000_000).toFixed(1)}M – ${(community.pricing.priceRangeAed[1] / 1_000_000).toFixed(1)}M`;

  return {
    title: `${community.name} — Neighborhood Quality Report | Spacefield`,
    description: `${community.description} Rental yield: ${yieldRange}. Price range: ${priceRange}. Developer: ${community.developer}. Comprehensive quality report with scores across investment, livability, connectivity, and more.`,
    openGraph: {
      title: `${community.name} — Dubai Neighborhood Quality Report`,
      description: `${community.description} Rental yield: ${yieldRange}. Comprehensive quality report.`,
      type: "article",
      url: `https://spacefield.co/tools/neighborhood-report/${id}`,
    },
  };
}

export async function generateStaticParams() {
  return communities.map((c) => ({ id: c.id }));
}

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
