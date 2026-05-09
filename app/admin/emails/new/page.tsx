import Link from "next/link";

import { TemplateEditorForm } from "../_components/TemplateEditorForm";
import { createTemplate } from "../_actions";

import type { EmailTemplateRow } from "../../_types";

export const dynamic = "force-dynamic";

const BLANK_TEMPLATE: Pick<
  EmailTemplateRow,
  | "key"
  | "display_name"
  | "description"
  | "category"
  | "role"
  | "subject"
  | "html"
  | "plain_text"
  | "variables_json"
  | "enabled"
  | "locale"
> = {
  key: "",
  display_name: "",
  description: "",
  category: "transactional",
  role: "noreply",
  subject: "",
  html: "",
  plain_text: null,
  variables_json: [],
  enabled: true,
  locale: "en",
};

export default function AdminEmailNewPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/emails"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Email templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">New template</h1>
        <p className="mt-0.5 text-xs text-muted">
          Templates are stored in <code className="rounded bg-app px-1 text-[11px]">public.email_templates</code>
          {" "}and rendered at send time. Pick a stable key — code calls
          {" "}<code className="rounded bg-app px-1 text-[11px]">sendTemplate(&quot;key&quot;, ...)</code>.
        </p>
      </div>

      <section className="rounded-xl border border-app bg-app-elevated p-5">
        <TemplateEditorForm
          template={BLANK_TEMPLATE}
          keyEditable={true}
          action={createTemplate}
          submitLabel="Create template"
        />
      </section>
    </div>
  );
}
