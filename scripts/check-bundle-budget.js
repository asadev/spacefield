#!/usr/bin/env node
/*
 * scripts/check-bundle-budget.js
 *
 * Run AFTER `next build`. Walks .next/build-manifest.json + the
 * App Router's `.next/app-build-manifest.json` and asserts that the
 * shared client-side JavaScript ships under a budget. Fails (exit 1)
 * if any tracked entrypoint busts its budget.
 *
 * Usage:
 *
 *   node scripts/check-bundle-budget.js
 *   node scripts/check-bundle-budget.js --budget=550   # override (KB)
 *   node scripts/check-bundle-budget.js --report-only  # never exit 1
 *
 * Why this lives outside the Next config:
 *   - Editing `next.config.ts` is out of scope for the test agent.
 *   - The check should also run in CI on the merged build, not just
 *     in webpack's stats lifecycle.
 *
 * Budget rationale (default 550 KB):
 *   - Next 16 ships ~150 KB of framework chunks (react-dom,
 *     scheduler, runtime).
 *   - Our shared client chunk historically lands ~250-300 KB.
 *   - 550 KB gives ~100 KB of headroom before we should investigate.
 *   - Tweak via SPACEFIELD_BUNDLE_BUDGET_KB or the --budget flag.
 *
 * Output is intentionally machine-readable on success/failure so
 * downstream CI can grep for "BUDGET-OK" / "BUDGET-FAIL".
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(REPO_ROOT, ".next");
const BUILD_MANIFEST = path.join(NEXT_DIR, "build-manifest.json");
const APP_BUILD_MANIFEST = path.join(NEXT_DIR, "app-build-manifest.json");

function parseArgs(argv) {
  const out = { budgetKb: null, reportOnly: false };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--budget=")) {
      const n = Number(arg.slice("--budget=".length));
      if (Number.isFinite(n) && n > 0) out.budgetKb = n;
    } else if (arg === "--report-only") {
      out.reportOnly = true;
    }
  }
  return out;
}

function resolveBudgetKb(cliBudget) {
  if (cliBudget) return cliBudget;
  const envBudget = Number(process.env.SPACEFIELD_BUNDLE_BUDGET_KB);
  if (Number.isFinite(envBudget) && envBudget > 0) return envBudget;
  return 550; // default — see header.
}

function fileSizeBytes(rel) {
  const abs = path.join(NEXT_DIR, rel);
  try {
    return fs.statSync(abs).size;
  } catch {
    return null;
  }
}

function totalSize(files) {
  let total = 0;
  const missing = [];
  for (const f of files) {
    const size = fileSizeBytes(f);
    if (size == null) {
      missing.push(f);
    } else {
      total += size;
    }
  }
  return { total, missing };
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    return { __error: err.message };
  }
}

function fmt(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function main() {
  const args = parseArgs(process.argv);
  const budgetKb = resolveBudgetKb(args.budgetKb);
  const budgetBytes = budgetKb * 1024;

  if (!fs.existsSync(NEXT_DIR)) {
    console.error(
      "[bundle-budget] .next/ not found — run `next build` first.",
    );
    process.exit(args.reportOnly ? 0 : 1);
  }

  const manifest = loadJson(BUILD_MANIFEST);
  if (manifest.__error) {
    console.error(
      `[bundle-budget] failed to read build-manifest.json: ${manifest.__error}`,
    );
    process.exit(args.reportOnly ? 0 : 1);
  }

  const appManifest = fs.existsSync(APP_BUILD_MANIFEST)
    ? loadJson(APP_BUILD_MANIFEST)
    : null;

  // build-manifest.json schema:
  //   {
  //     polyfillFiles: string[],
  //     devFiles: string[],
  //     ampDevFiles: string[],
  //     lowPriorityFiles: string[],
  //     rootMainFiles: string[],
  //     pages: { "/": [...], "/foo": [...] }
  //   }
  //
  // We assert on the "first-load JS" that EVERY page incurs:
  //   rootMainFiles + the shared chunks under `pages["/"]`.
  // App Router routes contribute `appManifest.pages["/page"]`.

  const rootMain = Array.isArray(manifest.rootMainFiles)
    ? manifest.rootMainFiles
    : [];
  const homePage = (manifest.pages && manifest.pages["/"]) || [];
  // Some Next versions also list "/_app" — include if present.
  const appRoute = (manifest.pages && manifest.pages["/_app"]) || [];

  const trackedSet = new Set([...rootMain, ...homePage, ...appRoute]);

  // Pull the App Router root page bundle when available.
  if (appManifest && appManifest.pages) {
    const appHome = appManifest.pages["/page"];
    if (Array.isArray(appHome)) for (const f of appHome) trackedSet.add(f);
  }

  const tracked = [...trackedSet];

  if (tracked.length === 0) {
    console.error(
      "[bundle-budget] no entrypoint files found in build manifests — manifest schema may have changed.",
    );
    process.exit(args.reportOnly ? 0 : 1);
  }

  const { total, missing } = totalSize(tracked);

  if (missing.length > 0) {
    console.warn(
      `[bundle-budget] ${missing.length} files listed in manifest were not on disk (continuing):`,
      missing.slice(0, 5),
    );
  }

  const overBudget = total > budgetBytes;
  const status = overBudget ? "BUDGET-FAIL" : "BUDGET-OK";

  console.log(`[bundle-budget] ${status}`);
  console.log(`[bundle-budget]   first-load JS: ${fmt(total)}`);
  console.log(`[bundle-budget]   budget:        ${fmt(budgetBytes)} (${budgetKb} KB)`);
  console.log(`[bundle-budget]   files counted: ${tracked.length}`);

  if (overBudget) {
    const top = tracked
      .map((f) => ({ f, size: fileSizeBytes(f) ?? 0 }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 8);
    console.log("[bundle-budget]   top contributors:");
    for (const { f, size } of top) {
      console.log(`[bundle-budget]     ${fmt(size).padStart(9)}  ${f}`);
    }
    if (!args.reportOnly) {
      console.error(
        `[bundle-budget] FAIL: first-load JS ${fmt(total)} > budget ${fmt(budgetBytes)}`,
      );
      process.exit(1);
    }
  }
}

main();
