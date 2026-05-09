import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime } from "../../../_lib";
import type { PromptLibraryRow, PromptVersionRow } from "../../../_types";
import PromptPlaygroundForm from "./_form";

export const dynamic = "force-dynamic";

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function detectVariables(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(body)) !== null) out.add(m[1]);
  return Array.from(out);
}

/**
 * Prompt rendering playground. Server component shell that loads the
 * prompt + its current version, detects `{{var}}` patterns, and hands
 * them to a client form. The form POSTs to the prompt-test API, which
 * substitutes vars and (optionally) calls a model.
 */
export default async function AdminPromptPlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const adminDb = createAdminClient();

  const [{ data: promptData, error: promptErr }, { data: versionData }] =
    await Promise.all([
      adminDb.from("prompt_library").select("*").eq("id", id).maybeSingle(),
      adminDb
        .from("prompt_versions")
        .select("*")
        .eq("prompt_id", id)
        .order("version", { ascending: false }),
    ]);
  if (promptErr) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load prompt: {promptErr.message}
      </div>
    );
  }
  const prompt = promptData as PromptLibraryRow | null;
  if (!prompt) notFound();

  const versions = (versionData ?? []) as PromptVersionRow[];
  const currentVersion = versions.find(
    (v) => v.version === prompt.current_version
  );

  const body = currentVersion?.body ?? "";
  const detected = detectVariables(body);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← {prompt.display_name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              Playground · {prompt.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              Substitute variables and optionally hit a model with the
              resolved prompt as a single user turn. Useful for tuning
              prompts before promoting a new version.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {prompt.id}
              </code>
              <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 font-mono text-[10px] text-tool-accent">
                v{prompt.current_version}
              </span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(prompt.updated_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              Edit prompt
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
          <PromptPlaygroundForm
            promptId={prompt.id}
            detectedVariables={detected}
            defaultModel="claude-sonnet-4-6"
          />
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">
                Current version body
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Read-only. Variables: {detected.length}.
              </p>
            </header>
            <pre className="max-h-96 overflow-auto rounded-md border border-app bg-app p-3 font-mono text-[11px] leading-relaxed text-secondary whitespace-pre-wrap">
              {body || "(empty)"}
            </pre>
          </section>

          {detected.length > 0 && (
            <section className="rounded-xl border border-app bg-app-elevated p-5">
              <header className="mb-2">
                <h2 className="text-sm font-semibold text-app">
                  Detected variables
                </h2>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((v) => (
                  <code
                    key={v}
                    className="rounded-md border border-app bg-app px-1.5 py-0.5 font-mono text-[11px] text-app"
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
