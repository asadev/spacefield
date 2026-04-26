"use client";

import { usePathname } from "next/navigation";
import RelatedTools from "./RelatedTools";
import { relatedReTools } from "@/lib/seo/related-tools";

/**
 * Bottom-of-page related tools footer for region /tools/[slug] pages.
 *
 * Mounted inside each region's /tools/layout.tsx so every tool gets a
 * schema-friendly, crawlable "next tool" trio without having to modify
 * 150+ individual tool pages. Hidden on the /tools index route.
 */
export default function RegionToolFooter({ regionPrefix }: { regionPrefix: string }) {
  const pathname = usePathname() || "";
  const base = regionPrefix ? `${regionPrefix}/tools/` : "/tools/";
  if (!pathname.startsWith(base)) return null;
  // pathname like /uk/tools/mortgage-calculator or /tools/mortgage-calculator/extra
  const rest = pathname.slice(base.length);
  if (!rest) return null; // index page
  const slug = rest.split("/")[0];
  if (!slug) return null;

  const related = relatedReTools(slug, regionPrefix, 3);
  if (!related.length) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-6 pb-20 lg:px-10">
      <RelatedTools items={related} variant="re" />
    </div>
  );
}
