import "server-only";

/**
 * Prompt A/B/C variant assignment.
 *
 * When we tweak a skill's system prompt or instructions, we want to
 * roll out the new version to a slice of users first to measure
 * latency / error rate / satisfaction against the old one. This module
 * answers a single question: "for this (user, skill) pair, should the
 * runtime use variant A, B, or C of the prompt?"
 *
 * Design choices:
 *   - Deterministic — same (user, skill, salt) ALWAYS produces the
 *     same variant. We hash the inputs with FNV-1a and bucket the
 *     32-bit output mod the variant count. No DB lookup in the hot
 *     path.
 *   - Persisted — we record the assignment to `prompt_ab_assignments`
 *     on first roll so admins can slice metrics by variant later.
 *     Subsequent dispatches don't re-roll (the unique index on
 *     (user_id, skill_id) makes the insert a no-op on conflict).
 *   - Configured — the per-skill weights + experiment metadata live
 *     in `runtime_config` under `prompt_ab.<skill_id>`. Absent =
 *     everyone gets variant A (no experiment).
 *
 * The module exposes a single public function — `pickPromptVariant`.
 * Callers in the runtime read the returned variant string and route
 * to whichever prompt body they have on disk for that skill.
 *
 * READ-ONLY on other runtime files: we don't import / wrap
 * executor.ts / orchestrator.ts / persona.ts. The caller decides
 * when to invoke us.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { log } from "@/lib/log";

export type PromptVariant = "A" | "B" | "C";

export interface PromptVariantConfig {
  /** Experiment identifier — written to the assignment row so we can
   *  distinguish "variant B from the May experiment" from "variant B
   *  from the June experiment". Free-form. */
  experiment_id?: string;
  /** Weight distribution. Defaults to {A:100}. */
  weights?: Partial<Record<PromptVariant, number>>;
  /** Optional salt — bump to force a re-roll across all users for
   *  this skill (e.g. after the experiment cycle is reset). */
  salt?: string;
}

export interface PickPromptVariantOpts {
  /** Skip the DB write — useful for unit tests. */
  ephemeral?: boolean;
}

export interface PickPromptVariantResult {
  variant: PromptVariant;
  experiment_id: string | null;
  /** True when this is the first time the runtime saw this pairing. */
  fresh: boolean;
}

/**
 * Resolve the active A/B/C variant for a (user, skill) pair.
 *
 *   const { variant } = await pickPromptVariant("triage", userId);
 *   const prompt = PROMPTS[skill][variant];
 *
 * `userId` is required — we need a stable input to hash. Anonymous
 * callers should pass a session id or some other stable token. Pass
 * `null` to opt out (always returns "A", no DB write).
 */
export async function pickPromptVariant(
  skillId: string,
  userId: string | null,
  opts: PickPromptVariantOpts = {}
): Promise<PickPromptVariantResult> {
  if (!skillId || !userId) {
    return { variant: "A", experiment_id: null, fresh: false };
  }

  // Load the per-skill config. Cached by lib/runtime-config.ts for
  // 30s, so this is effectively in-process for hot paths.
  const cfg = await getRuntimeConfig<PromptVariantConfig | null>(
    `prompt_ab.${skillId}`,
    null
  );

  if (!cfg || !cfg.weights || Object.keys(cfg.weights).length === 0) {
    return { variant: "A", experiment_id: null, fresh: false };
  }

  const variant = bucket(skillId, userId, cfg);
  const experimentId = cfg.experiment_id ?? null;

  // No A/B if everyone gets the same variant — saves a write.
  const distinctVariants = Object.keys(cfg.weights).length;
  if (distinctVariants <= 1 && variant === "A") {
    return { variant, experiment_id: experimentId, fresh: false };
  }

  if (opts.ephemeral) {
    return { variant, experiment_id: experimentId, fresh: false };
  }

  const fresh = await recordAssignment({
    user_id: userId,
    skill_id: skillId,
    variant,
    experiment_id: experimentId,
  });

  return { variant, experiment_id: experimentId, fresh };
}

/* ─────────────────────── bucket helper ─────────────────────── */

/**
 * Hash (user, skill, salt) into a stable 32-bit integer, mod the
 * total weight, then walk the variants in declared order until the
 * running tally exceeds the rolled value.
 */
function bucket(
  skillId: string,
  userId: string,
  cfg: PromptVariantConfig
): PromptVariant {
  const weights = cfg.weights ?? { A: 100 };
  const salt = cfg.salt ?? "v1";
  const total = ["A", "B", "C"].reduce(
    (acc, k) => acc + Math.max(0, weights[k as PromptVariant] ?? 0),
    0
  );
  if (total <= 0) return "A";

  const roll = fnv1a(`${userId}|${skillId}|${salt}`) % total;

  let running = 0;
  for (const v of ["A", "B", "C"] as const) {
    running += Math.max(0, weights[v] ?? 0);
    if (roll < running) return v;
  }
  return "A";
}

/** Tiny non-crypto hash. Fast + dependency-free + deterministic. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* ─────────────────────── DB write ─────────────────────── */

interface RecordAssignmentInput {
  user_id: string;
  skill_id: string;
  variant: PromptVariant;
  experiment_id: string | null;
}

/**
 * Persist the assignment. Returns true iff the insert produced a new
 * row (fresh assignment); false on conflict (we've seen this pair
 * before) or any error.
 *
 * We rely on the unique (user_id, skill_id) constraint declared in
 * 20260520c_misc_features.sql so concurrent dispatches can't double-
 * write — the second one cleanly noops.
 */
async function recordAssignment(
  input: RecordAssignmentInput
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("prompt_ab_assignments")
      .upsert(
        {
          user_id: input.user_id,
          skill_id: input.skill_id,
          variant: input.variant,
          experiment_id: input.experiment_id,
        },
        { onConflict: "user_id,skill_id", ignoreDuplicates: true }
      )
      .select("id");
    if (error) {
      log.warn("prompt_ab.write_failed", { error: error.message });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    log.warn("prompt_ab.write_unexpected", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
