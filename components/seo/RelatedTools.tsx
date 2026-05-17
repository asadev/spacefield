import Link from "next/link";
import type { RelatedTool } from "@/lib/seo/related-tools";

interface RelatedToolsProps {
  items: RelatedTool[];
  heading?: string;
  /**
   * Layout variant. "solutions" matches the /solutions violet/neutral
   * palette, "re" matches the real-estate emerald/amber pages. Both are
   * server-rendered so the schema-friendly <a> links stay in the HTML.
   */
  variant?: "solutions" | "re";
}

export default function RelatedTools({
  items,
  heading = "Related tools",
  variant = "solutions",
}: RelatedToolsProps) {
  if (!items.length) return null;

  const card =
    variant === "re"
      ? "group block border border-white/[0.08] bg-white/[0.03] p-5 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/[0.05]"
      : "group block border border-white/[0.08] bg-white/[0.03] p-5 transition-colors hover:border-violet-400/40 hover:bg-violet-500/[0.05]";

  return (
    <section
      aria-labelledby="related-tools-heading"
      className="mt-16 border-t border-white/[0.08] pt-10"
    >
      <h2
        id="related-tools-heading"
        className="mb-6 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-white/50"
      >
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <Link key={item.slug} href={item.href} className={card}>
            <div className="mb-2 text-sm font-semibold text-white">
              {item.title}
            </div>
            {item.description && (
              <p className="text-[0.78rem] leading-relaxed text-white/55">
                {item.description}
              </p>
            )}
            <span
              aria-hidden
              className="mt-3 inline-block text-[0.7rem] uppercase tracking-[0.2em] text-white/40 transition-colors group-hover:text-white/70"
            >
              Open →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
