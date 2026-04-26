"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import SolutionsHeader from "../_components/SolutionsHeader";
import {
  SOLUTION_CATEGORIES,
  SOLUTION_TOOLS,
  type SolutionCategoryKey,
} from "../_data/tools";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type FilterKey = "all" | SolutionCategoryKey;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  ...SOLUTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

const CATEGORY_LABEL: Record<SolutionCategoryKey, string> = Object.fromEntries(
  SOLUTION_CATEGORIES.map((c) => [c.key, c.label])
) as Record<SolutionCategoryKey, string>;

export default function SolutionsToolsIndex() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const visibleTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOLUTION_TOOLS.filter((t) => {
      if (filter !== "all" && t.category !== filter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [filter, query]);

  return (
    <>
      <SolutionsHeader
        label="All Tools"
        title="The full index."
        description={`${SOLUTION_TOOLS.length} tools across ${SOLUTION_CATEGORIES.length} categories. Filter, search, or scroll.`}
      />

      <section className="relative pb-24">
        <div className="mx-auto max-w-[1200px] px-6 lg:px-10">
          {/* Controls */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md border px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.15em] transition-colors ${
                    filter === f.key
                      ? "border-violet-400/40 bg-violet-500/[0.14] text-violet-100"
                      : "border-white/[0.10] bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <label className="relative block">
              <span className="sr-only">Search tools</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools..."
                className="w-full rounded-md border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-sm text-white placeholder:text-white/30 transition-colors focus:border-violet-400/40 focus:outline-none lg:w-72"
              />
            </label>
          </div>

          <div className="mt-4 text-[0.65rem] uppercase tracking-[0.18em] text-white/40">
            {visibleTools.length} {visibleTools.length === 1 ? "tool" : "tools"}
            {filter !== "all" && ` in ${CATEGORY_LABEL[filter]}`}
          </div>

          {/* Grid */}
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {visibleTools.map((tool, i) => (
              <motion.div
                key={tool.slug}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.4), ease }}
              >
                <Link
                  href={`/solutions/tools/${tool.slug}`}
                  className="group relative block h-full overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.03] p-5 transition-colors hover:border-violet-400/30 hover:bg-white/[0.05]"
                >
                  <span className="pointer-events-none absolute left-0 top-0 h-4 w-4 border-l border-t border-violet-400/25" />
                  <span className="pointer-events-none absolute right-0 bottom-0 h-4 w-4 border-r border-b border-violet-400/15" />

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[0.55rem] uppercase tracking-[0.2em] text-violet-300/70">
                      {CATEGORY_LABEL[tool.category]}
                    </div>
                    {tool.teamEnabled && (
                      <span className="rounded border border-emerald-400/30 bg-emerald-400/[0.08] px-1.5 py-0.5 text-[0.5rem] uppercase tracking-[0.18em] text-emerald-200">
                        Team
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-base font-semibold tracking-tight text-white">
                    {tool.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    {tool.description}
                  </p>

                  <div className="mt-4 flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-white/50 transition-colors group-hover:text-violet-200">
                    <span>Open tool</span>
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {visibleTools.length === 0 && (
            <div className="mt-16 rounded-xl border border-white/[0.08] bg-white/[0.02] p-10 text-center text-sm text-white/50">
              No tools match your filters. Try a different category or clear the
              search.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
