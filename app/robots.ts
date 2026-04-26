import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/api/",
          "/auth/",
          "/dashboard/",
          "/cursor-demo",
          "/_next/",
        ],
      },
    ],
    sitemap: [
      "https://example.com/sitemap.xml",
      "https://example.com/sitemap-core.xml",
      "https://example.com/sitemap-tools.xml",
      "https://example.com/sitemap-blog.xml",
      "https://example.com/sitemap-network.xml",
    ],
    host: "https://example.com",
  };
}
