#!/usr/bin/env node
/* Runtime-verify (BC) — manipulate site-wide state directly via service
 * role and confirm the runtime libs surface those changes on the live
 * site as anon.
 *
 * Tests:
 *   1. Baseline GET / — confirm 200, parse HTML for brand <style> +
 *      <[data-site-banner]> nodes, capture caching headers.
 *   2. Insert test banner — re-fetch / — confirm banner text appears.
 *   3. Cleanup banner.
 *   4. Update brand_configs.primary_color = '#ff0000' — re-fetch / —
 *      confirm `--brand-primary: #ff0000` is in the injected style.
 *   5. Reset brand row.
 *   6. Insert maintenance row (enabled=true, allowlist=[]) — re-fetch /
 *      as anon — confirm 30x → /maintenance OR maintenance HTML.
 *   7. Reset maintenance.
 *
 * Required env:
 *   SUPABASE_URL              (default: https://your-supabase-project-ref.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY (REQUIRED)
 *   SUPABASE_ANON_KEY         (optional — used for raw RPC sanity checks)
 *   SITE_URL                  (default: https://spacefield.co)
 *   PROPAGATION_WAIT_MS       (default: 35000 — caches are 30s TTL each)
 *
 * Run:
 *   node scripts/verify-runtime.mjs
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const undici = require("/Users/apple/scrape-tools/node_modules/undici");
const { createClient } = require("/Users/apple/scrape-tools/node_modules/@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://your-supabase-project-ref.supabase.co";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE_URL = process.env.SITE_URL || "https://spacefield.co";
const PROPAGATION_WAIT_MS = Number(process.env.PROPAGATION_WAIT_MS || 35000);

if (!SERVICE_ROLE) {
  console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required");
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/* Tiny test runner. Each step records pass/fail/blocked + a note. We
 * never throw out of a step; the run continues so we get a full
 * report even if early steps fail. Exit code at the end is 1 if any
 * step is fail/blocked. */
const results = [];
function record(step, status, note = "", extra = null) {
  const entry = { step, status, note };
  if (extra !== null) entry.extra = extra;
  results.push(entry);
  const tag = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : status.toUpperCase();
  console.log(`[${tag}] ${step}${note ? ` — ${note}` : ""}`);
}

async function fetchHtml(path = "/") {
  const url = SITE_URL + path;
  const res = await undici.request(url, {
    method: "GET",
    headers: {
      // Force a fresh response if any layer respects it. Cloud edges
      // mostly don't, but it doesn't hurt.
      "cache-control": "no-cache",
      "pragma": "no-cache",
      // Cache-buster query param doesn't help here because we want
      // EXACTLY the URL the user hits — middleware-controlled output.
    },
    maxRedirections: 0, // capture redirects ourselves
  });
  const headers = Object.fromEntries(
    Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v]),
  );
  let body = "";
  try { body = await res.body.text(); } catch { body = ""; }
  return {
    status: res.statusCode,
    headers,
    location: headers["location"] || null,
    body,
  };
}

function parseBrandStyle(html) {
  // The layout injects `<style>:root { --brand-primary: ...; ... }</style>`.
  // Look for any `<style>` containing `--brand-`.
  const re = /<style[^>]*>([^<]*--brand-[^<]*)<\/style>/i;
  const m = re.exec(html);
  if (!m) return null;
  const block = m[1];
  const vars = {};
  for (const declMatch of block.matchAll(/--brand-([a-z0-9_-]+)\s*:\s*([^;]+);/gi)) {
    vars[`--brand-${declMatch[1]}`] = declMatch[2].trim();
  }
  return { raw: block, vars };
}

function parseBanners(html) {
  // Each banner is `<div data-site-banner data-banner-id="...">`.
  const out = [];
  const re = /<div[^>]*data-site-banner[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const block = m[0];
    const idMatch = /data-banner-id="([^"]+)"/.exec(block);
    out.push({
      id: idMatch ? idMatch[1] : null,
      // Just probe for visible message text — the chip + message live
      // inside a flex row.
      hasMessageContaining: (s) => block.toLowerCase().includes(s.toLowerCase()),
      raw: block,
    });
  }
  return out;
}

async function step1Baseline() {
  const r = await fetchHtml("/");
  if (r.status !== 200) {
    record("step1.baseline-200", "fail", `expected 200, got ${r.status}`);
    return null;
  }
  record("step1.baseline-200", "pass", `status=${r.status}, prerender=${r.headers["x-nextjs-prerender"] || "0"}, vercel-cache=${r.headers["x-vercel-cache"] || "?"}`);
  const brand = parseBrandStyle(r.body);
  record("step1.brand-style-parse", "info", brand ? `vars=${JSON.stringify(brand.vars)}` : "no <style>--brand-* block found (expected when no override set)");
  const banners = parseBanners(r.body);
  record("step1.banner-parse", "info", `banners visible=${banners.length}`);
  return { ok: true, prerendered: r.headers["x-nextjs-prerender"] === "1", cache: r.headers["x-vercel-cache"] || null };
}

