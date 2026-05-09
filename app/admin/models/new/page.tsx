import Link from "next/link";

import { createModel } from "../_actions";
import ModelForm from "../_components/ModelForm";

export const dynamic = "force-dynamic";

export default function AdminModelNewPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/models"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← AI models
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New AI model</h1>
        <p className="mt-1 max-w-2xl text-sm text-secondary">
          The id you choose here is what gets passed to the SDK. For new
          Claude models that means the date-suffixed id (e.g.{" "}
          <code className="font-mono">claude-haiku-5-0-20260601</code>);
          for OpenAI it&apos;s the public model name. Once saved, assign
          it to a call_kind on the{" "}
          <Link
            href="/admin/models/runtime"
            className="text-tool-accent underline-offset-2 hover:underline"
          >
            runtime assignments
          </Link>{" "}
          page.
        </p>
      </div>

      <ModelForm mode="create" action={createModel} />
    </div>
  );
}
