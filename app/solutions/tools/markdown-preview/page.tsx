"use client";

import { useEffect, useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";
import ToolCard, { inputCls } from "../../_components/ToolCard";
import { safeHref } from "@/lib/safe-href";

const STORAGE_KEY = "aiq:md-preview:draft";
const MODE_LS_KEY = "aiq:md-preview:mode:v1";

const DEFAULT_MD = `# Markdown Preview

A lightweight **GFM-flavored** preview. Type on the left, see HTML on the right.

## Features

- Headings, *emphasis*, **strong**, ~~strike~~
- Lists (ordered + unordered)
- [x] Task items
- [ ] Checkboxes
- \`inline code\` and fenced code blocks
- [Links](https://spacefield.co) and images
- Tables

\`\`\`js
function greet(name) {
  return "hello, " + name;
}
\`\`\`

| Col A | Col B | Col C |
| ----- | ----- | ----- |
| one   | two   | three |
| four  | five  | six   |

> Blockquotes work too.
`;

// Tiny markdown parser — handles common cases, not perfect.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// SB-012: only allow http(s)/mailto/tel/path/fragment URLs into href/src.
// Escaping alone doesn't stop `javascript:` self-XSS — even though the
// preview lives in the user's own browser, an exported HTML doc with
// `<a href="javascript:...">` would fire for anyone who opens it.
function safeUrlAttr(raw: string): string {
  const safe = safeHref(raw);
  return safe ? escapeHtml(safe) : "#";
}

function inlineMd(s: string): string {
  // images first so ![x](y) doesn't get eaten by link regex
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    return `<img alt="${escapeHtml(alt)}" src="${safeUrlAttr(src)}" class="max-w-full rounded-lg" />`;
  });
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, href) => {
    return `<a href="${safeUrlAttr(href)}" class="text-tool-accent underline hover:opacity-80" target="_blank" rel="noreferrer">${txt}</a>`;
  });
  // inline code
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    return `<code class="rounded bg-tool-accent-soft px-1 py-0.5 font-mono text-[0.85em] text-tool-accent">${escapeHtml(code)}</code>`;
  });
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // italic
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/(?<!\w)_([^_]+)_(?!\w)/g, "<em>$1</em>");
  // strike
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s;
}

function renderMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let inList: null | "ul" | "ol" = null;
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] || "";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      out.push(
        `<pre class="my-4 overflow-auto rounded-lg border border-app bg-app p-4 font-mono text-xs leading-relaxed"><code class="text-app" data-lang="${escapeHtml(
          lang,
        )}">${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // table: header | separator | rows
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*[:-]+[\s|:-]+$/.test(lines[i + 1])) {
      closeList();
      const header = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      let html = `<table class="my-4 w-full border-collapse text-sm"><thead><tr>`;
      header.forEach((h) => {
        html += `<th class="border border-app bg-app px-3 py-2 text-left font-semibold text-app">${inlineMd(escapeHtml(h))}</th>`;
      });
      html += `</tr></thead><tbody>`;
      rows.forEach((r) => {
        html += `<tr>`;
        r.forEach((c) => {
          html += `<td class="border border-app px-3 py-2 text-secondary">${inlineMd(escapeHtml(c))}</td>`;
        });
        html += `</tr>`;
      });
      html += `</tbody></table>`;
      out.push(html);
      continue;
    }

    // headings
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const sz = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"][level - 1];
      out.push(
        `<h${level} class="mt-6 mb-3 font-semibold tracking-tight text-tool-accent ${sz}">${inlineMd(escapeHtml(heading[2]))}</h${level}>`,
      );
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      closeList();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="my-4 border-l-4 border-tool-accent bg-tool-accent-soft py-2 pl-4 italic text-secondary">${inlineMd(escapeHtml(quoteLines.join(" ")))}</blockquote>`,
      );
      continue;
    }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line) || /^\s*\*\*\*+\s*$/.test(line)) {
      closeList();
      out.push(`<hr class="my-6 border-app" />`);
      i++;
      continue;
    }

    // task list items
    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      if (inList !== "ul") {
        closeList();
        out.push(`<ul class="my-3 ml-6 list-none space-y-1.5">`);
        inList = "ul";
      }
      const checked = task[1].toLowerCase() === "x";
      out.push(
        `<li class="text-secondary"><input type="checkbox" ${checked ? "checked" : ""} disabled class="mr-2 accent-tool-accent" />${inlineMd(escapeHtml(task[2]))}</li>`,
      );
      i++;
      continue;
    }

    // unordered
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (inList !== "ul") {
        closeList();
        out.push(`<ul class="my-3 ml-6 list-disc space-y-1.5">`);
        inList = "ul";
      }
      out.push(`<li class="text-secondary">${inlineMd(escapeHtml(ul[1]))}</li>`);
      i++;
      continue;
    }

    // ordered
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (inList !== "ol") {
        closeList();
        out.push(`<ol class="my-3 ml-6 list-decimal space-y-1.5">`);
        inList = "ol";
      }
      out.push(`<li class="text-secondary">${inlineMd(escapeHtml(ol[1]))}</li>`);
      i++;
      continue;
    }

    // blank
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    // paragraph: gather until blank
    closeList();
    const para: string[] = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>\s|-\s|\*\s|\+\s|\d+\.\s|\|)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p class="my-3 leading-[1.75] text-secondary">${inlineMd(escapeHtml(para.join(" ")))}</p>`);
  }
  closeList();
  return out.join("\n");
}

function slugifyHeading(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function extractToc(md: string): { level: number; text: string; slug: string }[] {
  const out: { level: number; text: string; slug: string }[] = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const text = m[2].trim();
      out.push({ level: m[1].length, text, slug: slugifyHeading(text) });
    }
  }
  return out;
}

function wordStats(md: string) {
  const stripped = md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "").replace(/[#*_~>[\](){}-]/g, " ");
  const words = stripped.split(/\s+/).filter((w) => /\w/.test(w));
  const chars = md.length;
  const charsNoSpaces = md.replace(/\s/g, "").length;
  const readingMinutes = Math.max(1, Math.round(words.length / 225));
  return { words: words.length, chars, charsNoSpaces, readingMinutes };
}

function buildStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c])}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif; max-width: 780px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #222; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #ddd; background: #111; } a { color: #a78bfa; } }
  h1, h2, h3, h4, h5, h6 { margin-top: 2rem; line-height: 1.25; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.9em; }
  @media (prefers-color-scheme: dark) { pre { background: #1c1c1c; } }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
  blockquote { border-left: 3px solid #a78bfa; padding-left: 1rem; color: #666; margin-left: 0; }
  img { max-width: 100%; height: auto; }
  @media print { body { max-width: 100%; color: #000; background: #fff; } }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

type ViewMode = "edit" | "preview" | "split";

export default function MarkdownPreviewPage() {
  const [md, setMd] = useState<string>(DEFAULT_MD);
  const [loaded, setLoaded] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [mode, setMode] = useState<ViewMode>("split");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMd(saved);
      const m = localStorage.getItem(MODE_LS_KEY);
      if (m === "edit" || m === "preview" || m === "split") setMode(m as ViewMode);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, md);
      localStorage.setItem(MODE_LS_KEY, mode);
    } catch {}
  }, [md, mode, loaded]);

  const html = useMemo(() => renderMarkdown(md), [md]);
  const toc = useMemo(() => extractToc(md), [md]);
  const stats = useMemo(() => wordStats(md), [md]);

  const lineCount = useMemo(() => md.split(/\r?\n/).length, [md]);

  const copy = (text: string) => navigator.clipboard?.writeText(text);

  const wrapSelection = (before: string, after: string = before) => {
    const ta = document.getElementById("md-source") as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = md.slice(start, end);
    const next = md.slice(0, start) + before + selected + after + md.slice(end);
    setMd(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
    });
  };

  const insertLine = (prefix: string) => {
    const ta = document.getElementById("md-source") as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const before = md.slice(0, start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const next = md.slice(0, lineStart) + prefix + md.slice(lineStart);
    setMd(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    });
  };

  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = () => {
    const title = toc[0]?.text || "Document";
    const plain = md;
    const stripped = renderMarkdown(plain)
      .replace(/ class="[^"]*"/g, "")
      .replace(/<h(\d)([^>]*)>(.*?)<\/h\1>/g, (_m, lvl, _attr, txt) => {
        const t = String(txt).replace(/<[^>]+>/g, "");
        const slug = slugifyHeading(t);
        return `<h${lvl} id="${slug}">${txt}</h${lvl}>`;
      });
    const blob = new Blob([buildStandaloneHtml(title, stripped)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const insertToc = () => {
    const tocMd = toc
      .filter((h) => h.level > 1 && h.level <= 3)
      .map((h) => `${"  ".repeat(h.level - 2)}- [${h.text}](#${h.slug})`)
      .join("\n");
    setMd((prev) => `${tocMd}\n\n${prev}`);
  };

  const docSlug = useMemo(() => {
    const first = toc[0]?.text || "untitled";
    return first.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  }, [toc]);

  const formatBtn =
    "rounded-lg border border-app bg-app-elevated px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent";

  return (
    <div data-tool-theme="content" data-tool="markdown-preview">
      <ToolShell
        category="Data & Developer"
        title="Markdown Preview"
        description="Live split-pane markdown editor with GFM tables, checkboxes, strikethrough, and code blocks. Autosaves to your browser."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              md
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              gfm
            </span>
            <div className="ml-1 flex flex-1 items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
              <span className="text-tool-accent">▸</span>
              docs.workspace
              <span className="text-faint">/</span>
              <span className="text-secondary">{docSlug || "untitled"}.md</span>
            </div>
            <div className="font-mono text-[0.6rem] text-muted">
              {loaded ? "◉ autosaved" : ""}
            </div>
          </div>

          <div className="relative p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
                  Document workspace · live preview
                </div>

                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-app md:text-3xl">
                  Write in markdown, render to paper
                </h2>
                <p className="mt-2 max-w-xl text-sm text-secondary">
                  Source on the left, typeset preview on the right. Everything lives in your browser.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    {stats.words.toLocaleString()} words
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    {stats.chars.toLocaleString()} chars
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    ~{stats.readingMinutes} min read
                  </span>
                  <span className="rounded-md border border-app bg-app px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
                    {lineCount} lines
                  </span>
                </div>
              </div>

              {/* Reading meter dial */}
              <div className="flex items-center gap-3 rounded-xl border border-app bg-app px-3 py-2">
                <div className="relative h-12 w-12">
                  <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="var(--tool-accent)"
                      strokeWidth="3"
                      strokeDasharray={`${Math.min(100, (stats.words / 1000) * 100)}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] font-bold text-tool-accent">
                    {stats.readingMinutes}m
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted">
                    Reading
                  </div>
                  <div className="text-sm font-semibold text-app">
                    {stats.words.toLocaleString()} w
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* sub-tab strip */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-app bg-app px-4 py-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
              {(
                [
                  { k: "edit", label: "Edit" },
                  { k: "split", label: "Split" },
                  { k: "preview", label: "Preview" },
                ] as { k: ViewMode; label: string }[]
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setMode(t.k)}
                  className={`px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                    mode === t.k
                      ? "bg-tool-accent-soft text-tool-accent"
                      : "text-secondary hover:text-app"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => copy(md)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy MD
              </button>
              <button
                onClick={() => copy(html)}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Copy HTML
              </button>
              <button
                onClick={download}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Download .md
              </button>
              <button
                onClick={downloadHtml}
                className="rounded-lg bg-tool-accent px-3 py-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] transition-opacity hover:opacity-90"
                style={{ color: "var(--bg)" }}
              >
                Export HTML
              </button>
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-app bg-app-elevated px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary transition-colors hover:border-tool-accent hover:text-tool-accent"
              >
                Print
              </button>
            </div>
          </div>
        </section>

        {/* ============================== PANES ============================== */}
        <div
          className={`grid gap-6 ${
            mode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {(mode === "edit" || mode === "split") && (
            <ToolCard title="Source" subtitle="Markdown editor">
              {/* Format toolbar */}
              <div className="mb-3 rounded-lg border border-app bg-app-elevated p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    Format
                  </span>
                  <button onClick={() => insertLine("# ")} className={formatBtn} title="Heading 1">H1</button>
                  <button onClick={() => insertLine("## ")} className={formatBtn} title="Heading 2">H2</button>
                  <button onClick={() => insertLine("### ")} className={formatBtn} title="Heading 3">H3</button>
                  <span className="mx-1 h-4 w-px bg-app" />
                  <button onClick={() => wrapSelection("**")} className={formatBtn} title="Bold"><span className="font-bold">B</span></button>
                  <button onClick={() => wrapSelection("*")} className={formatBtn} title="Italic"><span className="italic">I</span></button>
                  <button onClick={() => wrapSelection("~~")} className={formatBtn} title="Strikethrough"><span className="line-through">S</span></button>
                  <button onClick={() => wrapSelection("`")} className={formatBtn} title="Inline code">{"</>"}</button>
                  <span className="mx-1 h-4 w-px bg-app" />
                  <button onClick={() => insertLine("- ")} className={formatBtn} title="Bullet list">•</button>
                  <button onClick={() => insertLine("1. ")} className={formatBtn} title="Numbered">1.</button>
                  <button onClick={() => insertLine("- [ ] ")} className={formatBtn} title="Task">[ ]</button>
                  <button onClick={() => insertLine("> ")} className={formatBtn} title="Quote">&ldquo;</button>
                  <button onClick={() => wrapSelection("\n```\n", "\n```\n")} className={formatBtn} title="Code block">{"{ }"}</button>
                  <button onClick={() => wrapSelection("[", "](url)")} className={formatBtn} title="Link">link</button>
                  <span className="mx-1 h-4 w-px bg-app" />
                  <button onClick={insertToc} disabled={toc.length === 0} className={`${formatBtn} disabled:opacity-40`} title="Insert TOC">TOC</button>
                  <button onClick={() => setMd("")} className={formatBtn} title="Clear">Clear</button>
                </div>
              </div>

              {/* Editor with line numbers */}
              <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                <div className="flex items-center justify-between border-b border-app bg-app px-3 py-1.5">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    $ source.md
                  </span>
                  <span className="font-mono text-[0.55rem] text-muted">
                    {lineCount} lines
                  </span>
                </div>
                <div className="relative flex">
                  <div
                    aria-hidden
                    className="select-none border-r border-app bg-app px-2 py-3 text-right font-mono text-[0.7rem] leading-[1.55] text-faint"
                    style={{ minWidth: "2.5rem" }}
                  >
                    {Array.from({ length: lineCount }, (_, n) => (
                      <div key={n}>{n + 1}</div>
                    ))}
                  </div>
                  <textarea
                    id="md-source"
                    value={md}
                    onChange={(e) => setMd(e.target.value)}
                    className={inputCls(
                      "min-h-[460px] flex-1 rounded-none border-0 bg-transparent font-mono text-[0.78rem] leading-[1.55] text-app focus:ring-0",
                    )}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Status chip row */}
              <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.16em]">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-app bg-app-elevated px-2.5 py-1 text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Autosaved locally
                </span>
                <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-secondary">
                  {stats.charsNoSpaces.toLocaleString()} no-space
                </span>
                <span className="rounded-md border border-app bg-app-elevated px-2.5 py-1 text-secondary">
                  {lineCount} lines
                </span>
              </div>

              {toc.length > 0 && (
                <div className="mt-4 rounded-lg border border-app bg-app-elevated p-3">
                  <button
                    onClick={() => setShowToc((v) => !v)}
                    className="mb-2 flex w-full items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.18em] text-secondary transition-colors hover:text-app"
                  >
                    <span>Table of contents ({toc.length})</span>
                    <span className="text-muted">{showToc ? "▾" : "▸"}</span>
                  </button>
                  {showToc && (
                    <ul className="space-y-1 text-xs">
                      {toc.map((h, i) => (
                        <li
                          key={i}
                          style={{ paddingLeft: (h.level - 1) * 12 }}
                          className="border-l-2 border-tool-accent-soft pl-2 text-secondary"
                        >
                          <span className={h.level === 1 ? "font-semibold text-tool-accent" : ""}>
                            {h.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </ToolCard>
          )}

          {(mode === "preview" || mode === "split") && (
            <ToolCard title="Preview" subtitle="Rendered document">
              <div className="overflow-hidden rounded-lg border border-app bg-app-elevated">
                <div className="flex items-center justify-between border-b border-app bg-app px-3 py-1.5">
                  <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-tool-accent">
                    ▸ paper.preview
                  </span>
                  <span className="font-mono text-[0.55rem] text-muted">
                    ~{stats.readingMinutes} min
                  </span>
                </div>
                <div
                  className="min-h-[520px] overflow-auto bg-app-elevated p-8 text-[0.95rem] leading-[1.75] text-app"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </ToolCard>
          )}
        </div>
      </ToolShell>
    </div>
  );
}
