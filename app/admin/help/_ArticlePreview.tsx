"use client";

import { useEffect, useRef, useState } from "react";

import { renderMarkdownClient } from "./_markdownClient";

/**
 * Live markdown preview pane next to the article body textarea.
 *
 * Wires onto the `textarea[name="body"]` in the same form on mount.
 * Re-renders on input via the lightweight client-side renderer.
 */
export function ArticlePreview({ initial }: { initial: string }) {
  const [html, setHtml] = useState(() => renderMarkdownClient(initial ?? ""));
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const form = root.closest("form");
    if (!form) return;
    const ta = form.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    if (!ta) return;

    const handler = () => setHtml(renderMarkdownClient(ta.value));
    ta.addEventListener("input", handler);
    // Sync once in case the textarea was edited before mount.
    setHtml(renderMarkdownClient(ta.value));
    return () => ta.removeEventListener("input", handler);
  }, []);

  return (
    <div
      ref={ref}
      className="prose-help max-h-[640px] overflow-y-auto rounded-lg border border-app bg-app p-3 text-sm"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
