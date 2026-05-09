/* Skill source inspector — used by the admin panel to surface the actual
 * TypeScript source of a code-defined skill so admins can see exactly
 * what the runtime will execute.
 *
 * The DB row's `handler_module` column points at the skill's source
 * directory (e.g. `lib/agent/skills/crm-deals`). We try `<module>/index.ts`
 * first, then `<module>.ts`. If `handler_module` is missing we fall back
 * to a derived path from the skill id — supporting both the literal id
 * (e.g. `meta` → `lib/agent/skills/meta/index.ts`) and the dotted-→-dashed
 * convention used by the existing skills (`crm.deals` → `crm-deals`).
 *
 * Reads happen at server-render time only (server components / server
 * actions / route handlers). The source text is rendered inside a
 * <pre> block — callers are responsible for HTML-escaping.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { ALL_SKILLS } from "./index";

const ROOT = process.cwd();
const SKILLS_DIR = path.join(ROOT, "lib", "agent", "skills");

/**
 * Resolve the disk path of a skill's source. Prefers `handlerModule` when
 * provided (it's the canonical pointer set on the DB row). Returns `null`
 * if no candidate file exists.
 */
async function resolveSkillPath(
  skillId: string,
  handlerModule: string | null
): Promise<string | null> {
  const candidates = pathCandidates(skillId, handlerModule);
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isFile()) return c;
    } catch {
      // not a file — try next
    }
  }
  return null;
}

function pathCandidates(skillId: string, handlerModule: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (p: string) => {
    const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  };

  if (handlerModule && handlerModule.trim()) {
    const m = handlerModule.trim();
    // module may already include extension — try as-is, else folder/index.ts and file.ts
    if (m.endsWith(".ts")) {
      push(m);
    } else {
      push(path.join(m, "index.ts"));
      push(`${m}.ts`);
    }
  }

  // Fallbacks based on the skill id itself.
  const literal = skillId.trim();
  if (literal) {
    push(path.join(SKILLS_DIR, literal, "index.ts"));
    push(path.join(SKILLS_DIR, `${literal}.ts`));
    // Dotted convention → dashed (crm.deals → crm-deals)
    if (literal.includes(".")) {
      const dashed = literal.replace(/\./g, "-");
      push(path.join(SKILLS_DIR, dashed, "index.ts"));
      push(path.join(SKILLS_DIR, `${dashed}.ts`));
    }
  }
  return out;
}

/**
 * Read the source code for a skill. Returns null when no file is found
 * (e.g. for `kind='custom'` skills, or a code skill whose source has been
 * removed). Otherwise returns the absolute on-disk path (relative to repo
 * root) and the raw UTF-8 content.
 */
export async function readSkillSource(
  skillId: string,
  handlerModule: string | null = null
): Promise<{ path: string; relPath: string; source: string } | null> {
  const abs = await resolveSkillPath(skillId, handlerModule);
  if (!abs) return null;
  try {
    const source = await fs.readFile(abs, "utf8");
    return {
      path: abs,
      relPath: path.relative(ROOT, abs),
      source,
    };
  } catch {
    return null;
  }
}

/**
 * Scan `lib/agent/skills/` and return the ids of every static-imported
 * skill. The runtime's `ALL_SKILLS` registry is the canonical source.
 * Does not hit disk — the imports are already in process at startup.
 */
export async function listCodeSkillIds(): Promise<string[]> {
  return ALL_SKILLS.map((s) => s.id).sort();
}

/**
 * Snapshot a skill's tool definitions as JSON so the admin UI can render
 * them side-by-side with overrides. Reads from the in-process registry
 * (no disk hit). Returns null when the skill is not statically wired in.
 */
export async function readCodeSkillTools(skillId: string): Promise<
  | {
      label: string;
      description: string;
      systemFragment: string;
      tools: {
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
        read_only: boolean;
        required_role?: string;
      }[];
    }
  | null
> {
  const s = ALL_SKILLS.find((sk) => sk.id === skillId);
  if (!s) return null;
  return {
    label: s.label,
    description: s.description,
    systemFragment: s.systemFragment,
    tools: s.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Record<string, unknown>,
      read_only: t.read_only,
      required_role: t.required_role,
    })),
  };
}
