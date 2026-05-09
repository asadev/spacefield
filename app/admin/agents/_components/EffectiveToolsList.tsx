import Link from "next/link";

import type { EffectiveTool } from "../_data";

/**
 * Renders the agent's effective tool inventory grouped by skill. Each
 * tool row links to `/admin/tools-catalog/[source]/[id]` so the admin
 * can drill into per-tool detail. Tools with overrides applied are
 * tagged so the admin can see which behaviours diverge from skill
 * defaults.
 *
 * Server component — pure render. The override editor lives in a
 * separate (client) component below this section.
 */
export default function EffectiveToolsList({
  tools,
}: {
  tools: EffectiveTool[];
}) {
  if (tools.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
        No tools resolved. Either no skills are attached, or all attached
        skills have empty <code className="mx-1 rounded bg-app-elevated px-1 font-mono">tools_json</code>.
      </div>
    );
  }

  // Group by skill_id so each skill renders as a header with its tools.
  const grouped = new Map<string, EffectiveTool[]>();
  for (const t of tools) {
    const arr = grouped.get(t.skill_id);
    if (arr) arr.push(t);
    else grouped.set(t.skill_id, [t]);
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([skillId, skillTools]) => {
        const overrideCount = skillTools.filter((t) => t.has_override).length;
        const disabledCount = skillTools.filter((t) => !t.enabled).length;
        const label = skillTools[0]?.skill_label ?? skillId;
        const missing = skillTools[0]?.skill_missing ?? false;
        return (
          <div
            key={skillId}
            className="overflow-hidden rounded-lg border border-app bg-app"
          >
            <div className="flex items-center justify-between gap-2 border-b border-app bg-app-elevated px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Link
                  href={`/admin/skills/${encodeURIComponent(skillId)}`}
                  className="font-mono text-app hover:text-tool-accent"
                >
                  {skillId}
                </Link>
                {!missing && label !== skillId && (
                  <>
                    <span className="text-faint">·</span>
                    <span className="text-secondary">{label}</span>
                  </>
                )}
                {missing && (
                  <span className="rounded-full border border-dashed border-app px-2 py-0.5 text-[10px] text-faint">
                    no ai_skills row
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                <span className="text-muted">
                  {skillTools.length} tool{skillTools.length === 1 ? "" : "s"}
                </span>
                {overrideCount > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                    {overrideCount} override{overrideCount === 1 ? "" : "s"}
                  </span>
                )}
                {disabledCount > 0 && (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-500">
                    {disabledCount} disabled
                  </span>
                )}
              </div>
            </div>
            <ul className="divide-y divide-app">
              {skillTools.map((t) => (
                <li key={`${t.skill_id}::${t.tool_name}`} className="px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Tools-catalog link. Resolved by Agent I's
                            route at `/admin/tools-catalog/[source]/[id]`.
                            We use 'skill-custom' source for db-backed
                            skills (the common case). */}
                        <Link
                          href={`/admin/tools-catalog/skill-custom/${encodeURIComponent(
                            t.tool_name
                          )}`}
                          className="font-mono text-xs text-app hover:text-tool-accent"
                        >
                          {t.tool_name}
                        </Link>
                        {!t.enabled && (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-500">
                            disabled
                          </span>
                        )}
                        {t.has_override && t.enabled && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                            override
                          </span>
                        )}
                        {t.read_only && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-500">
                            read-only
                          </span>
                        )}
                        {t.requires_confirmation && (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sky-500 dark:text-sky-400">
                            confirm
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <div className="mt-1 text-xs text-secondary">
                          {t.description}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
