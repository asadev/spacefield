import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developer Track Record — 30+ Dubai Developers Scored | Asad Iqbal",
  description:
    "Score and compare 30+ Dubai real estate developers on delivery timeline, build quality, and price appreciation history. Emaar, DAMAC, Sobha, Nakheel, and more.",
  openGraph: {
    title: "Developer Track Record — 30+ Dubai Developers Scored",
    description:
      "Compare Dubai developers on delivery, quality, and appreciation. Data-driven scores for Emaar, DAMAC, Sobha, Nakheel, Azizi, Danube, and 25+ more.",
    type: "website",
    url: "https://spacefield.co/tools/developer-track-record",
  },
  twitter: {
    card: "summary_large_image",
    title: "Developer Track Record — 30+ Dubai Developers Scored",
    description: "Compare Dubai developers on delivery, quality, and appreciation. Data-driven scores for 30+ developers.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/developer-track-record",
  },
};

export default function DeveloperTrackRecordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
