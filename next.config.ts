import type { NextConfig } from "next";

// Build uses webpack (set in package.json::scripts.build = "next build
// --webpack"). Next 16.2.6 has a Turbopack root-inference regression
// that throws "couldn't find next/package.json" even with turbopack.root
// set; tracked for revisiting on a future Next release. Webpack builds
// 341 pages cleanly in ~75s.
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  /* config options here */
  // outputFileTracingRoot pins the file-tracing analyser to this project
  // root for both webpack + future-turbopack builds; prevents Next from
  // walking up the directory tree and treating a parent folder as the
  // workspace.
  outputFileTracingRoot: projectRoot,
  // A2 — browser source maps were enabled for prod debugging, but generating
  // full source maps for every chunk of a 358-page app forces webpack to hold
  // all of that map data in memory at once during compile, which was a major
  // contributor to the build OOM (SIGKILL) on Vercel's fixed 8 GB builder
  // (custom/larger build machines aren't available on this plan). Disabled to
  // bring peak build memory under 8 GB. Re-enable once the bundle is smaller or
  // the plan allows a bigger builder. (Cosmetic only — affects browser
  // dev-tools source mapping, not runtime behaviour.)
  productionBrowserSourceMaps: false,
  // Wave-3 WhatsApp routes tipped the serverless bundle over Vercel's 250 MB
  // per-function cap (api/whatsapp/broadcasts/[id] hit 250.06 MB) because
  // Next's output file trace pulls heavy CLIENT-ONLY deps (3D/canvas/
  // spreadsheet/doc/image libs) into every Node API function even though server
  // code never imports them. Exclude them from the /api trace — zero runtime
  // impact, drops the bundle well under the cap.
  outputFileTracingExcludes: {
    '/api/**': [
      'node_modules/three/**',
      'node_modules/@react-three/**',
      'node_modules/@univerjs/**',
      'node_modules/exceljs/**',
      'node_modules/docx/**',
      'node_modules/html2canvas-pro/**',
      'node_modules/mammoth/**',
      'node_modules/leaflet/**',
      'node_modules/opentype.js/**',
      'node_modules/qrcode/**',
      'node_modules/@tiptap/**',
      'node_modules/prosemirror-*/**',
      'node_modules/framer-motion/**',
      'node_modules/jszip/**',
      'node_modules/.pnpm/three@*/**',
      'node_modules/.pnpm/@react-three+*/**',
      'node_modules/.pnpm/@univerjs+*/**',
      'node_modules/.pnpm/exceljs@*/**',
      'node_modules/.pnpm/docx@*/**',
      'node_modules/.pnpm/html2canvas-pro@*/**',
      'node_modules/.pnpm/mammoth@*/**',
      'node_modules/.pnpm/leaflet@*/**',
      'node_modules/.pnpm/opentype.js@*/**',
      'node_modules/.pnpm/qrcode@*/**',
      'node_modules/.pnpm/@tiptap+*/**',
      'node_modules/.pnpm/prosemirror-*/**',
      'node_modules/.pnpm/framer-motion@*/**',
      'node_modules/.pnpm/jszip@*/**',
    ],
  },
  experimental: {
    optimizePackageImports: ['framer-motion'],
    // Cap server-action / inbound JSON bodies so attackers can't pin a
    // worker buffering 100 MB on every request. File-upload paths use
    // presigned URLs or stream straight to R2, not server actions, so
    // this ceiling is conservative.
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // The inbox v2 frontend (ConversationsTab.tsx is ~1.3k lines + realtime +
    // media) pushed the webpack production build past Vercel's fixed 8 GB
    // builder and the build worker was OOM-killed (SIGKILL) before it ever
    // reached type-checking — commits 16281f0 / 052af1d / 07b2535 all failed
    // this way while the backend-only c0ca37c built fine. A bigger build
    // machine isn't available on this plan, so the fix is purely lowering peak
    // build memory:
    //  1) webpackMemoryOptimizations — lowers peak webpack compile memory.
    //  2) cpus:2 — caps the static-generation worker pool. Each worker is a
    //     separate Node process holding the whole app in memory; the default
    //     (one per core) multiplied RSS past the limit.
    //  (see also productionBrowserSourceMaps:false above — the biggest single
    //   reduction, since per-chunk source maps were retained in memory.)
    webpackMemoryOptimizations: true,
    cpus: 2,
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

export default nextConfig;
// force rebuild
