/* Skill catalog index — the single source of truth for what tools exist.
 *
 * NEW SKILL CHECKLIST:
 *   1. Add a folder under lib/agent/skills/<your-skill>/index.ts
 *   2. Export a SkillDefinition with id, label, description, systemFragment, tools
 *   3. Import it here and add it to ALL_SKILLS
 *   4. The runtime picks it up automatically. The classifier sees it via
 *      the SKILL_SUMMARY in classifier.ts — also update that string when
 *      adding new skills so the classifier knows when to route to it.
 */

import { appsSkill } from "./apps";
import { boardsSkill } from "./boards";
import { crmActivitiesSkill } from "./crm-activities";
import { crmCompaniesSkill } from "./crm-companies";
import { crmContactsSkill } from "./crm-contacts";
import { crmDealsSkill } from "./crm-deals";
import { crmLeadsSkill } from "./crm-leads";
import { filesSkill } from "./files";
import { metaSkill } from "./meta";
import { workspaceSkill } from "./workspace";
import { checkFreeTier, checkRole } from "./_helpers";
import type {
  SkillDefinition,
  ToolDefinition,
  ToolExecuteResult,
  UserContext,
} from "@/lib/agent/runtime/types";

// 2026-05-14 overnight build — 5 new skills shipped by parallel feature
// agents. Located in lib/ai-tools/* (the legacy folder convention is
// lib/agent/skills/*, but these are full SkillDefinition objects and
// slot into ALL_SKILLS without conversion).
import { tasksSkill } from "@/lib/ai-tools/tasks";
import { peopleSkill } from "@/lib/ai-tools/people";
import { collabSkill } from "@/lib/ai-tools/collab";
import { searchSkill } from "@/lib/ai-tools/search";
import { extrasSkill } from "@/lib/ai-tools/extras";

// 2026-05-27 overnight build — Inventory captions skill (Agent E).
// Lets the AI write WhatsApp marketing captions for inventory items in
// the workspace's currency + locale + industry voice.
import { inventoryCaptionSkill } from "@/lib/ai/skills/inventory-caption";

export const ALL_SKILLS: SkillDefinition[] = [
  workspaceSkill,
  crmContactsSkill,
  crmCompaniesSkill,
  crmDealsSkill,
  crmLeadsSkill,
  crmActivitiesSkill,
  filesSkill,
  boardsSkill,
  appsSkill,
  metaSkill,
  // 2026-05-14 batch
  tasksSkill,
  peopleSkill,
  collabSkill,
  searchSkill,
  extrasSkill,
  // 2026-05-27 batch
  inventoryCaptionSkill,
];

export function getSkillsByIds(ids: string[]): SkillDefinition[] {
  // Always include 'meta' so help/balance work on every turn.
  const want = new Set([...ids, "meta"]);
  return ALL_SKILLS.filter((s) => want.has(s.id));
}

export function getAllTools(skills: SkillDefinition[]): ToolDefinition[] {
  return skills.flatMap((s) => s.tools);
}

export function findTool(
  skills: SkillDefinition[],
  name: string
): ToolDefinition | null {
  for (const s of skills) {
    const t = s.tools.find((t) => t.name === name);
    if (t) return t;
  }
  return null;
}

/**
 * Wrap a tool's execute() with role + free-tier guards. Returns a friendly
 * error result instead of throwing — the LLM can show this to the user.
 */
export async function executeToolGuarded(
  tool: ToolDefinition,
  input: unknown,
  ctx: UserContext
): Promise<ToolExecuteResult> {
  const required = tool.required_role ?? "member";
  const roleErr = checkRole(ctx, required);
  if (roleErr) {
    return {
      ok: false,
      error: `${roleErr}: this tool requires ${required} role; you have ${ctx.role}`,
    };
  }
  const tierErr = checkFreeTier(ctx, tool.read_only);
  if (tierErr) {
    return {
      ok: false,
      error:
        "Free tier is read-only. Upgrade to Pro to let the assistant create and update records.",
    };
  }
  try {
    return await tool.execute(input, ctx);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
