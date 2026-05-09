import type { ToolSource } from "../_data";

/**
 * Colored chip for the tool source. Matches the contract:
 *   app-registry → blue
 *   skill-custom → violet
 *   skill-code   → amber
 */
export default function SourceChip({ source }: { source: ToolSource }) {
  const cls =
    source === "app-registry"
      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
      : source === "skill-custom"
        ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const label =
    source === "app-registry"
      ? "app-registry"
      : source === "skill-custom"
        ? "skill-custom"
        : "skill-code";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}
