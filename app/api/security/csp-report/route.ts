/**
 * POST /api/security/csp-report — sink for Content-Security-Policy
 * violation reports.
 *
 * SE-003 — Our CSP is shipped in Report-Only mode, but until now we
 * had no `report-uri` configured, so violations were dropped on the
 * floor (only visible in DevTools). This endpoint accepts both the
 * legacy `report-uri` payload (`{"csp-report": {...}}`) and the
 * newer Reporting API payload (`[{ type: "csp-violation", body: {...} }]`)
 * and logs them to `error_events` so /admin/errors can surface CSP
 * violations alongside everything else.
 *
 * It's an unauthenticated POST endpoint, so the abuse profile is:
 *   - Browsers send legit reports (good).
 *   - A bored attacker can POST junk forever (bad).
 *
 * We mitigate with:
 *   - Cheap per-IP rate limit (in-memory token bucket).
 *   - Strict body size cap (16 KB; real reports are ~1 KB).
 *   - Soft validation: must look like a CSP report. Junk is silently dropped.
 *   - Always 204 — never leak whether the report was kept.
 */

import { NextResponse, type NextRequest } from "next/server";

import { logErrorEdge } from "@/lib/middleware-helpers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

/* Token-bucket per IP. Edge runtime is per-worker so this is best-effort
 * (multiple workers / regions each have their own bucket) — adequate
 * defence against a single-source flood, not a distributed one. */
const BUCKET_LIMIT = 30; // reports per window
const BUCKET_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || b.resetAt <= now) b = { count: 0, resetAt: now + BUCKET_WINDOW_MS };
  b.count += 1;
  buckets.set(ip, b);
  if (buckets.size > 1024 && Math.random() < 0.05) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return b.count <= BUCKET_LIMIT;
}

interface CspViolationFields {
  "blocked-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "document-uri"?: string;
  "original-policy"?: string;
  "disposition"?: string;
  "status-code"?: number;
  "source-file"?: string;
  "line-number"?: number;
  "column-number"?: number;
  // Reporting API uses camelCase variants
  blockedURI?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  documentURL?: string;
  originalPolicy?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
}

function pickField(obj: CspViolationFields, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = (obj as unknown as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

interface NormalisedReport {
  directive: string | null;
  blockedUri: string | null;
  documentUri: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  disposition: string | null;
  sample: string | null;
}

function normaliseReport(raw: unknown): NormalisedReport | null {
  if (!raw || typeof raw !== "object") return null;
  // Reporting API: top-level may be an array of reports.
  if (Array.isArray(raw)) {
    const first = raw.find(
      (r) => r && typeof r === "object" && (r as { type?: string }).type === "csp-violation",
    );
    if (!first) return null;
    const body = (first as { body?: unknown }).body;
    if (!body || typeof body !== "object") return null;
    return normaliseReport(body);
  }
  const obj = raw as Record<string, unknown>;
  // Legacy: { "csp-report": { ... } }
  if (obj["csp-report"] && typeof obj["csp-report"] === "object") {
    return normaliseReport(obj["csp-report"]);
  }
  const f = obj as CspViolationFields;
  const directive = pickField(
    f,
    "effective-directive",
    "violated-directive",
    "effectiveDirective",
    "violatedDirective",
  );
  if (!directive) return null; // not a CSP report
  return {
    directive,
    blockedUri: pickField(f, "blocked-uri", "blockedURI"),
    documentUri: pickField(f, "document-uri", "documentURL"),
    sourceFile: pickField(f, "source-file", "sourceFile"),
    lineNumber:
      typeof f["line-number"] === "number"
        ? f["line-number"]
        : typeof f.lineNumber === "number"
          ? f.lineNumber
          : null,
    disposition: pickField(f, "disposition"),
    sample: pickField(f, "sample"),
  };
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    // Quiet drop — don't tell the client they're throttled.
    return new NextResponse(null, { status: 204 });
  }

  const lenHeader = req.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    raw = text ? JSON.parse(text) : null;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const report = normaliseReport(raw);
  if (!report) {
    return new NextResponse(null, { status: 204 });
  }

  // Log via the edge-safe logger so middleware/edge runtime works.
  // Best-effort; never await-throws because logErrorEdge swallows.
  await logErrorEdge({
    level: "warning",
    source: "csp.report",
    message: `CSP ${report.disposition ?? "report"}: ${report.directive} blocked ${
      report.blockedUri ?? "(unknown)"
    }`,
    url: report.documentUri,
    user_agent: req.headers.get("user-agent"),
    fingerprint: `csp:${report.directive}:${report.blockedUri ?? "(none)"}`,
    context: {
      directive: report.directive,
      blocked_uri: report.blockedUri,
      document_uri: report.documentUri,
      source_file: report.sourceFile,
      line_number: report.lineNumber,
      disposition: report.disposition,
      sample: report.sample,
      ip,
    },
  });

  // 204 No Content per the spec — browsers don't read the body.
  return new NextResponse(null, { status: 204 });
}

/* Reporting API endpoint negotiation uses an OPTIONS preflight; some
 * browsers also send a GET to discover the endpoint. Respond 204 to
 * both so we never look like a 404 in network panels. */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
