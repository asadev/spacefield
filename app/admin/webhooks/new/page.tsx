import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { inputClass } from "../../_lib";
import { createEndpoint } from "../_actions";
import { EventsPicker } from "../_components/EventsPicker";

export const dynamic = "force-dynamic";

type WorkspaceLite = { id: string; name: string };

async function createEndpointVoid(formData: FormData): Promise<void> {
  "use server";
  const result = await createEndpoint(formData);
  if (result.ok) {
    redirect("/admin/webhooks");
  }
  // On error, stay on the page — Next will re-render. We don't surface
  // the error inline because server actions can't return strings to a
  // form-action prop; the audit log captures the attempt regardless.
  // (Same shortcut /admin/domains/page uses for its + Add form.)
}

export default async function NewWebhookEndpointPage() {
  const admin = createAdminClient();
  const { data: pickerWsRaw } = await admin
    .from("workspaces")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(200);
  const pickerWs = (pickerWsRaw ?? []) as WorkspaceLite[];

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/webhooks"
          className="text-[0.65rem] uppercase tracking-[0.18em] text-muted transition-colors hover:text-app"
        >
          ← Webhooks
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-app">
          New webhook endpoint
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Posts a signed JSON payload to your URL whenever any subscribed
          event fires. Secret is auto-generated and shown on the next page.
        </p>
      </div>

      <form
        action={createEndpointVoid}
        className="space-y-5 rounded-xl border border-app bg-app-elevated p-4"
      >
        <Field label="Name" hint="Internal label — what you'll see in the list.">
          <input
            type="text"
            name="name"
            required
            placeholder="e.g. Zapier — sales alerts"
            className={inputClass}
          />
        </Field>

        <Field label="URL" hint="Where we POST the signed JSON. Must be HTTPS in prod.">
          <input
            type="url"
            name="url"
            required
            placeholder="https://your-receiver.example.com/hook"
            className={inputClass}
          />
        </Field>

        <Field
          label="Workspace"
          hint="Select a workspace, or 'Global' to fire for events that aren't tied to a workspace."
        >
          <select
            name="workspace_id"
            defaultValue="__global__"
            className={inputClass}
          >
            <option value="__global__">Global (no workspace)</option>
            {pickerWs.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Events" hint="At least one. Endpoint only receives events you subscribe to.">
          <EventsPicker selected={[]} />
        </Field>

        <Field label="Max retries" hint="Failed deliveries retry this many times before giving up.">
          <input
            type="number"
            name="max_retries"
            min={0}
            max={10}
            defaultValue={3}
            className={inputClass}
          />
        </Field>

        <Field label="Enabled">
          <label className="flex items-center gap-2 text-sm text-app">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked
              value="on"
              className="h-4 w-4 accent-current text-tool-accent"
            />
            Receive events immediately after creation
          </label>
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-app pt-4">
          <Link
            href="/admin/webhooks"
            className="inline-flex items-center justify-center rounded-lg border border-app bg-app px-3 py-2 text-xs text-app transition-colors hover:border-tool-accent"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-tool-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Create endpoint
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-faint">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}
