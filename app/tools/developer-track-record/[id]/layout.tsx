import type { Metadata } from "next";
import { developers } from "@/lib/developer-data";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const dev = developers.find((d) => d.id === id);

  if (!dev) {
    return { title: "Developer Not Found | Asad Iqbal" };
  }

  return {
    title: `${dev.name} — Developer Track Record | Asad Iqbal`,
    description: `${dev.description} Overall score: ${dev.overallScore}/10. Delivery: ${dev.deliveryScore}/10. Quality: ${dev.qualityScore}/10. Price range: ${dev.priceRange}.`,
    openGraph: {
      title: `${dev.name} — Dubai Developer Track Record`,
      description: `${dev.knownFor} Overall score: ${dev.overallScore}/10. ${dev.completedProjects} completed projects.`,
      type: "article",
      url: `https://spacefield.co/tools/developer-track-record/${id}`,
    },
  };
}

export async function generateStaticParams() {
  return developers.map((d) => ({ id: d.id }));
}

export default function DeveloperDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
