import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/ThemeProvider";
import CommandPaletteProvider from "@/components/CommandPaletteProvider";
import CookieConsent from "@/components/CookieConsent";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PushPermissionPrompt from "@/components/PushPermissionPrompt";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Toaster from "@/components/Toaster";
import UndoSnackbar from "@/components/UndoSnackbar";
import ShortcutHelp from "@/components/ShortcutHelp";
import WhatsNew from "@/components/WhatsNew";
import TabVisibility from "./_components/TabVisibility";
import SiteBanner from "./_components/SiteBanner";
import { getActiveBrand, brandCssVarsBlock } from "@/lib/runtime-brand";
import { getConsentCookie } from "@/lib/cookie-consent";
import { getLastSeenVersion } from "@/lib/changelog/last-seen";
import { getServerLocale } from "@/lib/locale/format";

/* Font subsetting: keep the shipped glyph payload minimal. We only
 * include "latin" — covers EN/FR/ES/DE plus most Western European
 * languages. Inter does not ship an Arabic subset; the ar-AE locale
 * falls back to system Arabic (San Francisco Arabic on iOS/macOS,
 * Segoe UI Arabic on Windows, Noto Naskh on Linux), which is the
 * preferred behaviour rather than shipping a heavy second family. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
  const consent = await getConsentCookie();
  const lastSeenWhatsNew = await getLastSeenVersion();
  const locale = await getServerLocale();
  const dir = locale.startsWith("ar") ? "rtl" : "ltr";
  // BCP-47-ish: server cookie stores "ar-AE", "en-US", etc.; <html lang>
  // wants the same shape.
  const htmlLang = locale.split("-")[0] ?? "en";
  // Supabase project origin — read from env so the preconnect points at
  // the actual project, not a placeholder.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const supabaseOrigin = (() => {
    if (!supabaseUrl) return null;
    try {
      return new URL(supabaseUrl).origin;
    } catch {
      return null;
    }
  })();

  return (
    <html
      lang={htmlLang}
      dir={dir}
      className={`${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {brandCss && (
          <style dangerouslySetInnerHTML={{ __html: brandCss }} />
        )}
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Resource hints — preconnect for origins we hit on every page,
         * dns-prefetch for origins we only hit on demand. Order matters
         * mildly: preconnect runs the full TLS handshake (slower to set
         * up but saves ~100-300ms on first byte); dns-prefetch is cheap.
         * Origins:
         *   - vercel.live: Vercel preview live-feedback toolbar (only on
         *     non-prod, but cheap to preconnect anyway)
         *   - googletagmanager.com: GA4 + GTM, loaded after consent
         *   - *.supabase.co: every authenticated request hits the api
         *     and storage subdomains; we list the project subdomain
         *     directly so the handshake can begin before the SDK loads
         *   - *.paddle.com: checkout overlay, only matters once user
         *     visits pricing — dns-prefetch is fine */}
        <link rel="preconnect" href="https://vercel.live" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
        <link rel="dns-prefetch" href="https://checkout.paddle.com" />
        <link rel="dns-prefetch" href="https://buy.paddle.com" />
        <link rel="dns-prefetch" href="https://cdn.paddle.com" />
        {/* Mobile-perf (Wave 4 Z2): explicit preload hints for the
         * first-paint assets.
         *
         *  - The PWA icon doubles as the hero brand mark on `/` (rendered
         *    as a small squircle next to the wordmark) and as the
         *    site-banner logo on every marketing page. It's also the
         *    OG/Twitter card image and the favicon — there is no path on
         *    spacefield where this file isn't requested in the first
         *    couple of seconds. SVG is tiny (~1 KB) so the preload cost
         *    is negligible vs the alternative of waiting for the layout
         *    to mount before the request kicks off.
         *
         *  - `next/font/google` (Inter, imported at the top of this
         *    file) auto-generates a <link rel="preload"> for its .woff2
         *    subset, so we deliberately don't duplicate that hint — the
         *    framework's preload runs at higher priority than anything
         *    we'd add manually. */}
        <link rel="preload" as="image" href="/icons/icon-192.svg" type="image/svg+xml" />
      </head>
      <body className="relative">
        <SiteBanner />
        <TabVisibility />
        <ThemeProvider>
          <CommandPaletteProvider>{children}</CommandPaletteProvider>
          <CookieConsent initialAccepted={consent !== null} />
          <PWAInstallPrompt />
          {/* Push permission card; listens for the
           * `spacefield:push-permission-prompt` window event so any far-
           * away component can fire it via firePushPermissionPrompt(). */}
          <PushPermissionPrompt />
          <Toaster />
          <UndoSnackbar />
          <ShortcutHelp />
          <WhatsNew lastSeen={lastSeenWhatsNew} />
        </ThemeProvider>
        <ServiceWorkerRegister />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
