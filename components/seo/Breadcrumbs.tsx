import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

export type Crumb = { name: string; url: string };

interface BreadcrumbsProps {
  items: Crumb[];
  /** Optional className override for the outer nav. */
  className?: string;
}

/**
 * Server-rendered breadcrumb trail + BreadcrumbList JSON-LD.
 *
 * The last item is treated as the current page (non-linked). Emits one
 * <script type="application/ld+json"> so Google can surface the trail as
 * a rich result.
 */
export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <>
      <nav
        aria-label="Breadcrumb"
        className={
          className ||
          "mb-8 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/40"
        }
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <span key={`${item.url}-${i}`} className="flex items-center gap-2">
              {isLast ? (
                <span className="text-white/70" aria-current="page">
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.url}
                  className="transition-colors hover:text-white/70"
                >
                  {item.name}
                </Link>
              )}
              {!isLast && <span aria-hidden>/</span>}
            </span>
          );
        })}
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  );
}