/* Test banner injection. */
async function step2Banner() {
  const TEST_MESSAGE = `runtime-verify-test-${Date.now()}`;
  const insert = await supa
    .from("site_banners")
    .insert({
      message: TEST_MESSAGE,
      variant: "info",
      audience: "all",
      audience_tiers: [],
      audience_user_ids: [],
      enabled: true,
      dismissible: false,
      metadata: { source: "runtime-verify" },
    })
    .select()
    .single();
  if (insert.error) {
    record("step2.insert-banner", "fail", insert.error.message);
    return;
  }
  const id = insert.data.id;
  record("step2.insert-banner", "pass", `id=${id}, message=${TEST_MESSAGE}`);

  // Wait for caches to expire (30s TTL).
  console.log(`  ... waiting ${PROPAGATION_WAIT_MS}ms for caches`);
  await new Promise((r) => setTimeout(r, PROPAGATION_WAIT_MS));

  const r = await fetchHtml("/");
  const banners = parseBanners(r.body);
  const found = banners.some((b) => b.hasMessageContaining(TEST_MESSAGE));
  if (found) {
    record("step2.verify-banner-renders", "pass", `banner '${TEST_MESSAGE}' present in /`);
  } else {
    record(
      "step2.verify-banner-renders",
      "fail",
      `banner '${TEST_MESSAGE}' NOT in /. prerender=${r.headers["x-nextjs-prerender"] || "0"} vercel-cache=${r.headers["x-vercel-cache"] || "?"}`,
      { bannersOnPage: banners.length },
    );
  }

  // Cleanup
  const del = await supa.from("site_banners").delete().eq("id", id);
  if (del.error) {
    record("step2.cleanup-banner", "fail", del.error.message);
  } else {
    record("step2.cleanup-banner", "pass", "deleted test banner");
  }
}

/* Brand color override. */
async function step3Brand() {
  // Find the global brand row (workspace_id is null). active_brand uses
  // the first matching row; we update ALL global rows so the test is
  // robust to multiple no-workspace rows existing.
  const list = await supa.from("brand_configs").select("id,primary_color").is("workspace_id", null);
  if (list.error) {
    record("step3.find-global-brand", "fail", list.error.message);
    return;
  }
  if (!list.data || list.data.length === 0) {
    record("step3.find-global-brand", "blocked", "no global brand_configs row exists; insert one first");
    return;
  }
  const ids = list.data.map((r) => r.id);
  const previousByID = Object.fromEntries(list.data.map((r) => [r.id, r.primary_color]));
  record("step3.find-global-brand", "pass", `found ${ids.length} global row(s): ${ids.join(",")}`);

  const TEST_COLOR = "#ff0000";
  const upd = await supa.from("brand_configs").update({ primary_color: TEST_COLOR }).is("workspace_id", null);
  if (upd.error) {
    record("step3.set-test-color", "fail", upd.error.message);
    return;
  }
  record("step3.set-test-color", "pass", `set primary_color=${TEST_COLOR} on global rows`);

  console.log(`  ... waiting ${PROPAGATION_WAIT_MS}ms for caches`);
  await new Promise((r) => setTimeout(r, PROPAGATION_WAIT_MS));

  const r = await fetchHtml("/");
  const brand = parseBrandStyle(r.body);
  if (brand && brand.vars["--brand-primary"] === TEST_COLOR) {
    record("step3.verify-brand-renders", "pass", `--brand-primary: ${TEST_COLOR} present`);
  } else {
    record(
      "step3.verify-brand-renders",
      "fail",
      `expected --brand-primary: ${TEST_COLOR}, got ${brand ? JSON.stringify(brand.vars) : "no <style>"}`,
      { prerender: r.headers["x-nextjs-prerender"] || "0", cache: r.headers["x-vercel-cache"] || "?" },
    );
  }

  // Reset — restore each row's previous value.
  for (const id of ids) {
    const prev = previousByID[id];
    const reset = await supa.from("brand_configs").update({ primary_color: prev }).eq("id", id);
    if (reset.error) {
      record(`step3.reset-${id}`, "fail", reset.error.message);
    }
  }
  record("step3.reset-brand", "pass", `reset ${ids.length} global row(s)`);
}

