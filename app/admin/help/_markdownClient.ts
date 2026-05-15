/**
 * Client-side mirror of the server markdown renderer. Identical output —
 * duplicated rather than imported from `_markdown.ts` because that file
 * is server-only-friendly and would break if pulled into a "use client"
 * bundle. See `_markdown.ts` for full docs.
 */

import { safeHref } from "@/lib/safe-href";

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]!);
}

/**
 * SB-004: validate URL scheme before letting it land in href/src.
 * Mirrors `_markdown.ts::safeUrl`.
 */
function safeUrl(raw: string): string {
  const safe = safeHref(raw);
  return safe ? escapeHtml(safe) : "#";
}

function inline(text: string): string {
  let out = escapeHtml(text);
  const codeStash: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_m, code) => {
    codeStash.push(
      `<code class="rounded bg-app-elevated px-1 py-0.5 font-mono text-[0.85em]">${code}</code>`
    );
    return ` CODE${codeStash.length - 1} `;
  });
  // SB-004: scheme-allowlist URLs on both image and link rendering.
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_m, alt, url) =>
      `<img src="${safeUrl(url)}" alt="${alt}" class="my-3 max-w-full rounded-lg border border-app" />`
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label, url) =>
      `<a href="${safeUrl(url)}" class="text-tool-accent underline hover:opacity-80" rel="noopener noreferrer">${label}</a>`
  );
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/ CODE(\d+) /g, (_m, i) => codeStash[Number(i)] ?? "");
  return out;
}

export function renderMarkdownClient(src: string): string {
  if (!src) return "";

  const fenced: string[] = [];
  let work = src.replace(
    /```([a-z0-9_+-]*)\n([\s\S]*?)```/gi,
    (_m, lang, code) => {
      const langClass = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
      fenced.push(
        `<pre class="my-3 overflow-x-auto rounded-lg border border-app bg-app-elevated p-3 text-xs leading-relaxed"${langClass}><code>${escapeHtml(
          code.replace(/\n$/, "")
        )}</code></pre>`
      );
      return ` FENCE${fenced.length - 1} `;
    }
  );

  work = work.replace(/\r\n?/g, "\n");

  const blocks = work.split(/\n{2,}/);
  const html: string[] = [];

  for (const raw of blocks) {
    const block = raw.replace(/^\n+|\n+$/g, "");
    if (!block) continue;

    if (/^ FENCE\d+ $/.test(block.trim())) {
      const idx = Number(block.trim().match(/ FENCE(\d+) /)![1]);
      html.push(fenced[idx] ?? "");
      continue;
    }

    const h = block.match(/^(#{1,4})\s+(.*)$/);
    if (h && !block.includes("\n")) {
      const level = h[1].length;
      const sizes = ["text-2xl", "text-xl", "text-lg", "text-base"];
      const cls = `${sizes[level - 1]} font-semibold text-app mt-5 mb-2`;
      html.push(`<h${level} class="${cls}">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(block.trim())) {
      html.push('<hr class="my-4 border-app" />');
      continue;
    }

    if (block.split("\n").every((l) => l.startsWith(">"))) {
      const inner = block
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n");
      html.push(
        `<blockquote class="my-3 border-l-2 border-tool-accent bg-app-elevated pl-3 py-1 text-secondary italic">${inline(
          inner
        )}</blockquote>`
      );
      continue;
    }

    if (
      /^[-*]\s+/m.test(block) &&
      block.split("\n").every((l) => /^[-*]\s+/.test(l))
    ) {
      const items = block
        .split("\n")
        .map((l) => l.replace(/^[-*]\s+/, ""))
        .map((l) => `<li class="ml-1">${inline(l)}</li>`)
        .join("");
      html.push(
        `<ul class="my-3 list-disc space-y-1 pl-5 text-app">${items}</ul>`
      );
      continue;
    }

    if (
      /^\d+\.\s+/m.test(block) &&
      block.split("\n").every((l) => /^\d+\.\s+/.test(l))
    ) {
      const items = block
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s+/, ""))
        .map((l) => `<li class="ml-1">${inline(l)}</li>`)
        .join("");
      html.push(
        `<ol class="my-3 list-decimal space-y-1 pl-5 text-app">${items}</ol>`
      );
      continue;
    }

    const inlined = inline(block).replace(/\n/g, "<br />");
    html.push(`<p class="my-3 leading-relaxed text-app">${inlined}</p>`);
  }

  let out = html.join("\n");
  out = out.replace(/ FENCE(\d+) /g, (_m, i) => fenced[Number(i)] ?? "");
  return out;
}
