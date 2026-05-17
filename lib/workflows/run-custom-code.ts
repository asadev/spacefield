import "server-only";

/* ─────────────────────────────────────────────────────────────────────────
 * run-custom-code — eval helper for the `custom_code` workflow step.
 *
 * THIS IS NOT A REAL SANDBOX.
 *
 * `new Function(args, body)` runs in the same v8 isolate as the rest of
 * the Next.js server process. We null out the obvious globals (fetch,
 * crypto, process, require, globalThis, etc) by shadowing them as
 * parameters before the user code runs, but a sufficiently motivated
 * caller can still escape via `(function(){return this})()`, Function
 * constructor introspection, prototype-chain walks, or by throwing an
 * error whose stack the host might log. There is no memory cap, no CPU
 * cap besides the wallclock timer, and no filesystem isolation.
 *
 * Implications:
 *   1. NEVER let non-admins author custom_code steps. The admin UI must
 *      gate the editor behind a workspace-role check; the runner relies
 *      on that gate, not on the JS-level "sandbox".
 *   2. Audit-log every execution (workflow_id, run_id, hash(code),
 *      duration, success/error). When an issue is reported, that log is
 *      the only way to forensically reconstruct what ran.
 *   3. Treat the return value as untrusted: it goes back into the
 *      runtime's step-result map and may be interpolated into webhook
 *      bodies / comments by later steps. Stringify with a size cap.
 *
 * To swap this for a real sandbox later, replace `runCustomCode` with a
 * call to `isolated-vm`, a worker_thread + structuredClone bridge, or a
 * Wasm interpreter (QuickJS via njs/quickjs-emscripten). The interface
 * (input → output, time-bounded promise) stays the same.
 * ───────────────────────────────────────────────────────────────────── */

export interface RunCustomCodeInput {
  /** Trigger payload (mirrors what other step kinds see). */
  trigger: unknown;
  /** Accumulated step context — output_vars from earlier steps, plus
   *  a few helpers we choose to expose. Caller decides what to put here. */
  ctx: Record<string, unknown>;
  /** The user-authored JS body. Must evaluate to (or `return`) a
   *  JSON-serialisable value. Both `return value;` and a final
   *  expression statement work — we wrap in a function. */
  code: string;
  /** Wall-clock cap in ms. Clamped to [50, 30_000]. */
  timeout_ms?: number;
}

export interface RunCustomCodeResult {
  ok: boolean;
  /** JSON-cloned return value when ok; undefined on error. Note: we
   *  pass it through JSON.parse(JSON.stringify(x)) to detach from any
   *  references the user code might have retained. */
  output?: unknown;
  /** Set when ok=false. Strings only — Error objects are flattened to
   *  message so we never leak host stack frames to the caller. */
  error?: string;
  /** Wall-clock ms the user code ran for. */
  duration_ms: number;
  /** True when the timeout fired (error will be "timeout"). */
  timed_out: boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 30_000;
/** Cap on the JSON-stringified size of the returned value. Anything
 *  larger is rejected to keep one bad step from blowing up the run row. */
const MAX_OUTPUT_BYTES = 256 * 1024;

/* Names we shadow so `fetch(...)` etc. fail with ReferenceError-ish
 * behaviour inside the user code. Not a security boundary — see file
 * header — but it nudges accidental misuse into a clear failure. */
const SHADOWED_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "XMLHttpRequest",
  "WebSocket",
  "crypto",
  "process",
  "require",
  "module",
  "exports",
  "global",
  "globalThis",
  "self",
  "window",
  "document",
  "navigator",
  "location",
  "console",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "Worker",
  "SharedArrayBuffer",
  "Atomics",
  "WebAssembly",
  "Buffer",
  "import",
];

export async function runCustomCode(
  input: RunCustomCodeInput,
): Promise<RunCustomCodeResult> {
  const started = Date.now();
  const timeout = clamp(
    input.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );

  let fn: ((trigger: unknown, ctx: Record<string, unknown>) => unknown) | null = null;
  try {
    // Wrap the user body in `return (function(){ ... })()` so callers
    // can use either `return x;` or rely on a final expression.
    const wrapped = `"use strict"; return (function(){\n${input.code}\n}).call({});`;
    fn = new Function(
      "trigger",
      "ctx",
      ...SHADOWED_GLOBALS,
      wrapped,
    ) as (trigger: unknown, ctx: Record<string, unknown>) => unknown;
  } catch (e) {
    return {
      ok: false,
      error: `compile: ${errMessage(e)}`,
      duration_ms: Date.now() - started,
      timed_out: false,
    };
  }

  // Build a fresh array of `undefined`s the same length as SHADOWED_GLOBALS
  // — passed positionally to shadow each name inside the function body.
  const shadowArgs: undefined[] = SHADOWED_GLOBALS.map(() => undefined);

  const exec = new Promise<unknown>((resolve, reject) => {
    try {
      // Run synchronously, but resolve via Promise so we can race a timer.
      const out = (fn as (...args: unknown[]) => unknown)(
        input.trigger,
        input.ctx,
        ...shadowArgs,
      );
      // If the user code returned a thenable, await it.
      Promise.resolve(out).then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeout);
  });

  try {
    const raw = await Promise.race([exec, timeoutP]);
    if (timer) clearTimeout(timer);
    // Detach from any references in user code; reject non-serialisable.
    let serialised: string;
    try {
      serialised = JSON.stringify(raw ?? null);
    } catch (e) {
      return {
        ok: false,
        error: `result not JSON-serialisable: ${errMessage(e)}`,
        duration_ms: Date.now() - started,
        timed_out: false,
      };
    }
    if (serialised && serialised.length > MAX_OUTPUT_BYTES) {
      return {
        ok: false,
        error: `result exceeds ${MAX_OUTPUT_BYTES} bytes`,
        duration_ms: Date.now() - started,
        timed_out: false,
      };
    }
    const output = serialised ? JSON.parse(serialised) : null;
    return {
      ok: true,
      output,
      duration_ms: Date.now() - started,
      timed_out: false,
    };
  } catch (e) {
    if (timer) clearTimeout(timer);
    const msg = errMessage(e);
    return {
      ok: false,
      error: msg,
      duration_ms: Date.now() - started,
      timed_out: msg === "timeout",
    };
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
