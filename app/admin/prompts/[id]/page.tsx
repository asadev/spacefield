import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { formatDateTime, fetchAuthUsersByIds } from "../../_lib";
import type { PromptLibraryRow, PromptVersionRow } from "../../_types";
import {
  createVersion,
  deletePrompt,
  deleteVersion,
  promoteVersion,
  setStatus,
  updatePrompt,
} from "../_actions";
import DiffView from "../_components/DiffView";
import NewVersionForm from "../_components/NewVersionForm";
import PromptForm from "../_components/PromptForm";
import StatusChip from "../_components/StatusChip";

export const dynamic = "force-dynamic";

/**
 * Per-prompt editor. Layout:
 *   - Header: id, status, current version chip, quick status flip.
 *   - Metadata form: display_name, description, category, tags, status.
 *   - Version history: every prompt_versions row, each with a "promote"
 *     button (when not current) and a delete button (when not current).
 *   - Diff view: server param `?compare=v1,v2` renders a unified diff
 *     between the two versions.
 *   - New version: textarea pre-filled with current body, optional
 *     promote-on-save toggle.
 */

type SearchParams = {
  compare?: string;
};

export default async function AdminPromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const search = await searchParams;

  const admin = createAdminClient();
  const [promptRes, versionsRes] = await Promise.all([
    admin.from("prompt_library").select("*").eq("id", id).maybeSingle(),
    admin
      .from("prompt_versions")
      .select("*")
      .eq("prompt_id", id)
      .order("version", { ascending: false }),
  ]);

  if (promptRes.error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">
        Failed to load prompt: {promptRes.error.message}
      </div>
    );
  }
  const prompt = promptRes.data as PromptLibraryRow | null;
  if (!prompt) notFound();

  const versions = (versionsRes.data ?? []) as PromptVersionRow[];

  // Resolve created_by emails for the version history table.
  const creatorIds = Array.from(
    new Set(versions.map((v) => v.created_by).filter((v): v is string => !!v))
  );
  const creators = await fetchAuthUsersByIds(creatorIds);

  // Current version row (for diff baseline + new-version prefill).
  const currentVersion = versions.find(
    (v) => v.version === prompt.current_version
  );

  // Diff: parse `compare=v3,v5` (or `3,5`) — accept either form.
  const compareSelection = parseCompare(search.compare);
  const beforeVer = compareSelection
    ? versions.find((v) => v.version === compareSelection.before)
    : undefined;
  const afterVer = compareSelection
    ? versions.find((v) => v.version === compareSelection.after)
    : undefined;
  const diffReady = compareSelection && beforeVer && afterVer;

  // Quick status flip — same UX as agents/skills/workflows.
  const nextStatus = (
    {
      live: "archived",
      draft: "live",
      archived: "draft",
    } as const
  )[prompt.status];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/prompts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Prompt library
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-app">
              {prompt.display_name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-secondary">
              {prompt.description || (
                <span className="text-faint">No description.</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <code className="rounded-md border border-app bg-app px-2 py-1 font-mono">
                {prompt.id}
              </code>
              <StatusChip status={prompt.status} />
              <span className="rounded-full bg-tool-accent-soft px-2 py-0.5 font-mono text-[10px] text-tool-accent">
                current v{prompt.current_version}
              </span>
              <span className="rounded-full border border-app bg-app-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary">
                {prompt.category}
              </span>
              <span className="text-faint">·</span>
              <span>
                {versions.length} version{versions.length === 1 ? "" : "s"}
              </span>
              <span className="text-faint">·</span>
              <span>updated {formatDateTime(prompt.updated_at)}</span>
            </div>
          </div>

          {/* Quick status flip */}
          <form action={setStatus} className="flex items-center gap-2">
            <input type="hidden" name="id" value={prompt.id} />
            <input type="hidden" name="status" value={nextStatus} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app-elevated px-3 py-1.5 text-xs text-app transition-colors hover:border-tool-accent"
            >
              {prompt.status === "live"
                ? "Archive"
                : prompt.status === "draft"
                  ? "Publish (live)"
                  : "Move to draft"}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor column */}
        <div className="min-w-0 space-y-6">
          <PromptForm mode="edit" action={updatePrompt} prompt={prompt} />

          {/* Diff view (renders only when ?compare=a,b is present and valid) */}
          {compareSelection && (
            <section className="space-y-3 rounded-xl border border-app bg-app-elevated p-5">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-app">
                    Diff — v{compareSelection.before} vs v{compareSelection.after}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Unified line-diff of the two versions&apos; bodies.
                  </p>
                </div>
                <Link
                  href={`/admin/prompts/${encodeURIComponent(prompt.id)}`}
                  className="text-[11px] text-faint transition-colors hover:text-app"
                >
                  Close diff
                </Link>
              </header>
              {!diffReady ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                  One or both versions ({compareSelection.before},{" "}
                  {compareSelection.after}) don&apos;t exist on this prompt.
                </p>
              ) : (
                <DiffView
                  before={beforeVer.body}
                  after={afterVer.body}
                  beforeLabel={`v${compareSelection.before}`}
                  afterLabel={`v${compareSelection.after}`}
                />
              )}
            </section>
          )}

          {/* New version */}
          <NewVersionForm
            promptId={prompt.id}
            currentBody={currentVersion?.body ?? ""}
            currentVariables={currentVersion?.variables ?? []}
            action={createVersion}
          />

          {/* Danger zone */}
          <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
            <header>
              <h2 className="text-sm font-semibold text-rose-500">
                Danger zone
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Hard delete removes the prompt row and every associated
                version. Archive instead if other systems reference it by id.
              </p>
            </header>
            <form action={deletePrompt}>
              <input type="hidden" name="id" value={prompt.id} />
              <button
                type="submit"
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-500 transition-opacity hover:opacity-80"
              >
                Delete prompt
              </button>
            </form>
          </section>
        </div>

        {/* Sidebar — version history + summary */}
        <aside className="min-w-0 space-y-4">
          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">Summary</h2>
            </header>
            <dl className="space-y-2 text-xs">
              <Detail label="Status">
                <StatusChip status={prompt.status} />
              </Detail>
              <Detail label="Current version">
                <span className="font-mono text-app">
                  v{prompt.current_version}
                </span>
              </Detail>
              <Detail label="Category">
                <span className="text-app">{prompt.category}</span>
              </Detail>
              <Detail label="Versions">
                <span className="font-mono text-app">{versions.length}</span>
              </Detail>
              <Detail label="Created">
                <span className="font-mono text-[11px] text-app">
                  {formatDateTime(prompt.created_at)}
                </span>
              </Detail>
              <Detail label="Updated">
                <span className="font-mono text-[11px] text-app">
                  {formatDateTime(prompt.updated_at)}
                </span>
              </Detail>
            </dl>
            {currentVersion && currentVersion.variables.length > 0 && (
              <div className="mt-4 border-t border-app pt-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">
                  Variables (current)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentVersion.variables.map((v) => (
                    <code
                      key={v}
                      className="rounded-md border border-app bg-app px-1.5 py-0.5 font-mono text-[11px] text-app"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-app bg-app-elevated p-5">
            <header className="mb-3">
              <h2 className="text-sm font-semibold text-app">
                Version history
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                Newest first. Compare any two versions via the
                <code className="font-mono"> compare </code>links below.
              </p>
            </header>

            {versions.length === 0 ? (
              <div className="rounded-md border border-dashed border-app bg-app/40 px-3 py-6 text-center text-[11px] text-faint">
                No versions yet
              </div>
            ) : (
              <ul className="divide-y divide-app">
                {versions.map((v) => {
                  const isCurrent = v.version === prompt.current_version;
                  const creator = v.created_by
                    ? creators.get(v.created_by)
                    : null;
                  const excerpt =
                    v.body.length > 160
                      ? `${v.body.slice(0, 160)}…`
                      : v.body;
                  // Compare against current_version unless this IS the current
                  // version, in which case compare against v-1 if available.
                  const compareTarget = isCurrent
                    ? prompt.current_version > 1
                      ? prompt.current_version - 1
                      : null
                    : prompt.current_version;
                  const compareHref = compareTarget
                    ? `/admin/prompts/${encodeURIComponent(prompt.id)}?compare=${compareTarget},${v.version}`
                    : null;

                  return (
                    <li key={v.version} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${
                            isCurrent
                              ? "bg-tool-accent-soft text-tool-accent"
                              : "border border-app bg-app text-secondary"
                          }`}
                        >
                          v{v.version}
                        </span>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                            current
                          </span>
                        )}
                        <span className="text-[11px] text-faint">
                          {formatDateTime(v.created_at)}
                        </span>
                      </div>
                      {creator?.email && (
                        <div className="mt-1 text-[11px] text-muted">
                          by {creator.email}
                        </div>
                      )}
                      {v.notes && (
                        <div className="mt-1 text-[11px] text-secondary">
                          {v.notes}
                        </div>
                      )}
                      <pre className="mt-2 max-h-24 overflow-hidden rounded-md border border-app bg-app p-2 font-mono text-[10px] text-secondary">
                        {excerpt}
                      </pre>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {compareHref && (
                          <Link
                            href={compareHref}
                            className="rounded-md border border-app bg-app-elevated px-2 py-0.5 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app"
                          >
                            Compare
                          </Link>
                        )}
                        {!isCurrent && (
                          <form action={promoteVersion} className="inline">
                            <input
                              type="hidden"
                              name="id"
                              value={prompt.id}
                            />
                            <input
                              type="hidden"
                              name="version"
                              value={v.version}
                            />
                            <button
                              type="submit"
                              className="rounded-md border border-tool-accent/30 bg-tool-accent-soft px-2 py-0.5 text-[11px] text-tool-accent transition-opacity hover:opacity-80"
                            >
                              Promote to current
                            </button>
                          </form>
                        )}
                        {!isCurrent && (
                          <form action={deleteVersion} className="inline">
                            <input
                              type="hidden"
                              name="id"
                              value={prompt.id}
                            />
                            <input
                              type="hidden"
                              name="version"
                              value={v.version}
                            />
                            <button
                              type="submit"
                              title="Delete this version"
                              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-500 transition-opacity hover:opacity-80"
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
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

/**
 * Parse a `compare` query param. Accepted forms:
 *   - "v1,v3"
 *   - "1,3"
 *   - "v1, v3" (whitespace-tolerant)
 * Returns null if the value can't be parsed into two distinct positive
 * integers.
 */
function parseCompare(
  raw: string | undefined
): { before: number; after: number } | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim().replace(/^v/i, ""))
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === b) return null;
  return { before: a, after: b };
}
