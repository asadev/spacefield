import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Picker data for the workflow step editor. Loads:
 *   - skill ids (any kind, any status — we display draft/disabled too so
 *     admins can wire steps in advance).
 *   - prompt ids (full library, regardless of status).
 *
 * Returned as small `[id, label]` shapes so the picker selects can render
 * a meaningful label without an extra round-trip per step.
 */

export type PickerOption = {
  id: string;
  label: string;
  hint?: string;
};

export async function loadSkillOptions(): Promise<PickerOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_skills")
    .select("id, display_name, status, kind")
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const row = r as {
      id: string;
      display_name: string;
      status: string;
      kind: string;
    };
    return {
      id: row.id,
      label: row.display_name,
      hint: `${row.kind} · ${row.status}`,
    };
  });
}

export async function loadPromptOptions(): Promise<PickerOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prompt_library")
    .select("id, display_name, status, current_version")
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const row = r as {
      id: string;
      display_name: string;
      status: string;
      current_version: number;
    };
    return {
      id: row.id,
      label: row.display_name,
      hint: `v${row.current_version} · ${row.status}`,
    };
  });
}
