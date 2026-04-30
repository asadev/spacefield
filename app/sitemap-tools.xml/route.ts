import { renderUrlset, xmlResponse } from "@/lib/seo/sitemap-sources";

export const dynamic = "force-dynamic";

export async function GET() {
  // Tool/app pages are no longer public SEO surfaces. Apps run only inside
  // the OS shell so workspace permissions, install rules, and limits stay
  // centralized. Keep this legacy sitemap route alive but empty for old
  // crawler references.
  return xmlResponse(renderUrlset([]));
}
