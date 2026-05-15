/* lib/ai-tools/extras.ts — AI skill exposing tags, favorites, and the
 * recycle bin to the workspace assistant.
 *
 * Surfaces seven tools:
 *   - list_tags
 *   - tag_entity         (creates any missing tag, then attaches)
 *   - list_my_favorites
 *   - toggle_favorite
 *   - list_trash
 *   - restore_entity
 *
 * Every tool uses ctx.supabase so RLS still applies (per AGENTS.md
 * skill-first rule). Where helpers in lib/tags / lib/favorites / lib/trash
 * use a different client, we re-implement the query inline against the
 * caller's client to stay within the security model.
 */

import { clampList, runQuery, toolError, toolOk } from "@/lib/agent/skills/_helpers";
import type {
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";

interface TagRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  color: string | null;
  created_by: string | null;
  created_at: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const list_tags: ToolDefinition = {
  name: "list_tags",
  description:
    "List all tags defined in the current workspace. Pass a workspace_id to override the active one.",
  input_schema: {
    type: "object",
    properties: {
      workspace_id: {
        type: "string",
        description:
          "Optional workspace id; defaults to the agent's current workspace.",
      },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { workspace_id } = (input as { workspace_id?: string }) ?? {};
    const wsId = workspace_id || ctx.workspaceId;
    if (!wsId) return toolError("missing_workspace_id");
    return runQuery(
      ctx.supabase
        .from("tags")
        .select("id, workspace_id, name, slug, color, created_at")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true })
    );
  },
};

const tag_entity: ToolDefinition = {
  name: "tag_entity",
  description:
    "Attach one or more tags to an entity. Missing tags are created in the workspace first.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string", description: "Polymorphic entity type, e.g. crm_contact." },
      entity_id: { type: "string", description: "UUID of the entity." },
      tag_names: {
        type: "array",
        items: { type: "string" },
        description: "Tag names to attach. Creates any missing ones.",
      },
    },
    required: ["entity_type", "entity_id", "tag_names"],
    additionalProperties: false,
  },
  required_role: "member",
  read_only: false,
  execute: async (input, ctx) => {
    const { entity_type, entity_id, tag_names } = input as {
      entity_type: string;
      entity_id: string;
      tag_names: string[];
    };
    if (!entity_type || !entity_id) return toolError("missing_fields");
    if (!Array.isArray(tag_names) || tag_names.length === 0) {
      return toolError("no_tag_names");
    }

    const attached: { id: string; name: string }[] = [];
    for (const raw of tag_names) {
      const name = raw.trim();
      if (!name) continue;
      const slug = slugify(name);
      if (!slug) continue;
      // Find or create tag.
      const { data: existing } = await ctx.supabase
        .from("tags")
        .select("id, name")
        .eq("workspace_id", ctx.workspaceId)
        .eq("slug", slug)
        .maybeSingle();
      let tag = existing as { id: string; name: string } | null;
      if (!tag) {
        const { data: created, error: createErr } = await ctx.supabase
          .from("tags")
          .insert({
            workspace_id: ctx.workspaceId,
            name,
            slug,
            created_by: ctx.userId,
          })
          .select("id, name")
          .single();
        if (createErr || !created) {
          return toolError(createErr?.message ?? "tag_create_failed");
        }
        tag = created as { id: string; name: string };
      }
      const { error: linkErr } = await ctx.supabase
        .from("entity_tags")
        .upsert(
          {
            tag_id: tag.id,
            entity_type,
            entity_id,
          },
          {
            onConflict: "tag_id,entity_type,entity_id",
            ignoreDuplicates: true,
          }
        );
      if (linkErr) return toolError(linkErr.message);
      attached.push(tag);
    }
    return toolOk({ attached });
  },
};

const list_my_favorites: ToolDefinition = {
  name: "list_my_favorites",
  description:
    "List the calling user's pinned favorites across all workspaces, newest first.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  read_only: true,
  execute: async (_input, ctx) => {
    const { data, error } = await ctx.supabase
      .from("favorites")
      .select(
        "id, workspace_id, entity_type, entity_id, label, position, created_at"
      )
      .eq("user_id", ctx.userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) return toolError(error.message);
    return toolOk(clampList(data ?? [], 50));
  },
};

const toggle_favorite: ToolDefinition = {
  name: "toggle_favorite",
  description:
    "Pin or unpin a record to the user's favorites. Returns the new state.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "string" },
      label: { type: "string" },
    },
    required: ["entity_type", "entity_id"],
    additionalProperties: false,
  },
  required_role: "member",
  read_only: false,
  execute: async (input, ctx) => {
    const { entity_type, entity_id, label } = input as {
      entity_type: string;
      entity_id: string;
      label?: string;
    };
    if (!entity_type || !entity_id) return toolError("missing_fields");
    const { data: existing } = await ctx.supabase
      .from("favorites")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .maybeSingle();
    if (existing) {
      const { error } = await ctx.supabase
        .from("favorites")
        .delete()
        .eq("id", existing.id);
      if (error) return toolError(error.message);
      return toolOk({ favorited: false });
    }
    const { data: top } = await ctx.supabase
      .from("favorites")
      .select("position")
      .eq("user_id", ctx.userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = ((top?.position as number | undefined) ?? -1) + 1;
    const { error } = await ctx.supabase.from("favorites").insert({
      user_id: ctx.userId,
      workspace_id: ctx.workspaceId,
      entity_type,
      entity_id,
      label: label ?? null,
      position: nextPosition,
    });
    if (error) return toolError(error.message);
    return toolOk({ favorited: true });
  },
};

