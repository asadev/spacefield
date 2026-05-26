"use client";

/* IndustrySection — view + edit the workspace's business industry.
 *
 * Reads the current value from /lib/industry/hooks (which subscribes to
 * workspaces.industry via the browser supabase client) and writes back
 * through /api/workspaces/update. Owners-only edit; admins/members see
 * the read-only label.
 *
 * UX:
 *   - Default state shows current industry + an Edit button (or just
 *     the label for non-owners).
 *   - Edit state replaces the body with a card grid (re-using the same
 *     pattern as the onboarding step) and a warning that switching
 *     industries does not delete data but does change defaults in
 *     industry-aware tools (poster templates, CRM pipelines, etc.).
 */

import { useState } from "react";

import { ALL_INDUSTRIES } from "@/lib/industry/registry";
import { getIndustryConfig } from "@/lib/industry/registry-helpers";
import { useWorkspaceIndustry } from "@/lib/industry/hooks";
import type { Industry } from "@/lib/industry/types";

import { PILL, PRIMARY, type WorkspaceRole } from "./types";
import IndustryCardGrid from "./IndustryCardGrid";

interface Props {
  workspaceId: string;
  role: WorkspaceRole;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export default function IndustrySection({
  workspaceId,
  role,
  onError,
  onSuccess,
}: Props) {
  const { industry, loading, error, setIndustry } =
    useWorkspaceIndustry(workspaceId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPick, setPendingPick] = useState<Industry | null>(null);

  const canEdit = role === "owner";
  const current = getIndustryConfig(industry);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-surface" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (error && !editing) {
    onError(error);
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <header>
          <h3 className="text-sm font-semibold text-app">Business industry</h3>
          <p className="mt-1 text-xs text-secondary">
            Spacefield uses this to pick the right templates, pipelines,
            and tool recommendations for your workspace.
          </p>
        </header>

        <div className="flex items-start gap-3 rounded-xl border border-app bg-app p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-app text-lg font-semibold">
            {current.label.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-app">
              {current.label}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {current.description}
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={PILL}
            >
              Change
            </button>
          )}
        </div>

        {!canEdit && (
          <p className="text-xs text-muted">
            Only the workspace owner can change the industry.
          </p>
        )}
      </div>
    );
  }

  /* Editing mode */
  const onPick = async (next: Industry) => {
    if (next === industry) {
      setEditing(false);
      return;
    }
    setPendingPick(next);
    setSaving(true);
    try {
      await setIndustry(next);
      onSuccess(`Industry updated to ${getIndustryConfig(next).label}.`);
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't update industry.");
    } finally {
      setSaving(false);
      setPendingPick(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-app">
            Pick a new industry
          </h3>
          <p className="mt-1 text-xs text-secondary">
            Changing the industry won&apos;t delete any data. It just swaps
            the default templates and the recommendations shown in
            industry-aware tools (poster templates, CRM pipelines).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className={PILL}
        >
          Cancel
        </button>
      </header>

      <IndustryCardGrid
        selected={industry}
        onPick={onPick}
        disabled={saving}
        pendingPick={pendingPick}
      />
    </div>
  );
}
