import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Poster Creator – Free Real Estate Marketing Tool | Asad Iqbal",
  description:
    "Create professional property marketing posters in minutes. 6 premium templates, drag-and-drop photos, instant high-res download. Built for Dubai real estate agents.",
  openGraph: {
    title: "Property Poster Creator – Real Estate Marketing Tool",
    description:
      "Create stunning property posters with professional templates. Upload photos, customize details, download in high resolution.",
    url: "https://example.com/tools/property-poster-creator",
  },
  twitter: {
    card: "summary_large_image",
    title: "Property Poster Creator – Real Estate Marketing Tool",
    description: "Create professional property marketing posters in minutes. 6 premium templates, instant high-res download.",
  },
  alternates: {
    canonical: "https://example.com/tools/property-poster-creator",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
