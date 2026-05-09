import Link from "next/link";
import { notFound } from "next/navigation";

import { readCodeSkillTools } from "@/lib/agent/skills/_inspector";
import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../../_lib";
import type { AiSkillRow } from "../../../_types";
import SkillPlaygroundForm from "./_form";

export const dynamic = "force-dynamic";

/**
 * Live invocation playground for a skill. Renders one form per tool the
 * skill exposes. For custom skills the input form is generated from the
 * tool's input_schema; for code skills we list the tool names from the
 * registry but use a generic JSON box (the schemas are tied to source).
 *
 * The form POSTs to /api/admin/playground/skill-invoke which dispatches
 * RPC handlers when safe and returns a description otherwise.
 */
export default async function AdminSkillPlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const adminDb = createAdminClient();
  const { data: skillData, error } = await adminDb
    .from("ai_skills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load skill: {error.message}
      </div>
    );
  }
  const skill = skillData as AiSkillRow | null;
  if (!skill) notFound();

  const isCode = skill.kind === "code";
  const codeTools = isCode ? await readCodeSkillTools(skill.id) : null;
  const codeToolNames = codeTools?.tools.map((t) => t.name) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/skills/${encodeURIComponent(skill.id)}`}
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← {skill.display_name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              Playground · {skill.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              Invoke a tool with sample input. RPC tools dispatch live; code
              + HTTP handlers return a dispatch description so the
              playground stays side-effect-free.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {skill.id}
              </code>
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {skill.kind}
              </code>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(skill.updated_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/skills/${encodeURIComponent(skill.id)}`}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              Edit skill
            </Link>
            <Link
              href="/admin/playground"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              All playgrounds
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <SkillPlaygroundForm
            skillId={skill.id}
            skillKind={skill.kind}
            tools={skill.tools_json ?? []}
            codeToolNames={codeToolNames}
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Skill summary</h2>
            </header>
            <dl className="space-y-2 text-xs">
              <Detail label="Kind">
                <code className="font-mono text-app">{skill.kind}</code>
              </Detail>
              <Detail label="Status">
                <code className="font-mono text-app">{skill.status}</code>
              </Detail>
              <Detail label="Category">
                <span className="text-app">{skill.category}</span>
              </Detail>
              <Detail label="Tools">
                <span className="font-mono text-app">
                  {skill.kind === "code"
                    ? codeToolNames.length
                    : skill.tools_json?.length ?? 0}
                </span>
              </Detail>
            </dl>
            {skill.system_fragment && (
              <div className="mt-3 border-t border-app pt-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  System fragment
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-app bg-app p-2 font-mono text-[11px] leading-relaxed text-secondary">
                  {skill.system_fragment}
                </pre>
              </div>
            )}
          </section>

          {isCode && (
            <section className="rounded-xl border border-tool-accent/30 bg-tool-accent-soft p-4 text-xs text-app">
              <strong className="font-semibold">Code-defined skill.</strong>{" "}
              Tools live in <code className="font-mono">{skill.handler_module}</code>.
              The playground does not import the handler — it only resolves
              the tool name. Use a dev workspace for real execution.
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
