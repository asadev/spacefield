"use client";

import { ReactNode, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import SolutionsHeader from "./SolutionsHeader";
import RelatedTools from "@/components/seo/RelatedTools";
import { relatedSolutionsTools } from "@/lib/seo/related-tools";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

interface ToolShellProps {
  category: string;
  title: string;
  description: string;
  children: ReactNode;
  /**
   * Pass the tool's slug to render a server-safe "related tools" grid
   * at the bottom of the page. Omit to skip. Accepts the slug of the
   * current tool — same-category peers are auto-picked.
   */
  slug?: string;
}

// Wraps every /solutions/tools/<slug> page: violet header, breadcrumb,
// consistent container.
export default function ToolShell(props: ToolShellProps) {
  return (
    <Suspense fallback={<ToolShellInner {...props} frame={false} />}>
      <ToolShellWithFrame {...props} />
    </Suspense>
  );
}

function ToolShellWithFrame(props: ToolShellProps) {
  const searchParams = useSearchParams();
  const frame = searchParams?.get("frame") === "1";
  return <ToolShellInner {...props} frame={frame} />;
}

function ToolShellInner({
  category,
  title,
  description,
  children,
  slug,
  frame,
}: ToolShellProps & { frame: boolean }) {
  // Derive the slug from the URL when callers don't pass one explicitly —
  // avoids editing 110+ tool pages just to surface related-tools cards.
  const pathname = usePathname() || "";
  const derivedSlug =
    slug ||
    (pathname.startsWith("/solutions/tools/")
      ? pathname.split("/")[3] || undefined
      : undefined);
  const related = derivedSlug ? relatedSolutionsTools(derivedSlug, 3) : [];

  // When iframed inside the /tools workspace desktop, the window chrome already
  // provides title/close/etc. — strip the page-level header, breadcrumb, and
  // related-tools block so only the tool itself renders inside the window.
  if (frame) {
    return (
      <section className="relative pb-8">
        <div className="mx-auto max-w-[1100px] px-4 pt-4 lg:px-8">
          {children}
        </div>
      </section>
    );
  }

  return (
    <>
      <SolutionsHeader label={category} title={title} description={description} />

      <section className="relative pb-24">
        <div className="mx-auto max-w-[1100px] px-6 lg:px-10">
          <motion.nav
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="mb-8 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/40"
          >
            <Link href="/solutions" className="transition-colors hover:text-white/70">
              Solutions
            </Link>
            <span>/</span>
            <Link
              href="/solutions/tools"
              className="transition-colors hover:text-white/70"
            >
              All Tools
            </Link>
            <span>/</span>
            <span className="text-white/70">{title}</span>
          </motion.nav>

          {children}

          {related.length > 0 && <RelatedTools items={related} variant="solutions" />}
        </div>
      </section>
    </>
  );
}
