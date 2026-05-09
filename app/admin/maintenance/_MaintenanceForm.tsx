"use client";

import { useState, useTransition } from "react";

import type { MaintenanceStateRow } from "../_types";
import {
  disableMaintenance,
  enableMaintenance,
  updateMaintenance,
} from "./_actions";
import { buttonClass, buttonGhostClass, inputClass } from "./_styles";

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function MaintenanceForm({ state }: { state: MaintenanceStateRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(state.enabled);
  const [readOnly, setReadOnly] = useState(state.read_only);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    // Strong confirmation when toggling enabled ON.
    const turningOn = enabled && !state.enabled;
    if (turningOn) {
      const phrase = "ENABLE MAINTENANCE";
      const typed = window.prompt(
        `You are about to enable site-wide maintenance mode. Every non-allowlisted user will be locked out (or restricted to read-only). Type "${phrase}" to confirm.`
      );
      if (typed !== phrase) {
        setError("Confirmation phrase did not match — no changes made.");
        return;
      }
    } else if (state.enabled) {
      // Editing while live — confirm but no phrase.
      if (
        !confirm(
          "Maintenance mode is currently LIVE. Save these changes? They take effect immediately."
        )
      ) {
        return;
      }
    }

    setError(null);
    const fd = new FormData(form);
    fd.set("confirm", "yes");
    startTransition(() => {
      void updateMaintenance(fd).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-xl border border-app bg-app-elevated p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="inline-flex items-center gap-3 text-sm text-app">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium">
            Maintenance mode {enabled ? "ON" : "OFF"}
          </span>
        </label>

        <label className="inline-flex items-center gap-3 text-sm text-app">
          <input
            type="checkbox"
            name="read_only"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Read-only mode (allow login + viewing, block writes)</span>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Public message
          </span>
          <textarea
            name="message"
            defaultValue={state.message}
            rows={3}
            placeholder="We're performing scheduled maintenance. Back online by 02:00 UTC."
            className={`${inputClass} resize-y`}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Starts at
          </span>
          <input
            type="datetime-local"
            name="starts_at"
            defaultValue={toDatetimeLocal(state.starts_at)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Ends at
          </span>
          <input
            type="datetime-local"
            name="ends_at"
            defaultValue={toDatetimeLocal(state.ends_at)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Allowlist user UUIDs — bypass maintenance (one per line)
          </span>
          <textarea
            name="allowlist_user_ids"
            defaultValue={state.allowlist_user_ids.join("\n")}
            rows={4}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-app bg-app px-3 py-2 text-xs text-rose-500">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="reset"
          className={buttonGhostClass}
          disabled={isPending}
          onClick={() => {
            setEnabled(state.enabled);
            setReadOnly(state.read_only);
            setError(null);
          }}
        >
          Reset
        </button>
        <button type="submit" className={buttonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export function QuickToggleButtons({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const enableNow = () => {
    const typed = window.prompt(
      'You are about to ENABLE maintenance mode. Type "ENABLE MAINTENANCE" to confirm.'
    );
    if (typed !== "ENABLE MAINTENANCE") return;
    const fd = new FormData();
    fd.set("confirm", "yes");
    setError(null);
    startTransition(() => {
      void enableMaintenance(fd).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    });
  };

  const disableNow = () => {
    if (!confirm("Disable maintenance mode and reopen the site to all users?")) {
      return;
    }
    const fd = new FormData();
    fd.set("confirm", "yes");
    setError(null);
    startTransition(() => {
      void disableMaintenance(fd).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {enabled ? (
        <button
          type="button"
          onClick={disableNow}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Disabling…" : "Disable now"}
        </button>
      ) : (
        <button
          type="button"
          onClick={enableNow}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Enabling…" : "Enable now"}
        </button>
      )}
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </div>
  );
}
