#!/usr/bin/env -S pnpm tsx
/* eslint-disable no-console */
/* Cold-start measurement against /api/health from N geographic origins.
 *
 *   pnpm tsx scripts/measure-cold-start.ts
 *   pnpm tsx scripts/measure-cold-start.ts --url https://staging.spacefield.co --runs 20
 *
 * What it does:
 *   - Fires `iterations * (1 cold + warmRuns warm)` curl probes per
 *     "region" (here = a local network probe; for true regional cold-
 *     start use the CI matrix described in docs/perf/COLD-START.md).
 *   - Forces a cold start by varying a `?_cs=<nonce>` query so Vercel
 *     can't reuse a warm lambda instance (each unique URL has its own
 *     warm-pool slot for the first hit per region).
 *   - Reports p50 / p95 cold + warm in milliseconds, plus the longest
 *     hit (the actual user-pain number).
 *
 * Notes:
 *   - This script intentionally uses `curl -w` rather than fetch() —
 *     curl reports `time_appconnect` (TLS done) and `time_starttransfer`
 *     (TTFB) separately, which is what we actually care about for cold
 *     start. fetch() can't split those phases cleanly.
 *   - "Cold" here means the lambda instance is cold, not the CDN edge.
 *     We don't measure CDN cache because /api/health is uncached
 *     (no-store) by design.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

type ProbeSample = {
  status: number;
  totalMs: number;       // time_total in ms
  connectMs: number;     // time_connect (TCP) in ms
  tlsMs: number;         // time_appconnect (TLS) in ms
  ttfbMs: number;        // time_starttransfer (TTFB) in ms
};

type Args = {
  url: string;
  iterations: number;
  warmRuns: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    url: "https://spacefield.co/api/health",
    iterations: 10,
    warmRuns: 4,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) {
      args.url = argv[++i]!;
    } else if (a === "--runs" && argv[i + 1]) {
      args.iterations = Math.max(1, parseInt(argv[++i]!, 10) || 10);
    } else if (a === "--warm" && argv[i + 1]) {
      args.warmRuns = Math.max(0, parseInt(argv[++i]!, 10) || 4);
    }
  }
  return args;
}

function curlProbe(url: string): ProbeSample {
  // -o /dev/null  — discard body
  // -s            — silent
  // -w <fmt>      — write timing fields
  // We pin a sensible total timeout so a hung region can't wedge the script.
  const fmt = "%{http_code} %{time_total} %{time_connect} %{time_appconnect} %{time_starttransfer}";
  const result = spawnSync(
    "curl",
    [
      "-o", "/dev/null",
      "-s",
      "-A", "spacefield-cold-start-probe/1.0",
      "--max-time", "30",
      "-w", fmt,
      url,
    ],
    { encoding: "utf8" }
  );

  if (result.error) {
    return { status: 0, totalMs: -1, connectMs: -1, tlsMs: -1, ttfbMs: -1 };
  }

  const parts = (result.stdout || "").trim().split(/\s+/);
  const [code, total, connect, tls, ttfb] = parts;
  const toMs = (s: string | undefined): number =>
    s ? Math.round(parseFloat(s) * 1000) : -1;

  return {
    status: parseInt(code ?? "0", 10) || 0,
    totalMs: toMs(total),
    connectMs: toMs(connect),
    tlsMs: toMs(tls),
    ttfbMs: toMs(ttfb),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function summarize(label: string, samples: ProbeSample[]) {
  const ttfbs = samples.filter((s) => s.status >= 200 && s.status < 500).map((s) => s.ttfbMs);
  const totals = samples.filter((s) => s.status >= 200 && s.status < 500).map((s) => s.totalMs);
  const errors = samples.filter((s) => !(s.status >= 200 && s.status < 500)).length;

  console.log(
    `  ${pad(label, 6)} ` +
      `n=${pad(String(samples.length), 3)} ` +
      `errors=${pad(String(errors), 3)} ` +
      `ttfb p50=${pad(String(percentile(ttfbs, 50)) + "ms", 8)} ` +
      `p95=${pad(String(percentile(ttfbs, 95)) + "ms", 8)} ` +
      `max=${pad(String(Math.max(0, ...ttfbs)) + "ms", 8)} ` +
      `total p95=${pad(String(percentile(totals, 95)) + "ms", 8)}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`cold-start probe`);
  console.log(`  url:        ${args.url}`);
  console.log(`  iterations: ${args.iterations}   (each = 1 cold + ${args.warmRuns} warm)`);
  console.log("");

  const coldSamples: ProbeSample[] = [];
  const warmSamples: ProbeSample[] = [];

  for (let i = 0; i < args.iterations; i++) {
    const nonce = randomBytes(6).toString("hex");
    const sep = args.url.includes("?") ? "&" : "?";
    const coldUrl = `${args.url}${sep}_cs=${nonce}`;

    process.stdout.write(`iter ${i + 1}/${args.iterations}  cold…`);
    const cold = curlProbe(coldUrl);
    coldSamples.push(cold);
    process.stdout.write(` ${cold.ttfbMs}ms (status ${cold.status})  warm…`);

    for (let w = 0; w < args.warmRuns; w++) {
      const warm = curlProbe(coldUrl);
      warmSamples.push(warm);
    }
    process.stdout.write(` done\n`);
  }

  console.log("");
  console.log("results:");
  summarize("cold", coldSamples);
  summarize("warm", warmSamples);

  const coldP95 = percentile(
    coldSamples.filter((s) => s.status >= 200 && s.status < 500).map((s) => s.ttfbMs),
    95
  );
  const warmP95 = percentile(
    warmSamples.filter((s) => s.status >= 200 && s.status < 500).map((s) => s.ttfbMs),
    95
  );
  const delta = coldP95 - warmP95;
  console.log("");
  console.log(`cold-start penalty (p95 ttfb): ${delta}ms  (cold ${coldP95}ms − warm ${warmP95}ms)`);

  // Exit non-zero if any probe errored — useful in CI.
  const anyError = [...coldSamples, ...warmSamples].some(
    (s) => !(s.status >= 200 && s.status < 500)
  );
  process.exit(anyError ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
