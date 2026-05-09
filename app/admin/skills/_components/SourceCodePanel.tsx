/**
 * Read-only source-code panel for code-defined skills. Renders the raw
 * TypeScript text inside a <pre> with HTML escaping so we never inject
 * arbitrary content into the page (the panel is admin-only but defense
 * in depth is cheap).
 *
 * Server component — fs reads happen at render time. Caller passes the
 * source already loaded via `readSkillSource()` so this stays a pure
 * presentational component.
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type SourceCodePanelProps = {
  /** Skill kind. Custom skills don't have a source file. */
  kind: "code" | "custom";
  handlerModule: string | null;
  /** Resolved file path (relative to repo root). null when not found. */
  path: string | null;
  /** UTF-8 source text. null when no file was found. */
  source: string | null;
};

const PANEL_WRAP =
  "rounded-xl border border-app bg-app-elevated p-5 space-y-3";

export default function SourceCodePanel({
  kind,
  handlerModule,
  path,
  source,
}: SourceCodePanelProps) {
  if (kind !== "code") {
    return (
      <section className={PANEL_WRAP}>
        <header>
          <h2 className="text-sm font-semibold text-app">Source code</h2>
          <p className="mt-0.5 text-xs text-muted">
            This is a custom (admin-defined) skill — there&apos;s no source
            file to inspect. Tool implementations live entirely in the row
            below as JSON dispatch targets.
          </p>
        </header>
      </section>
    );
  }

  if (!source || !path) {
    return (
      <section className={PANEL_WRAP}>
        <header>
          <h2 className="text-sm font-semibold text-app">Source code</h2>
          <p className="mt-0.5 text-xs text-muted">
            Could not find a TypeScript module for this skill. Looked for{" "}
            <code className="font-mono text-app">
              {handlerModule ?? "(handler_module empty)"}
            </code>{" "}
            (and the conventional fallback paths).
          </p>
          <p className="mt-2 text-[11px] text-faint">
            If this is a code skill, ensure the handler_module column on
            the row points at a file that exists in this build.
          </p>
        </header>
      </section>
    );
  }

  const lineCount = source.split("\n").length;
  const escaped = escapeHtml(source);

  return (
    <section className={PANEL_WRAP}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app">Source code</h2>
          <p className="mt-0.5 text-xs text-muted">
            Read-only view of the actual TypeScript module the runtime
            imports for this skill.{" "}
            <span className="text-faint">
              Editing source requires a deploy — change the file in your
              editor, push, redeploy.
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[11px] text-faint">
          <code className="font-mono text-secondary">{path}</code>
          <span>
            {lineCount} lines · {source.length.toLocaleString()} chars
          </span>
        </div>
      </header>
      <div className="rounded-lg border border-app bg-app">
        <pre
          className="max-h-[28rem] overflow-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-app"
          // Escaped server-side via escapeHtml. We intentionally use
          // dangerouslySetInnerHTML so the <pre> renders the file with
          // its line breaks intact and without React converting the
          // string. Don't change this without keeping escapeHtml() in
          // place above.
          dangerouslySetInnerHTML={{ __html: escaped }}
        />
      </div>
    </section>
  );
}
