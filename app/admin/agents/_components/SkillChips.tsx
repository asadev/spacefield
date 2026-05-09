import Link from "next/link";

import type { AgentSkillBundle } from "../_data";

/**
 * Renders the agent's `allowed_skills` as deep-linked chips. Hover
 * reveals the skill description. Server component — pure render.
 *
 * Each chip links to `/admin/skills/[id]`. If the skill has no row in
 * `ai_skills` (code-defined skills not yet synced), we still link
 * (the skills route handles unknown ids) but mark the chip with a
 * dashed border so the admin sees it's an inferred entry.
 */
export default function SkillChips({
  skills,
}: {
  skills: AgentSkillBundle[];
}) {
  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-app bg-app p-3 text-xs text-faint">
        No skills attached. Use the Capabilities section above to add some.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((s) => (
        <Link
          key={s.id}
          href={`/admin/skills/${encodeURIComponent(s.id)}`}
          title={
            s.missing
              ? `${s.id} (no ai_skills row — link still resolves)`
              : (s.description || s.display_name)
          }
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
            s.missing
              ? "border border-dashed border-app bg-app text-secondary hover:border-tool-accent hover:text-app"
              : "border border-app bg-tool-accent-soft text-tool-accent hover:opacity-80"
          }`}
        >
          <code className="font-mono text-[11px]">{s.id}</code>
          {!s.missing && s.display_name !== s.id && (
            <span className="text-app/80">·</span>
          )}
          {!s.missing && s.display_name !== s.id && (
            <span className="text-app">{s.display_name}</span>
          )}
          <span className="text-faint">
            ({s.tools.length} tool{s.tools.length === 1 ? "" : "s"})
          </span>
        </Link>
      ))}
    </div>
  );
}
