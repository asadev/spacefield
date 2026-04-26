import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { getTool } from "./tools";

export function toolMetadata(slug: string): Metadata {
  const t = getTool(slug);
  if (!t) return pageMeta(`/solutions/tools/${slug}`, "Tool", "");
  return pageMeta(`/solutions/tools/${slug}`, t.title, t.description);
}
