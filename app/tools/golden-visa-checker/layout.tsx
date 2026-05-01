import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "Golden Visa Eligibility Checker — Check Your Dubai Property Qualification | Asad Iqbal",
  description:
    "Free tool to check if your Dubai property investment qualifies for the UAE Golden Visa. Instant eligibility assessment, document checklist, and government fees breakdown.",
  openGraph: {
    title: "UAE Golden Visa Eligibility Checker — Dubai Property Investors",
    description:
      "Check if your Dubai real estate investment qualifies for a 10-year Golden Visa or 5-year Retirement Visa. Instant results with full document checklist.",
    type: "website",
    url: "https://spacefield.co/tools/golden-visa-checker",
  },
  twitter: {
    card: "summary_large_image",
    title: "UAE Golden Visa Eligibility Checker",
    description: "Check if your Dubai property investment qualifies for the UAE Golden Visa. Instant eligibility assessment.",
  },
  alternates: {
    canonical: "https://spacefield.co/tools/golden-visa-checker",
  },
};

export default function GoldenVisaCheckerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
