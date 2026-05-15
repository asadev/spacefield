import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import CommandPaletteProvider from "@/components/CommandPaletteProvider";
import TabVisibility from "./_components/TabVisibility";
import SiteBanner from "./_components/SiteBanner";
import { getActiveBrand, brandCssVarsBlock } from "@/lib/runtime-brand";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Space Field — Your Workspace",
    template: "%s | Space Field",
  },
  description:
    "A multi-workspace desktop with native apps for real estate, finance, marketing, sales, and everything in between.",
  metadataBase: new URL("https://spacefield.co"),
  openGraph: {
    type: "website",
    url: "https://spacefield.co",
    siteName: "Space Field",
    title: "Space Field — Your Workspace",
    description:
      "Multi-workspace desktop with native apps. Build your own workspace and run tools like apps.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Space Field — Your Workspace",
    description:
      "Multi-workspace desktop with native apps. Build your own workspace and run tools like apps.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://spacefield.co",
  },
};

/* Critical for mobile — without this, iOS Safari uses a 980px default
 * layout viewport which makes Tailwind's sm: (640px) media query match
 * even on small phones, hiding the mobile UI (hamburger, etc.) and
 * showing desktop-only chrome instead. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f1f2f4" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Brand is workspace-scoped eventually; here we only have global
  // context (no workspace inferred at the root layout level), so we
  // fetch the global default. brandCssVarsBlock returns an empty
  // string when there's no override, so the <style> tag is a no-op.
  const brand = await getActiveBrand();
  const brandCss = brandCssVarsBlock(brand);
  const faviconUrl = brand?.favicon_url ?? null;

  return (
    <html
      lang="en"
      className={`${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {brandCss && (
          <style dangerouslySetInnerHTML={{ __html: brandCss }} />
        )}
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
      </head>
      <body className="relative">
        <SiteBanner />
        <TabVisibility />
        <ThemeProvider>
          <CommandPaletteProvider>{children}</CommandPaletteProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
