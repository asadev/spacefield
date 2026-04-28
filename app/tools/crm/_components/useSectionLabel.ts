"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * useSectionLabel — resolve a CRM section label (with template overrides).
 *
 * Templates can rename sections in the sidebar / view headers without
 * changing the underlying section keys (which are wired into routing,
 * state, and the kanban data layer).
 *
 *   const label = useSectionLabel("inventory", "Inventory");
 *   // → "Properties" if the active workspace has the real-estate
 *   //   template applied; "Inventory" otherwise.
 *
 * Reads `current` from `useCrmTemplate`. Returns the default when no
 * workspace is selected, when the template hasn't loaded, or when the
 * template doesn't override the section.
 * ───────────────────────────────────────────────────────────────────── */

import { useWorkspace } from "@/lib/workspaces/client";
import { CRM_TEMPLATES } from "../_templates/registry";
import type { CrmSection } from "../types";
import { useCrmTemplate } from "./useCrmTemplate";

export function useSectionLabel(section: CrmSection, fallback: string): string {
  const { current } = useWorkspace();
  const wsId = current.kind === "team" ? current.id : "";
  const { current: templateId } = useCrmTemplate(wsId);
  if (!templateId) return fallback;
  const tpl = CRM_TEMPLATES[templateId];
  if (!tpl?.sectionLabels) return fallback;
  return tpl.sectionLabels[section] ?? fallback;
}
