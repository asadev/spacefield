#!/usr/bin/env -S pnpm tsx
/* eslint-disable no-console */
/* Function-calling sanity check for every skill in ALL_SKILLS.
 *
 * Not a CI test — this exists so a developer iterating on a skill (new
 * tool, renamed argument, tweaked description) can run:
 *
 *   pnpm tsx scripts/test-tool-calling.ts
 *
 * …and get a quick pass/fail per skill: did the model emit a tool_use
 * block, did the tool name match one in scope, did the input parse
 * against the declared input_schema? We never actually invoke the
 * tool's execute() — there's no real Supabase session here. We're
 * only checking that the LLM agrees the tool catalog is well-formed
 * enough to be reachable.
 *
 * Requires ANTHROPIC_API_KEY in the env. Picks Haiku 4.5 for cost.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ALL_SKILLS } from "@/lib/agent/skills";
import type {
  JsonSchema,
  SkillDefinition,
  ToolDefinition,
} from "@/lib/agent/runtime/types";

const MODEL = "claude-haiku-4-5";

/** One fixed prompt per skill id. Tuned so the model has an obvious
 *  reason to pick one of the skill's tools, without leaking specific
 *  arg values. We don't care which tool gets picked — just that one
 *  does and the input parses. */
const PROMPTS: Record<string, string> = {
  workspace: "Show me my workspaces.",
  "crm.contacts": "List the most recent contacts in the CRM.",
  "crm.companies": "Show me companies in the CRM.",
  "crm.deals": "What deals do I have open right now?",
  "crm.leads": "Show me my latest leads.",
  "crm.activities": "What activities are due today?",
  files: "Search my files for the latest invoice.",
  boards: "Show me my Notion-style boards.",
  apps: "What apps do I have installed?",
  meta: "What can you do?",
  tasks: "Show me my overdue tasks.",
  people: "Who is on the team?",
  collab: "Show me my inbox notifications.",
  search: "Find anything called 'quarterly review'.",
  extras: "List my favorited items.",
};

interface SkillResult {
  skillId: string;
  toolCount: number;
  pass: boolean;
  toolUsed: string | null;
  reason: string;
}

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("Missing ANTHROPIC_API_KEY. Set it and re-run.");
    process.exit(2);
  }
  return new Anthropic({ apiKey: key });
}

function toAnthropicTools(skill: SkillDefinition): Anthropic.Messages.Tool[] {
  return skill.tools.map((t: ToolDefinition) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool["input_schema"],
  }));
}

/**
 * Tiny structural validator for tool_use input against the declared
 * input_schema. We don't pull a full JSON-schema validator — this script
 * is a developer convenience, not a compliance check. We verify:
 *   - the input is a JSON object
 *   - declared `required` keys are present
 *   - declared property types (string/number/boolean/object/array) match
 *     when the field is present
 */
function validateToolInput(input: unknown, schema: JsonSchema): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return "input is not an object";
  }
  const obj = input as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const r of required) {
    if (typeof r !== "string") continue;
    if (!(r in obj)) return `missing required field: ${r}`;
  }
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>;
  for (const [key, value] of Object.entries(obj)) {
    const propSchema = props[key];
    if (!propSchema) continue; // unknown extra arg — let it slide
    const expected = typeof propSchema.type === "string" ? propSchema.type : null;
    if (!expected) continue;
    if (expected === "string" && typeof value !== "string") {
      return `field ${key} expected string, got ${typeof value}`;
    }
    if (expected === "number" && typeof value !== "number") {
      return `field ${key} expected number, got ${typeof value}`;
    }
    if (expected === "boolean" && typeof value !== "boolean") {
      return `field ${key} expected boolean, got ${typeof value}`;
    }
    if (expected === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
      return `field ${key} expected object`;
    }
    if (expected === "array" && !Array.isArray(value)) {
      return `field ${key} expected array`;
    }
  }
  return null;
}

async function testSkill(
  client: Anthropic,
  skill: SkillDefinition
): Promise<SkillResult> {
  const prompt = PROMPTS[skill.id];
  const toolCount = skill.tools.length;
  if (toolCount === 0) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: null,
      reason: "skill has no tools",
    };
  }
  if (!prompt) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: null,
      reason: "no fixed prompt for this skill — add one to PROMPTS",
    };
  }

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: `You are a Spacefield workspace assistant.
Skill in scope: [${skill.id}] ${skill.systemFragment}
When the user asks for something the skill can do, pick a tool and call it. Don't reply in prose.`,
      tools: toAnthropicTools(skill),
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: null,
      reason: `api error: ${(e as Error).message}`,
    };
  }

  if (response.stop_reason !== "tool_use") {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: null,
      reason: `expected tool_use, got stop_reason=${response.stop_reason}`,
    };
  }

  const use = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
  );
  if (!use) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: null,
      reason: "stop_reason=tool_use but no tool_use block",
    };
  }

  const tool = skill.tools.find((t) => t.name === use.name);
  if (!tool) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: use.name,
      reason: `model called ${use.name}, not in skill catalog`,
    };
  }

  const validationError = validateToolInput(use.input, tool.input_schema);
  if (validationError) {
    return {
      skillId: skill.id,
      toolCount,
      pass: false,
      toolUsed: use.name,
      reason: validationError,
    };
  }

  return {
    skillId: skill.id,
    toolCount,
    pass: true,
    toolUsed: use.name,
    reason: "ok",
  };
}

async function main(): Promise<void> {
  const client = getClient();
  const skills = ALL_SKILLS;
  console.log(`Testing tool-calling against ${skills.length} skills (model=${MODEL})\n`);

  const results: SkillResult[] = [];
  // Run sequentially — keep it polite to the API and easy to read in the
  // terminal. Parallelising for one developer run isn't worth the
  // shuffled output.
  for (const skill of skills) {
    process.stdout.write(`  ${skill.id} ... `);
    const r = await testSkill(client, skill);
    results.push(r);
    process.stdout.write(`${r.pass ? "PASS" : "FAIL"}  (${r.toolUsed ?? "—"})  ${r.reason}\n`);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} pass, ${failed} fail (of ${results.length})`);

  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  - ${r.skillId}: ${r.reason}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
