import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../../_lib";
import { createCustomApp } from "../_actions";

export const dynamic = "force-dynamic";

const ACCESS_MODES = [
  { value: "authenticated", label: "Authenticated — any signed-in user" },
  { value: "public", label: "Public — anyone (no auth)" },
  { value: "tier", label: "Tier — limit later via the app detail page" },
  { value: "allowlist", label: "Allowlist — limit later via the app detail page" },
  { value: "admin_only", label: "Admin only" },
] as const;

async function createCustomAppAction(formData: FormData): Promise<void> {
  "use server";
  await createCustomApp(formData);
}

export default function NewCustomAppPage() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.2em] text-faint">
          Apps & Features
        </div>
        <h1 className="mt-1 text-xl font-semibold text-app">New custom app</h1>
        <p className="mt-0.5 text-xs text-muted">
          Adds a custom iframe app to the OS shell. Users will see it in
          Launchpad after publishing — fine-tune access, grants, and tiers
          on the next screen.
        </p>
      </div>

      <form
        action={createCustomAppAction}
        className="space-y-4 rounded-xl border border-app bg-app-elevated p-5"
      >
        <Field
          label="Slug (id)"
          help="Lowercase letters, digits, hyphens. Must start with a letter. Used in URLs and as the unique key."
        >
          <input
            type="text"
            name="id"
            required
            pattern="^[a-z][a-z0-9-]*$"
            placeholder="my-custom-tool"
            className={inputClass}
          />
        </Field>

        <Field label="Title" help="The user-visible name in Launchpad and the dock.">
          <input
            type="text"
            name="title"
            required
            maxLength={120}
            placeholder="My Custom Tool"
            className={inputClass}
          />
        </Field>

        <Field
          label="Description"
          help="One or two lines, shown under the title in Launchpad."
        >
          <textarea
            name="description"
            rows={2}
            maxLength={400}
            placeholder="What this tool does, in plain English."
            className={inputClass}
          />
        </Field>

        <Field
          label="URL"
          help="Must start with https://. http://localhost is allowed for development. The OS shell embeds this in an iframe."
        >
          <input
            type="url"
            name="custom_url"
            required
            placeholder="https://example.com/tool"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field
          label="Icon"
          help="Optional. The key of a built-in tool icon (e.g. grid, compass, calculator, code, document, image)."
        >
          <input
            type="text"
            name="icon"
            placeholder="grid"
            className={`${inputClass} font-mono`}
          />
        </Field>

        <Field
          label="Access mode"
          help="Who can launch this app. You can refine tiers, allowlists, and per-user grants on the detail page after creation."
        >
          <select name="access_mode" defaultValue="authenticated" className={inputClass}>
            {ACCESS_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" className={buttonClass}>
            Create app
          </button>
          <Link href="/admin/apps" className={buttonGhostClass}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </span>
      {children}
      {help ? <span className="block text-[11px] text-muted">{help}</span> : null}
    </label>
  );
}
