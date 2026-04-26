"use client";

import { useState, useTransition } from "react";

import { saveTier } from "../_actions";

export type Tier = {
  tier_id: string;
  name: string;
  price_cents_monthly: number;
  price_cents_yearly: number;
  max_owned_workspaces: number;
  max_storage_per_workspace_mb: number;
  max_members_per_workspace: number;
  features: Record<string, unknown> | null;
  is_public: boolean;
};

const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

export default function TierForm({ tier }: { tier: Tier }) {
  const [features, setFeatures] = useState(
    JSON.stringify(tier.features ?? {}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validateJson(value: string) {
    setFeatures(value);
    try {
      const parsed = JSON.parse(value || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setJsonError("Must be a JSON object");
        return false;
      }
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return false;
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateJson(features)) return;
    const fd = new FormData(e.currentTarget);
    setStatus("idle");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await saveTier(fd);
      if (res.ok) {
        setStatus("saved");
      } else {
        setStatus("error");
        setErrorMsg(res.error ?? "Save failed");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-app bg-app-elevated p-5"
    >
      <input type="hidden" name="tier_id" value={tier.tier_id} />
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-app">{tier.name}</h2>
          <div className="text-xs text-muted">tier_id: {tier.tier_id}</div>
        </div>
        <label className="flex items-center gap-2 text-xs text-secondary">
          <input
            type="checkbox"
            name="is_public"
            defaultChecked={tier.is_public}
            className="h-4 w-4 rounded border-app accent-tool-accent"
          />
          Public
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Display name" name="name" defaultValue={tier.name} />
        <Field
          label="Price monthly (cents)"
          name="price_cents_monthly"
          type="number"
          defaultValue={String(tier.price_cents_monthly)}
        />
        <Field
          label="Price yearly (cents)"
          name="price_cents_yearly"
          type="number"
          defaultValue={String(tier.price_cents_yearly)}
        />
        <Field
          label="Max owned workspaces"
          name="max_owned_workspaces"
          type="number"
          defaultValue={String(tier.max_owned_workspaces)}
        />
        <Field
          label="Max storage / workspace (MB)"
          name="max_storage_per_workspace_mb"
          type="number"
          defaultValue={String(tier.max_storage_per_workspace_mb)}
        />
        <Field
          label="Max members / workspace"
          name="max_members_per_workspace"
          type="number"
          defaultValue={String(tier.max_members_per_workspace)}
        />
      </div>

      <label className="mt-3 block">
        <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Features (JSON)
        </span>
        <textarea
          name="features"
          value={features}
          onChange={(e) => validateJson(e.target.value)}
          rows={8}
          spellCheck={false}
          className={`${inputClass} mt-1.5 font-mono text-xs`}
        />
        {jsonError && (
          <span className="mt-1 block text-xs text-rose-400">{jsonError}</span>
        )}
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || jsonError !== null}
          className="rounded-lg bg-tool-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {status === "saved" && (
          <span className="text-xs text-tool-accent">Saved.</span>
        )}
        {status === "error" && (
          <span className="text-xs text-rose-400">{errorMsg}</span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
        {label}
      </span>
      <input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue}
        className={`${inputClass} mt-1.5`}
      />
    </label>
  );
}
