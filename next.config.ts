import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // deploy pipeline test 2026-04-09
  experimental: {
    optimizePackageImports: ['framer-motion'],
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
        // (Files Manager retirement, Round D) The standalone tool route
        // is gone — the Launchpad covers every Files Manager surface
        // (upload, trash, rename, tags, share, preview, storage bar).
        // 301 anyone hitting the old /tools/files-manager URL — search
        // engines, deep links, share targets — to the workspace
        // desktop, where the Launchpad opens via ⌘K or the dock's
        // launcher.
        source: '/tools/files-manager',
        destination: '/tools',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
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
