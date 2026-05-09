import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ToolItem, ToolCategoryKey } from "./tools-list";
import { TOOL_ICONS, registerCustomToolsLoader } from "./tools-list";

/**
 * Loader for admin-registered custom iframe apps. Reads from
 * `app_registry` where `is_user_created = true`, `published = true`, and
 * `tool_kind = 'iframe'`. Each row is shaped to match the local
 * `ToolItem` interface so the OS shell, Launchpad, and dock can render
 * them next to the built-in catalogue.
 *
 * The desktop Window iframes any ToolItem with a `route` set, so we map
 * `custom_url` straight onto `route`. Native (`app:`) loading is
 * intentionally not supported for custom apps — they're external by
 * design.
 */

type CustomAppRow = {
  id: string;
  title: string;
  description: string | null;
  custom_url: string | null;
  tool_kind: string;
  icon: string | null;
  sort_order: number | null;
};

const TOOL_ICON_KEYS = new Set<keyof typeof TOOL_ICONS>(
  Object.keys(TOOL_ICONS) as Array<keyof typeof TOOL_ICONS>
);

function pickIcon(value: string | null | undefined): keyof typeof TOOL_ICONS {
  if (value && TOOL_ICON_KEYS.has(value as keyof typeof TOOL_ICONS)) {
    return value as keyof typeof TOOL_ICONS;
  }
  return "grid";
}

// Register the loader on module-load so any server-side caller of
// `getMergedToolList()` from `tools-list.ts` picks it up without needing
// a static import (which would drag this module into client bundles).
registerCustomToolsLoader(() => loadCustomTools());

export async function loadCustomTools(): Promise<ToolItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_registry")
    .select("id, title, description, custom_url, tool_kind, icon, sort_order")
    .eq("is_user_created", true)
    .eq("published", true)
    .eq("tool_kind", "iframe")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error || !data) return [];

  const rows = data as CustomAppRow[];
  return rows
    .filter((row) => typeof row.custom_url === "string" && row.custom_url.length > 0)
    .map<ToolItem>((row) => ({
      slug: row.id,
      title: row.title,
      description: row.description ?? "",
      // Custom apps land in the cross-industry "productivity" bucket.
      // Tier-specific routing happens via the access_mode column at the
      // OS-shell level, not via category here.
      category: "productivity" as ToolCategoryKey,
      icon: pickIcon(row.icon),
      route: row.custom_url ?? undefined,
    }));
}