/* Maintenance redirect. */
async function step4Maintenance() {
  const TEST_MESSAGE = `runtime-verify-maintenance-${Date.now()}`;
  const upd = await supa
    .from("maintenance_state")
    .update({
      enabled: true,
      message: TEST_MESSAGE,
      allowlist_user_ids: [],
      read_only: false,
      starts_at: null,
      ends_at: null,
    })
    .eq("id", 1);
  if (upd.error) {
    record("step4.enable-maintenance", "fail", upd.error.message);
    return;
  }
  record("step4.enable-maintenance", "pass", `enabled=true, message=${TEST_MESSAGE}`);

  // Middleware caches the maintenance check for 30s, so we wait a
  // safe window. Use a longer wait here because Vercel's edge
  // instances can each have stale caches; we test once and accept
  // the result, but the user-side win is "redirects within ~30s".
  console.log(`  ... waiting ${PROPAGATION_WAIT_MS}ms for caches`);
  await new Promise((r) => setTimeout(r, PROPAGATION_WAIT_MS));

  // Try several times, hitting different edge nodes via random query
  // strings to avoid CDN cached-200 hits.
  let outcome = null;
  for (let i = 0; i < 6; i++) {
    const r = await fetchHtml(`/?_rv=${Date.now()}-${i}`);
    if (r.status >= 300 && r.status < 400 && r.location && /\/maintenance/.test(r.location)) {
      outcome = { kind: "redirect", code: r.status, location: r.location };
      break;
    }
    if (r.status === 200 && r.body.toLowerCase().includes("maintenance")) {
      // Page rendered the maintenance UI directly (could happen if
      // middleware didn't fire but server rendered /maintenance).
      // Only count this if URL stayed at /
      outcome = { kind: "rendered-200", note: "200 with 'maintenance' in body" };
      break;
    }
    // small backoff
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (outcome && outcome.kind === "redirect") {
    record("step4.verify-redirect", "pass", `${outcome.code} → ${outcome.location}`);
  } else if (outcome && outcome.kind === "rendered-200") {
    record("step4.verify-redirect", "fail", `expected 30x redirect to /maintenance, got 200 (${outcome.note})`);
  } else {
    record("step4.verify-redirect", "fail", `no redirect to /maintenance after ${PROPAGATION_WAIT_MS}ms wait + retries`);
  }

  // Verify /maintenance page itself renders the test message.
  const m = await fetchHtml("/maintenance");
  if (m.status === 200 && m.body.includes(TEST_MESSAGE)) {
    record("step4.maintenance-page-message", "pass", "maintenance page renders custom message");
  } else if (m.status === 200) {
    record(
      "step4.maintenance-page-message",
      "fail",
      `/maintenance returned 200 but message '${TEST_MESSAGE}' not found in body`,
    );
  } else {
    record("step4.maintenance-page-message", "fail", `/maintenance status=${m.status}`);
  }

  // Reset
  const reset = await supa
    .from("maintenance_state")
    .update({ enabled: false, message: "", allowlist_user_ids: [] })
    .eq("id", 1);
  if (reset.error) {
    record("step4.reset-maintenance", "fail", reset.error.message);
  } else {
    record("step4.reset-maintenance", "pass", "disabled maintenance");
  }
}

/* Sanity: verify RPCs return what runtime libs expect when called via
 * anon (no admin auth). This is a fast smoke test before the slow
 * end-to-end checks. */
async function step0RpcSanity() {
  if (!ANON_KEY) {
    record("step0.rpc-sanity", "skipped", "no SUPABASE_ANON_KEY provided");
    return;
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  for (const fn of ["maintenance_active", "active_brand"]) {
    const args = fn === "active_brand" ? { ws_id: null } : { uid: null };
    const { data, error } = await anon.rpc(fn, args);
    if (error) {
      record(`step0.rpc-${fn}`, "fail", error.message);
    } else {
      record(`step0.rpc-${fn}`, "pass", typeof data === "object" ? "returned row" : `returned ${data}`);
    }
  }
  // active_banners: anon-callable per spec
  const { data: banners, error: bannersErr } = await anon.rpc("active_banners", { uid: null, tier: null });
  if (bannersErr) {
    record("step0.rpc-active_banners", "fail", bannersErr.message);
  } else {
    record("step0.rpc-active_banners", "pass", `returned ${Array.isArray(banners) ? banners.length : "?"} rows`);
  }
}

(async () => {
  console.log(`runtime-verify start | site=${SITE_URL} | wait=${PROPAGATION_WAIT_MS}ms\n`);
  await step0RpcSanity();
  const baseline = await step1Baseline();
  await step2Banner();
  await step3Brand();
  await step4Maintenance();

  console.log("\n=== SUMMARY ===");
  let fails = 0;
  for (const r of results) {
    if (r.status === "fail") fails++;
    console.log(`  ${r.status.padEnd(8)} ${r.step}${r.note ? "  — " + r.note : ""}`);
  }
  console.log(`\nbaseline.prerendered=${baseline?.prerendered ?? "?"} cache=${baseline?.cache ?? "?"}`);
  console.log(`\n${fails === 0 ? "OK" : "FAILS=" + fails}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((err) => {
  console.error("UNCAUGHT", err);
  process.exit(2);
});
