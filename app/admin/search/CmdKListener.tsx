"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Optional Cmd+K (Ctrl+K) listener.
 *
 * Drop this on any admin page to wire up a "command palette"-style
 * keyboard shortcut that pushes the user to /admin/search and focuses
 * the input. We do NOT touch /admin/layout.tsx — pages opt in by
 * rendering this island. The listener is a no-op when the user is
 * typing in another input/textarea so we don't steal characters.
 *
 * Usage:
 *   <CmdKListener />
 */
export default function CmdKListener({
  href = "/admin/search",
}: {
  /** Override the destination — defaults to /admin/search. */
  href?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // If we're already focused on the search input, let Cmd+K still
        // work — it's an idempotent navigate. For other inputs, bail.
        if (
          t instanceof HTMLInputElement &&
          (t.name === "q" || t.getAttribute("data-cmdk-input") === "1")
        ) {
          return false;
        }
        return true;
      }
      return t.isContentEditable === true;
    }

    function onKey(e: KeyboardEvent) {
      // Cmd+K on macOS, Ctrl+K everywhere else.
      const isCmdK =
        (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isCmdK) return;
      // Don't steal Cmd+K from a typing target unless it's the search box.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      // If we're already on the destination, focus the search input.
      const path = window.location.pathname;
      if (path === href || path.startsWith(`${href}?`)) {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="q"], input[data-cmdk-input="1"]'
        );
        input?.focus();
        input?.select();
        return;
      }
      router.push(href);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, href]);

  return null;
}
