import Link from "next/link";

import { createPrompt } from "../_actions";
import PromptForm from "../_components/PromptForm";

export const dynamic = "force-dynamic";

/**
 * Create a new prompt_library row + first version. Saving inserts the
 * library row and a corresponding `prompt_versions` row with version=1,
 * then redirects to the per-prompt editor where future versions are
 * managed.
 */
export default function AdminPromptNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/prompts"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Prompt library
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New prompt</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          Defaults: status=draft, category=general. The body becomes
          version 1 — future iterations create new versions with the
          editor on the per-prompt page. Use <code>{`{{variable}}`}</code>{" "}
          placeholders; variables auto-extract on save unless you provide
          them explicitly.
        </p>
      </div>

      <PromptForm mode="create" action={createPrompt} />
    </div>
  );
}
