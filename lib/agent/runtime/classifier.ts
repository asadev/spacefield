/* GPT-4o mini pre-classifier.
 *
 * One cheap call per inbound message that decides:
 *   - intent (free-text label)
 *   - skills[] — which skill ids to expose to the executor
 *   - complexity — drives the executor-vs-orchestrator branch
 *   - requires_clarification + suggested_reply — short-circuit obvious cases
 *
 * Strict JSON schema response keeps the parser bulletproof. ~50 output
 * tokens; the prompt is short enough that no caching is needed yet.
 */

import OpenAI from "openai";
import type { ClassifierResult } from "./types";

const SKILL_SUMMARY = `
Available skill ids and what they cover:
- workspace: list workspaces, switch workspace, members, invites
- crm.contacts: people in the CRM (read + write)
- crm.companies: companies in the CRM (read + write)
- crm.deals: pipeline deals, stages, won/lost
- crm.leads: incoming leads, qualify, convert
- crm.activities: tasks, calls, meetings, emails
- files: workspace file search and meta
- boards: notion-like database boards
- meta: help, balance, "what can you do"
`.trim();

const SYSTEM = `You are a pre-classifier for the Spacefield workspace AI assistant.
The user texted via WhatsApp and is asking you to do something inside their workspace.
${SKILL_SUMMARY}

Return ONLY a JSON object matching this shape:
{
  "intent": "<short label, e.g. 'create_deal' or 'show_pipeline' or 'greeting'>",
  "skills": ["<skill-id>", ...],   // skills the executor must have access to
  "complexity": "simple" | "complex" | "off_topic",
  "requires_clarification": <bool>,
  "suggested_reply": "<short string, only when off_topic OR requires_clarification>"
}

Rules:
- "simple" = one skill, one tool call, deterministic.
- "complex" = multiple steps, multiple tools, planning needed.
- "off_topic" = not about the workspace. Set suggested_reply to a friendly redirect.
- Pick the FEWEST skills that could plausibly handle the request. Empty array is allowed for greetings.
- Greetings, thanks, "hi", "what can you do" → intent="meta", skills=["meta"], complexity="simple".`;

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export interface ClassifierCallResult {
  result: ClassifierResult;
  tokens: number;
  model: string;
}

export async function classify(
  userText: string,
  recentHistory: { role: "user" | "assistant"; content: string }[]
): Promise<ClassifierCallResult> {
  const model = "gpt-4o-mini";
  const recent = recentHistory
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");
  const userPrompt = recent
    ? `Recent context:\n${recent}\n\nNew message: ${userText}`
    : userText;

  const resp = await client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 200,
    temperature: 0,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<ClassifierResult> = {};
  try {
    parsed = JSON.parse(raw) as Partial<ClassifierResult>;
  } catch {
    parsed = {};
  }

  const result: ClassifierResult = {
    intent: typeof parsed.intent === "string" ? parsed.intent : "unknown",
    skills: Array.isArray(parsed.skills)
      ? parsed.skills.filter((s): s is string => typeof s === "string")
      : [],
    complexity:
      parsed.complexity === "complex" ||
      parsed.complexity === "off_topic" ||
      parsed.complexity === "simple"
        ? parsed.complexity
        : "simple",
    requires_clarification: Boolean(parsed.requires_clarification),
    suggested_reply:
      typeof parsed.suggested_reply === "string"
        ? parsed.suggested_reply
        : undefined,
  };

  const tokens =
    (resp.usage?.prompt_tokens ?? 0) + (resp.usage?.completion_tokens ?? 0);

  return { result, tokens, model };
}
