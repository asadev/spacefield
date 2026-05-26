import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Poster Creator – Industry-Aware Marketing Posters | Spacefield",
  description:
    "Generate posters for any industry — real estate, fashion, food, services and more. Industry-keyed templates, drag-and-drop photos, instant high-res download.",
  openGraph: {
    title: "Poster Creator – Spacefield",
    description:
      "Industry-aware poster templates. Real estate, clothing, restaurants, salons, fitness, automotive and generic packs. Drag, drop, download.",
    url: "https://spacefield.co/tools/poster-creator",
  },
  twitter: {
    card: "summary_large_image",
    title: "Poster Creator – Spacefield",
    description: "Industry-aware poster templates. High-res download in seconds.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/poster-creator",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
