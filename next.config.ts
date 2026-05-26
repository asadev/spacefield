import type { NextConfig } from "next";

// Build uses webpack (set in package.json::scripts.build = "next build
// --webpack"). Next 16.2.6 has a Turbopack root-inference regression
// that throws "couldn't find next/package.json" even with turbopack.root
// set; tracked for revisiting on a future Next release. Webpack builds
// 341 pages cleanly in ~75s.
const projectRoot = process.cwd();

// Lazy + optional wrapper for `@next/bundle-analyzer`. The dep itself is
// NOT in the production dependency tree — install it on demand:
//   pnpm add -D @next/bundle-analyzer
// then run `ANALYZE=1 pnpm build` to emit `analyze/{client,server}.html`.
// When ANALYZE is unset (the normal case) or the dep isn't installed,
// we silently fall through and return the un-wrapped config so dev/CI
// builds aren't impacted.
type ConfigWrapper = (cfg: NextConfig) => NextConfig;

function loadBundleAnalyzer(): ConfigWrapper | null {
  if (process.env.ANALYZE !== "1") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@next/bundle-analyzer") as
      | ((opts: { enabled: boolean }) => ConfigWrapper)
      | { default: (opts: { enabled: boolean }) => ConfigWrapper };
    const factory = typeof mod === "function" ? mod : mod.default;
    return factory({ enabled: true });
  } catch {
    // Dep not installed — bail silently so `next build` keeps working.
    return null;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  // outputFileTracingRoot pins the file-tracing analyser to this project
  // root for both webpack + future-turbopack builds; prevents Next from
  // walking up the directory tree and treating a parent folder as the
  // workspace.
  outputFileTracingRoot: projectRoot,
  // A2 — emit browser source maps in the prod bundle so Vercel-served
  // errors land on the original TypeScript line numbers in dev-tools.
  // No third-party upload (no Sentry release wiring here); the maps
  // ship alongside the JS chunks and are loaded by the browser on
  // demand when the dev-tools panel is open.
  productionBrowserSourceMaps: true,
  experimental: {
    optimizePackageImports: ['framer-motion'],
    // Cap server-action / inbound JSON bodies so attackers can't pin a
    // worker buffering 100 MB on every request. File-upload paths use
    // presigned URLs or stream straight to R2, not server actions, so
    // this ceiling is conservative.
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'example.com' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/auth/sign-in',
        destination: '/signin',
        permanent: false,
      },
      {
        source: '/dashboard',
        destination: '/',
        permanent: false,
      },
      {
        source: '/dashboard/:path*',
        destination: '/',
        permanent: false,
      },
      {
        source: '/network',
        destination: '/contact',
        permanent: false,
      },
      {
        source: '/network/apply',
        destination: '/contact',
        permanent: false,
      },
      {
        source: '/community/events',
        destination: '/',
        permanent: false,
      },
      {
        source: '/leaderboard',
        destination: '/',
        permanent: false,
      },
      {
        source: '/games',
        destination: '/',
        permanent: false,
      },
      {
        source: '/games/:path*',
        destination: '/',
        permanent: false,
      },
      {
        source: '/learn',
        destination: '/',
        permanent: false,
      },
      {
        source: '/learn/:path*',
        destination: '/',
        permanent: false,
      },
      {
        source: '/market',
        destination: '/?app=market-pulse',
        permanent: false,
      },
      {
        source: '/blog',
        destination: '/about',
        permanent: false,
      },
      {
        source: '/tools/what-can-i-afford',
        destination: '/?app=affordability',
        permanent: false,
      },
      {
        // (Files Manager retirement, Round D) The standalone tool route
        // is gone — the Launchpad covers every Files Manager surface
        // (upload, trash, rename, tags, share, preview, storage bar).
        // 301 anyone hitting the old /tools/files-manager URL — search
        // engines, deep links, share targets — to the workspace
        // desktop, where the Launchpad opens via ⌘K or the dock's
        // launcher.
        source: '/tools/files-manager',
        destination: '/?app=launchpad',
        permanent: false,
      },
      {
        // (Poster Creator rename, 2026-05-27) Tool renamed from
        // `property-poster-creator` → `poster-creator` so the tool can
        // serve every industry, not just real estate. Permanent 308 so
        // existing share-links, social posts, and bookmarks keep
        // working.
        source: '/tools/property-poster-creator',
        destination: '/tools/poster-creator',
        permanent: true,
      },
      {
        source: '/tools/property-poster-creator/:path*',
        destination: '/tools/poster-creator/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Global security headers. /embed/:path* overrides X-Frame-Options
        // and CSP further down so widgets can be embedded by third parties.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://buy.paddle.com" "https://checkout.paddle.com")',
          },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // App icons are static SVGs that never change between deploys
        // for a given filename. Vercel's default for /public is
        // `max-age=0, must-revalidate`, which means a 304 round-trip
        // per icon on every page load — and the Launcher/Dock fires
        // 100+ of those concurrently. Pin them immutable so they hit
        // the disk cache without revalidating.
        source: '/app-icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/wallpapers/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Embed widgets — allow framing from any origin so third-party sites
        // can embed them. Each iframe becomes a backlink + brand impression.
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

const wrap = loadBundleAnalyzer();
export default wrap ? wrap(nextConfig) : nextConfig;
// force rebuild
