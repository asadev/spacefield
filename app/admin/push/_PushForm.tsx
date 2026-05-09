import Link from "next/link";

import { buttonClass, buttonGhostClass, inputClass } from "../_lib";
import type { PushCampaignRow } from "../_types";
import { TIER_IDS } from "../_types";
import {
  createCampaign,
  deleteCampaign,
  updateCampaign,
} from "./_actions";
import { SendCampaignButton } from "./_SendButton";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All subscribers" },
  { value: "tier", label: "Specific tiers" },
  { value: "allowlist", label: "Specific user UUIDs" },
  { value: "workspace", label: "Specific workspace UUIDs" },
] as const;

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createCampaign(formData);
}

async function updateAction(formData: FormData): Promise<void> {
  "use server";
  await updateCampaign(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  "use server";
  await deleteCampaign(formData);
}

export function PushForm({
  mode,
  campaign,
}: {
  mode: "create" | "edit";
  campaign: PushCampaignRow | null;
}) {
  const action = mode === "create" ? createAction : updateAction;
  const submitLabel = mode === "create" ? "Create campaign" : "Save changes";
  const locked =
    campaign?.status === "sending" || campaign?.status === "sent";

  return (
    <div className="space-y-5">
      {locked && (
        <div className="rounded-xl border border-app bg-app-elevated p-3 text-xs text-amber-600 dark:text-amber-400">
          This campaign has already been sent — fields are read-only.
        </div>
      )}
      <form
        action={action}
        className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
      >
        {mode === "edit" && campaign && (
          <input type="hidden" name="id" value={campaign.id} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Title
            </span>
            <input
              type="text"
              name="title"
              defaultValue={campaign?.title ?? ""}
              required
              maxLength={100}
              disabled={locked}
              placeholder="New feature: collaborative editing"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Body
            </span>
            <textarea
              name="body"
              defaultValue={campaign?.body ?? ""}
              required
              rows={3}
              disabled={locked}
              placeholder="See what's new in your workspace today."
              className={`${inputClass} resize-y`}
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Click-through URL
            </span>
            <input
              type="text"
              name="url"
              defaultValue={campaign?.url ?? ""}
              placeholder="/whats-new or https://…"
              disabled={locked}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Audience
            </span>
            <select
              name="audience"
              defaultValue={campaign?.audience ?? "all"}
              disabled={locked}
              className={inputClass}
            >
              {AUDIENCE_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Schedule (blank = send manually)
            </span>
            <input
              type="datetime-local"
              name="scheduled_at"
              defaultValue={toDatetimeLocal(campaign?.scheduled_at)}
              disabled={locked}
              className={inputClass}
            />
          </label>

          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Tiers (used when audience = tier)
            </legend>
            <div className="flex flex-wrap gap-2">
              {TIER_IDS.map((t) => (
                <label
                  key={t}
                  className="inline-flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-1.5 text-xs text-app"
                >
                  <input
                    type="checkbox"
                    name="audience_tier"
                    value={t}
                    defaultChecked={
                      campaign?.audience_tiers.includes(t) ?? false
                    }
                    disabled={locked}
                  />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Allowlist user UUIDs — one per line
            </span>
            <textarea
              name="audience_user_ids"
              defaultValue={campaign?.audience_user_ids.join("\n") ?? ""}
              rows={3}
              disabled={locked}
              className={`${inputClass} font-mono text-xs`}
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Workspace UUIDs — one per line (used when audience = workspace)
            </span>
            <textarea
              name="audience_workspace_ids"
              defaultValue={campaign?.audience_workspace_ids.join("\n") ?? ""}
              rows={3}
              disabled={locked}
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/admin/push" className={buttonGhostClass}>
            Cancel
          </Link>
          {!locked && (
            <button type="submit" className={buttonClass}>
              {submitLabel}
            </button>
          )}
        </div>
      </form>

      {mode === "edit" && campaign && !locked && (
        <div className="rounded-xl border border-app bg-app-elevated p-5">
          <h2 className="text-sm font-semibold text-app">Send</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Marking the campaign as sending dispatches it to the worker. Save
            any pending edits first — fields lock after dispatch.
          </p>
          <SendCampaignButton id={campaign.id} title={campaign.title} />
        </div>
      )}

      {mode === "edit" && campaign && (
        <details className="rounded-lg border border-app bg-app-elevated p-3">
          <summary className="cursor-pointer text-xs text-muted">
            Danger zone
          </summary>
          <form action={deleteAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="id" value={campaign.id} />
            <button
              type="submit"
              className="rounded-md border border-app bg-app px-2.5 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500/60"
            >
              Delete campaign
            </button>
            <span className="text-[11px] text-muted">
              Removes the row regardless of status.
            </span>
          </form>
        </details>
      )}
    </div>
  );
}
