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
          "/tools/",
          "/solutions/tools/",
          "/cursor-demo",
          "/_next/",
        ],
      },
    ],
    sitemap: [
      "https://spacefield.co/sitemap.xml",
    ],
    host: "https://spacefield.co",
  };
}