const TRASH_TABLES: { entityType: string; table: string; label: string; label2?: string }[] = [
  { entityType: "crm_contact", table: "crm_contacts", label: "first_name", label2: "last_name" },
  { entityType: "crm_lead", table: "crm_leads", label: "first_name", label2: "last_name" },
  { entityType: "crm_deal", table: "crm_deals", label: "title" },
  { entityType: "workspace_file", table: "workspace_files", label: "name" },
  { entityType: "comment", table: "comments", label: "body" },
  { entityType: "task", table: "tasks", label: "title" },
  { entityType: "project", table: "projects", label: "name" },
  { entityType: "employee", table: "employees", label: "name" },
];

const list_trash: ToolDefinition = {
  name: "list_trash",
  description:
    "List soft-deleted entities in the current workspace. Optionally filter by entity_type.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: {
        type: "string",
        description:
          "Optional filter, e.g. crm_contact, crm_deal, task, workspace_file.",
      },
    },
    additionalProperties: false,
  },
  read_only: true,
  execute: async (input, ctx) => {
    const { entity_type } = (input as { entity_type?: string }) ?? {};
    const tables = entity_type
      ? TRASH_TABLES.filter((t) => t.entityType === entity_type)
      : TRASH_TABLES;

    const out: {
      entity_type: string;
      entity_id: string;
      label: string;
      deleted_at: string;
    }[] = [];

    for (const t of tables) {
      try {
        const cols = ["id", "deleted_at", t.label, t.label2]
          .filter((c): c is string => Boolean(c))
          .join(", ");
        const { data, error } = await ctx.supabase
          .from(t.table)
          .select(cols)
          .eq("workspace_id", ctx.workspaceId)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false })
          .limit(50);
        if (error || !data) continue;
        type Row = {
          id: string;
          deleted_at: string;
          [k: string]: unknown;
        };
        for (const r of data as unknown as Row[]) {
          const a = (r[t.label] as string | null) ?? "";
          const b = t.label2 ? ((r[t.label2] as string | null) ?? "") : "";
          out.push({
            entity_type: t.entityType,
            entity_id: r.id,
            label: `${a} ${b}`.trim() || "(untitled)",
            deleted_at: r.deleted_at,
          });
        }
      } catch {
        // Missing table — skip.
        continue;
      }
    }
    out.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
    return toolOk(clampList(out, 50));
  },
};

const restore_entity: ToolDefinition = {
  name: "restore_entity",
  description:
    "Restore a soft-deleted entity by clearing its deleted_at timestamp.",
  input_schema: {
    type: "object",
    properties: {
      entity_type: { type: "string" },
      entity_id: { type: "string" },
    },
    required: ["entity_type", "entity_id"],
    additionalProperties: false,
  },
  required_role: "member",
  read_only: false,
  execute: async (input, ctx) => {
    const { entity_type, entity_id } = input as {
      entity_type: string;
      entity_id: string;
    };
    const tbl = TRASH_TABLES.find((t) => t.entityType === entity_type);
    if (!tbl) return toolError("unknown_entity_type");
    try {
      const { error } = await ctx.supabase
        .from(tbl.table)
        .update({ deleted_at: null })
        .eq("id", entity_id)
        .eq("workspace_id", ctx.workspaceId);
      if (error) return toolError(error.message);
      return toolOk({ restored: true });
    } catch (e) {
      return toolError((e as Error).message);
    }
  },
};

const fetchTagRow = async (
  ctx: { supabase: { from: (t: string) => unknown }; workspaceId: string },
  slug: string
): Promise<TagRow | null> => {
  // Reserved for future use — kept exported via the dispatcher when
  // we eventually wire a richer "lookup" tool. The unused parameter
  // shapes match the live supabase client.
  void ctx;
  void slug;
  return null;
};
void fetchTagRow;

export const extrasSkill: SkillDefinition = {
  id: "extras",
  label: "Extras",
  description:
    "Cross-cutting tools: tag entities, manage favorites, and operate the recycle bin.",
  systemFragment:
    "Use the extras tools when the user wants to organize records with tags, pin records to favorites, or recover something they deleted. list_trash + restore_entity are read+write on the trashed row's source table.",
  tools: [
    list_tags,
    tag_entity,
    list_my_favorites,
    toggle_favorite,
    list_trash,
    restore_entity,
  ],
};
