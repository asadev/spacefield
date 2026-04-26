"use client";

import { useMemo, useState } from "react";
import ToolShell from "../../_components/ToolShell";

type Status = {
  code: number;
  message: string;
  description: string;
  scenario: string;
  rfc: string;
  methods?: string[]; // HTTP methods commonly associated
  example?: { request: string; response: string };
};

const STATUSES: Status[] = [
  // 1xx
  { code: 100, message: "Continue", description: "Interim response; client should continue the request.", scenario: "Client sent Expect: 100-continue and server OKs proceeding with request body.", rfc: "RFC 9110 §15.2.1" },
  { code: 101, message: "Switching Protocols", description: "Server is switching protocols as requested.", scenario: "Upgrade to WebSocket or HTTP/2 from HTTP/1.1.", rfc: "RFC 9110 §15.2.2" },
  { code: 102, message: "Processing", description: "Server has accepted the request but not completed processing.", scenario: "Long-running WebDAV operation.", rfc: "RFC 2518" },
  { code: 103, message: "Early Hints", description: "Preload hints before the final response.", scenario: "Preload critical CSS/JS before the real response is ready.", rfc: "RFC 8297" },
  // 2xx
  { code: 200, message: "OK", description: "Request succeeded.", scenario: "Standard successful GET / PUT / POST with body.", rfc: "RFC 9110 §15.3.1" },
  { code: 201, message: "Created", description: "Request fulfilled, new resource created.", scenario: "POST /users successfully created a user; Location header points to the new resource.", rfc: "RFC 9110 §15.3.2" },
  { code: 202, message: "Accepted", description: "Request accepted for processing but not completed.", scenario: "Async job enqueued; check back later for status.", rfc: "RFC 9110 §15.3.3" },
  { code: 203, message: "Non-Authoritative Information", description: "Returned meta from a transforming proxy.", scenario: "Proxy modified response headers in transit.", rfc: "RFC 9110 §15.3.4" },
  { code: 204, message: "No Content", description: "Success, but no response body.", scenario: "DELETE succeeded; PUT that doesn't need to return anything.", rfc: "RFC 9110 §15.3.5" },
  { code: 205, message: "Reset Content", description: "Tell the client to reset its view.", scenario: "After a form submit — clear the input fields.", rfc: "RFC 9110 §15.3.6" },
  { code: 206, message: "Partial Content", description: "Range request succeeded partially.", scenario: "Video seeking with Range header; resumable downloads.", rfc: "RFC 9110 §15.3.7" },
  { code: 207, message: "Multi-Status", description: "Conveys status for multiple operations.", scenario: "WebDAV bulk operation.", rfc: "RFC 4918" },
  // 3xx
  { code: 300, message: "Multiple Choices", description: "Multiple representations available.", scenario: "Content negotiation ambiguity — rarely used.", rfc: "RFC 9110 §15.4.1" },
  { code: 301, message: "Moved Permanently", description: "Resource moved permanently to new URI.", scenario: "Old URL replaced with a new canonical URL. SEO-friendly redirect.", rfc: "RFC 9110 §15.4.2" },
  { code: 302, message: "Found", description: "Resource temporarily at a different URI.", scenario: "Temporary redirect. Use 307 for stricter semantics.", rfc: "RFC 9110 §15.4.3" },
  { code: 303, message: "See Other", description: "Response to a POST; redirect to a GET.", scenario: "POST /submit → 303 → GET /success (Post/Redirect/Get pattern).", rfc: "RFC 9110 §15.4.4" },
  { code: 304, message: "Not Modified", description: "Cached version is still valid.", scenario: "Client sent If-None-Match; resource hasn't changed.", rfc: "RFC 9110 §15.4.5" },
  { code: 307, message: "Temporary Redirect", description: "Redirect without changing method.", scenario: "Temporary redirect that preserves POST body (unlike 302 in practice).", rfc: "RFC 9110 §15.4.8" },
  { code: 308, message: "Permanent Redirect", description: "Permanent redirect without changing method.", scenario: "Permanent move that preserves method/body.", rfc: "RFC 9110 §15.4.9" },
  // 4xx
  { code: 400, message: "Bad Request", description: "Malformed request the server can't understand.", scenario: "Invalid JSON body; missing required field; bad query string.", rfc: "RFC 9110 §15.5.1" },
  { code: 401, message: "Unauthorized", description: "Authentication required or failed.", scenario: "Missing/expired token. Include a WWW-Authenticate header.", rfc: "RFC 9110 §15.5.2" },
  { code: 402, message: "Payment Required", description: "Reserved for future use.", scenario: "Used by some APIs for quota/billing issues.", rfc: "RFC 9110 §15.5.3" },
  { code: 403, message: "Forbidden", description: "Server understood but refuses to authorize.", scenario: "Authenticated user lacks permission for the resource.", rfc: "RFC 9110 §15.5.4" },
  { code: 404, message: "Not Found", description: "Resource not found.", scenario: "Route doesn't exist or the record ID is unknown.", rfc: "RFC 9110 §15.5.5" },
  { code: 405, message: "Method Not Allowed", description: "Method isn't supported on this resource.", scenario: "POST to a GET-only endpoint. Return Allow header.", rfc: "RFC 9110 §15.5.6" },
  { code: 406, message: "Not Acceptable", description: "Can't produce response matching Accept headers.", scenario: "Client requested application/xml but server only speaks JSON.", rfc: "RFC 9110 §15.5.7" },
  { code: 407, message: "Proxy Authentication Required", description: "Authenticate with the proxy.", scenario: "Corporate proxy needs credentials.", rfc: "RFC 9110 §15.5.8" },
  { code: 408, message: "Request Timeout", description: "Client took too long to send the request.", scenario: "Idle connection to server; slow client body upload.", rfc: "RFC 9110 §15.5.9" },
  { code: 409, message: "Conflict", description: "Request conflicts with current state.", scenario: "Edit collision — resource changed since client last fetched it.", rfc: "RFC 9110 §15.5.10" },
  { code: 410, message: "Gone", description: "Resource permanently removed.", scenario: "Deleted endpoint, don't try again (vs 404's maybe-later).", rfc: "RFC 9110 §15.5.11" },
  { code: 411, message: "Length Required", description: "Missing Content-Length header.", scenario: "Server requires Content-Length on request bodies.", rfc: "RFC 9110 §15.5.12" },
  { code: 412, message: "Precondition Failed", description: "Precondition header failed.", scenario: "If-Match ETag mismatch during conditional PUT.", rfc: "RFC 9110 §15.5.13" },
  { code: 413, message: "Payload Too Large", description: "Request body too big.", scenario: "Upload exceeded server limit.", rfc: "RFC 9110 §15.5.14" },
  { code: 414, message: "URI Too Long", description: "Request URI too long.", scenario: "Giant GET query string. Switch to POST body.", rfc: "RFC 9110 §15.5.15" },
  { code: 415, message: "Unsupported Media Type", description: "Content-Type not supported.", scenario: "Client sent XML; endpoint only accepts JSON.", rfc: "RFC 9110 §15.5.16" },
  { code: 416, message: "Range Not Satisfiable", description: "Requested range invalid.", scenario: "Byte range exceeds file size.", rfc: "RFC 9110 §15.5.17" },
  { code: 417, message: "Expectation Failed", description: "Expect header can't be met.", scenario: "Server can't meet the client's Expect requirement.", rfc: "RFC 9110 §15.5.18" },
  { code: 418, message: "I'm a teapot", description: "April Fools' joke from 1998. Actually honored.", scenario: "Tea-serving endpoints. Sometimes used for bot/spam responses.", rfc: "RFC 2324" },
  { code: 421, message: "Misdirected Request", description: "Request was sent to the wrong server.", scenario: "HTTP/2 connection reuse with non-authoritative origin.", rfc: "RFC 9110 §15.5.20" },
  { code: 422, message: "Unprocessable Content", description: "Semantic errors in the request body.", scenario: "Validation failed on POST — fields present but values invalid.", rfc: "RFC 9110 §15.5.21" },
  { code: 423, message: "Locked", description: "Resource is locked.", scenario: "WebDAV — another client holds a lock.", rfc: "RFC 4918" },
  { code: 424, message: "Failed Dependency", description: "Previous request failed.", scenario: "WebDAV; dependent operation can't proceed.", rfc: "RFC 4918" },
  { code: 425, message: "Too Early", description: "Server unwilling to process early data.", scenario: "TLS 1.3 0-RTT replay protection.", rfc: "RFC 8470" },
  { code: 426, message: "Upgrade Required", description: "Client must switch protocols.", scenario: "Server only speaks HTTPS or HTTP/2.", rfc: "RFC 9110 §15.5.22" },
  { code: 428, message: "Precondition Required", description: "Conditional request required.", scenario: "Force client to use If-Match to prevent lost updates.", rfc: "RFC 6585" },
  { code: 429, message: "Too Many Requests", description: "Rate limit exceeded.", scenario: "API throttling. Include Retry-After header.", rfc: "RFC 6585" },
  { code: 431, message: "Request Header Fields Too Large", description: "Headers too large.", scenario: "Cookie bloat; crazy-long auth tokens.", rfc: "RFC 6585" },
  { code: 451, message: "Unavailable For Legal Reasons", description: "Blocked by legal demand.", scenario: "GDPR/DMCA takedown; geo-restriction under court order.", rfc: "RFC 7725" },
  // 5xx
  { code: 500, message: "Internal Server Error", description: "Generic server-side failure.", scenario: "Unhandled exception in application code.", rfc: "RFC 9110 §15.6.1" },
  { code: 501, message: "Not Implemented", description: "Method not supported by server.", scenario: "Server doesn't recognize the request method.", rfc: "RFC 9110 §15.6.2" },
  { code: 502, message: "Bad Gateway", description: "Invalid response from upstream.", scenario: "Reverse proxy got garbage from backend.", rfc: "RFC 9110 §15.6.3" },
  { code: 503, message: "Service Unavailable", description: "Server temporarily unavailable.", scenario: "Maintenance window or overload. Include Retry-After.", rfc: "RFC 9110 §15.6.4" },
  { code: 504, message: "Gateway Timeout", description: "Upstream didn't respond in time.", scenario: "Backend took too long; proxy gave up.", rfc: "RFC 9110 §15.6.5" },
  { code: 505, message: "HTTP Version Not Supported", description: "HTTP version not supported.", scenario: "Server rejects the client's HTTP version.", rfc: "RFC 9110 §15.6.6" },
  { code: 506, message: "Variant Also Negotiates", description: "Content negotiation config error.", scenario: "Transparent content negotiation loop.", rfc: "RFC 2295" },
  { code: 507, message: "Insufficient Storage", description: "Server out of space.", scenario: "WebDAV — can't store the new representation.", rfc: "RFC 4918" },
  { code: 508, message: "Loop Detected", description: "Infinite loop detected.", scenario: "WebDAV — recursive operation failed.", rfc: "RFC 5842" },
  { code: 510, message: "Not Extended", description: "Extension required.", scenario: "Server needs further extensions to process the request.", rfc: "RFC 2774" },
  { code: 511, message: "Network Authentication Required", description: "Captive portal intercepts.", scenario: "Coffee shop WiFi login page.", rfc: "RFC 6585" },
];

// Request/response example templates for the most frequently seen codes.
// Reference: IANA HTTP Status Code Registry (iana.org/assignments/http-status-codes) + RFC 9110.
const EXAMPLES: Record<number, { request: string; response: string }> = {
  200: {
    request: "GET /api/users/42 HTTP/1.1\nHost: api.example.com\nAccept: application/json",
    response: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{ "id": 42, "name": "Alex" }',
  },
  201: {
    request: 'POST /api/users HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{ "name": "Alex" }',
    response: 'HTTP/1.1 201 Created\nLocation: /api/users/42\nContent-Type: application/json\n\n{ "id": 42, "name": "Alex" }',
  },
  204: {
    request: "DELETE /api/users/42 HTTP/1.1\nHost: api.example.com",
    response: "HTTP/1.1 204 No Content",
  },
  301: {
    request: "GET /old-page HTTP/1.1\nHost: example.com",
    response: "HTTP/1.1 301 Moved Permanently\nLocation: /new-page",
  },
  304: {
    request: 'GET /style.css HTTP/1.1\nHost: example.com\nIf-None-Match: "abc123"',
    response: 'HTTP/1.1 304 Not Modified\nETag: "abc123"',
  },
  400: {
    request: 'POST /api/users HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{ "name": }',
    response: 'HTTP/1.1 400 Bad Request\nContent-Type: application/json\n\n{ "error": "malformed JSON at line 1" }',
  },
  401: {
    request: "GET /api/me HTTP/1.1\nHost: api.example.com",
    response: 'HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer realm="api"',
  },
  403: {
    request: "DELETE /api/orgs/7 HTTP/1.1\nHost: api.example.com\nAuthorization: Bearer …",
    response: 'HTTP/1.1 403 Forbidden\nContent-Type: application/json\n\n{ "error": "insufficient role" }',
  },
  404: {
    request: "GET /api/users/9999 HTTP/1.1\nHost: api.example.com",
    response: 'HTTP/1.1 404 Not Found\nContent-Type: application/json\n\n{ "error": "user not found" }',
  },
  409: {
    request: 'PUT /api/users/42 HTTP/1.1\nHost: api.example.com\nIf-Match: "v1"',
    response: 'HTTP/1.1 409 Conflict\nContent-Type: application/json\n\n{ "error": "version mismatch" }',
  },
  422: {
    request: 'POST /api/users HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{ "email": "not-an-email" }',
    response: 'HTTP/1.1 422 Unprocessable Content\nContent-Type: application/json\n\n{ "errors": [{ "field": "email", "msg": "invalid format" }] }',
  },
  429: {
    request: "GET /api/search?q=test HTTP/1.1\nHost: api.example.com",
    response: 'HTTP/1.1 429 Too Many Requests\nRetry-After: 30\nContent-Type: application/json\n\n{ "error": "rate limit exceeded" }',
  },
  500: {
    request: "GET /api/report HTTP/1.1\nHost: api.example.com",
    response: 'HTTP/1.1 500 Internal Server Error\nContent-Type: application/json\n\n{ "error": "internal error — reference id 7b3..." }',
  },
  502: {
    request: "GET /api/payments HTTP/1.1\nHost: api.example.com",
    response: "HTTP/1.1 502 Bad Gateway",
  },
  503: {
    request: "GET /api/users HTTP/1.1\nHost: api.example.com",
    response: "HTTP/1.1 503 Service Unavailable\nRetry-After: 120",
  },
};

// Rough method associations (plain-text hint in the UI)
const METHOD_HINTS: Record<number, string[]> = {
  200: ["GET", "PUT", "POST"],
  201: ["POST", "PUT"],
  204: ["DELETE", "PUT"],
  301: ["GET"], 302: ["GET"], 303: ["POST"], 304: ["GET"], 307: ["*"], 308: ["*"],
  400: ["*"], 401: ["*"], 403: ["*"], 404: ["*"], 405: ["*"], 409: ["PUT", "POST", "DELETE"], 410: ["GET"],
  413: ["POST", "PUT"], 415: ["POST", "PUT"], 422: ["POST", "PUT", "PATCH"], 429: ["*"],
  500: ["*"], 502: ["*"], 503: ["*"], 504: ["*"],
};

const METHODS = ["all", "GET", "POST", "PUT", "DELETE", "PATCH"] as const;
type MethodFilter = typeof METHODS[number];

type ClassDef = {
  key: string;
  label: string;
  short: string;
  // tone tokens — use foundation accent for "all" and semantic hue tokens for bands
  text: string;
  stripe: string;
  border: string;
  badge: string;
  dot: string;
};

// Class bands keep their semantic hue (info/success/redirect/client/server)
// because they're status-code categories, not the tool's primary accent.
const CLASSES: ClassDef[] = [
  { key: "all", label: "All", short: "*", text: "text-tool-accent", stripe: "bg-tool-accent", border: "border-app", badge: "border-tool-accent bg-tool-accent-soft text-tool-accent", dot: "bg-tool-accent" },
  { key: "1xx", label: "1xx Info", short: "1xx", text: "text-sky-500", stripe: "bg-sky-500", border: "border-sky-500/30", badge: "border-sky-500/30 bg-sky-500/10 text-sky-500", dot: "bg-sky-500" },
  { key: "2xx", label: "2xx Success", short: "2xx", text: "text-emerald-500", stripe: "bg-emerald-500", border: "border-emerald-500/30", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500", dot: "bg-emerald-500" },
  { key: "3xx", label: "3xx Redirect", short: "3xx", text: "text-violet-500", stripe: "bg-violet-500", border: "border-violet-500/30", badge: "border-violet-500/30 bg-violet-500/10 text-violet-500", dot: "bg-violet-500" },
  { key: "4xx", label: "4xx Client", short: "4xx", text: "text-amber-500", stripe: "bg-amber-500", border: "border-amber-500/30", badge: "border-amber-500/30 bg-amber-500/10 text-amber-500", dot: "bg-amber-500" },
  { key: "5xx", label: "5xx Server", short: "5xx", text: "text-rose-500", stripe: "bg-rose-500", border: "border-rose-500/30", badge: "border-rose-500/30 bg-rose-500/10 text-rose-500", dot: "bg-rose-500" },
];

const CLASS_BY_KEY: Record<string, ClassDef> = CLASSES.reduce((acc, c) => {
  acc[c.key] = c;
  return acc;
}, {} as Record<string, ClassDef>);

function statusClass(code: number): string {
  return `${Math.floor(code / 100)}xx`;
}

export default function HttpStatusReferencePage() {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return STATUSES.filter((s) => {
      if (cls !== "all" && statusClass(s.code) !== cls) return false;
      if (method !== "all") {
        const hints = METHOD_HINTS[s.code];
        if (!hints || (!hints.includes(method) && !hints.includes("*"))) return false;
      }
      if (!query) return true;
      return (
        String(s.code).includes(query) ||
        s.message.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.scenario.toLowerCase().includes(query)
      );
    });
  }, [q, cls, method]);

  // Group filtered statuses by class
  const grouped = useMemo(() => {
    const map = new Map<string, Status[]>();
    for (const s of filtered) {
      const k = statusClass(s.code);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [filtered]);

  const copy = (s: Status) => {
    navigator.clipboard?.writeText(`${s.code} ${s.message}`);
    setCopied(s.code);
    window.setTimeout(() => setCopied((c) => (c === s.code ? null : c)), 1200);
  };

  // Counts per class for header chips
  const counts = useMemo(() => {
    const c: Record<string, number> = { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
    for (const s of STATUSES) c[statusClass(s.code)]++;
    return c;
  }, []);

  const orderedBands = ["1xx", "2xx", "3xx", "4xx", "5xx"].filter((k) => grouped.has(k));

  return (
    <div data-tool-theme="data" data-tool="http-status-reference">
      <ToolShell
        category="Data & Developer"
        title="HTTP Status Code Reference"
        description="All HTTP status codes with plain-English descriptions, realistic scenarios, and RFC references. Click any row to copy."
      >
        {/* ============================== MASTHEAD ============================== */}
        <section className="tool-hero relative mb-6 overflow-hidden rounded-xl border border-app bg-app-elevated">
          {/* console chrome — counts row */}
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-app px-4 py-2.5">
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              http.status.codes
            </span>
            <span className="rounded-md border border-app bg-app-elevated px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-secondary">
              total={STATUSES.length}
            </span>
            <span className="rounded-md border border-tool-accent bg-tool-accent-soft px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-tool-accent">
              shown={filtered.length}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[0.6rem]">
              {Object.entries(counts).map(([k, n]) => {
                const c = CLASS_BY_KEY[k];
                return (
                  <span
                    key={k}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 uppercase tracking-[0.16em] ${c.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                    {k}={n}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="relative p-5">
            <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.22em] text-tool-accent">
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tool-accent" />
              IANA HTTP Status Registry · RFC 9110
            </div>

            {/* Search bar */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-app bg-app px-3 py-2 transition-colors focus-within:border-tool-accent">
              <span className="select-none font-mono text-sm text-tool-accent">$</span>
              <span className="select-none font-mono text-[0.7rem] text-muted">grep</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='"401" or "rate limit"'
                className="flex-1 bg-transparent font-mono text-sm text-app placeholder:text-faint outline-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="rounded-md border border-app bg-app-elevated px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted transition-colors hover:border-rose-500/40 hover:text-rose-500"
                >
                  clear
                </button>
              )}
            </div>

            <p className="mt-3 font-mono text-[0.55rem] text-muted">
              # click row to expand · copy button → &quot;code message&quot;
            </p>
          </div>

          {/* sub-tab strips — segmented pills */}
          <div className="flex flex-wrap items-center gap-3 border-t border-app bg-app px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                class
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border border-app bg-app-elevated">
                {CLASSES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCls(c.key)}
                    className={`px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] transition-colors ${
                      cls === c.key
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    {c.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-muted">
                method
              </span>
              <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-app bg-app-elevated">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`px-2.5 py-1.5 font-mono text-[0.55rem] uppercase tracking-[0.16em] transition-colors ${
                      method === m
                        ? "bg-tool-accent-soft text-tool-accent"
                        : "text-secondary hover:text-app"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Category bands */}
        <div className="space-y-4">
          {orderedBands.map((bandKey) => {
            const c = CLASS_BY_KEY[bandKey];
            const items = grouped.get(bandKey)!;
            return (
              <section
                key={bandKey}
                className={`overflow-hidden rounded-xl border ${c.border} bg-app-elevated`}
              >
                {/* Band header */}
                <div className="flex items-center gap-3 border-b border-app bg-app px-4 py-2">
                  <span className={`h-3 w-3 rounded-full ${c.stripe}`} />
                  <span className={`font-mono text-xs font-semibold uppercase tracking-[0.22em] ${c.text}`}>
                    {c.label}
                  </span>
                  <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted">
                    {items.length} {items.length === 1 ? "code" : "codes"}
                  </span>
                </div>

                {/* Mono-font code list */}
                <ul className="divide-y divide-[var(--border)]">
                  {items.map((s) => {
                    const ex = EXAMPLES[s.code];
                    const isOpen = expanded === s.code;
                    const wasCopied = copied === s.code;
                    return (
                      <li
                        key={s.code}
                        className={`group relative transition-colors ${
                          isOpen ? "bg-app" : "hover:bg-app"
                        }`}
                      >
                        {/* Left category stripe */}
                        <span className={`absolute left-0 top-0 h-full w-0.5 ${c.stripe} opacity-70`} />

                        <div className="flex items-start gap-2 px-4 py-2.5 pl-5">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : s.code)}
                            className="flex flex-1 items-start gap-3 text-left"
                          >
                            {/* Code */}
                            <span className={`min-w-[3rem] font-mono text-base font-semibold tabular-nums ${c.text}`}>
                              {s.code}
                            </span>
                            {/* Message */}
                            <span className="min-w-[10rem] font-mono text-sm text-app">
                              {s.message}
                            </span>
                            {/* Description */}
                            <span className="hidden flex-1 truncate font-mono text-[0.7rem] text-secondary md:block">
                              {s.description}
                            </span>
                            {/* Methods */}
                            {METHOD_HINTS[s.code] && (
                              <span className="hidden font-mono text-[0.55rem] uppercase tracking-[0.2em] text-muted lg:inline">
                                {METHOD_HINTS[s.code].join("·")}
                              </span>
                            )}
                            {/* RFC */}
                            <span className="hidden font-mono text-[0.55rem] uppercase tracking-[0.18em] text-muted sm:inline">
                              {s.rfc}
                            </span>
                            {/* Expand chevron */}
                            <span
                              className={`select-none font-mono text-[0.65rem] ${c.text} opacity-60 transition-transform ${isOpen ? "rotate-90" : ""}`}
                              aria-hidden
                            >
                              ▸
                            </span>
                          </button>
                          {/* Copy button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(s);
                            }}
                            title={`Copy "${s.code} ${s.message}"`}
                            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.18em] transition-colors ${
                              wasCopied
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                : "border-app bg-app-elevated text-muted hover:border-tool-accent hover:text-tool-accent"
                            }`}
                          >
                            {wasCopied ? "copied" : "copy"}
                          </button>
                        </div>

                        {/* Mobile-only description / scenario */}
                        <div className="px-4 pb-2 pl-5 md:hidden">
                          <div className="font-mono text-[0.65rem] text-secondary">{s.description}</div>
                        </div>

                        {/* Expanded reveal */}
                        {isOpen && (
                          <div className="border-t border-app bg-app px-4 py-3 pl-5">
                            <div className="font-mono text-[0.7rem] text-secondary">
                              <span className="text-muted"># </span>
                              {s.description}
                            </div>
                            <div className="mt-1 font-mono text-[0.7rem] italic text-muted">
                              <span className="not-italic text-muted"># scenario: </span>
                              {s.scenario}
                            </div>

                            {ex ? (
                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="h-1 w-1 rounded-full bg-tool-accent" />
                                    <span className="font-mono text-[0.55rem] uppercase tracking-[0.22em] text-tool-accent">
                                      request
                                    </span>
                                  </div>
                                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app-elevated p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                                    {ex.request}
                                  </pre>
                                </div>
                                <div>
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className={`h-1 w-1 rounded-full ${c.stripe}`} />
                                    <span className={`font-mono text-[0.55rem] uppercase tracking-[0.22em] ${c.text}`}>
                                      response
                                    </span>
                                  </div>
                                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-app bg-app-elevated p-3 font-mono text-[0.7rem] leading-relaxed text-app">
                                    {ex.response}
                                  </pre>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-lg border border-dashed border-app bg-app-elevated px-3 py-2 font-mono text-[0.65rem] text-muted">
                                # no canned example for this code — see RFC for spec text
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-app bg-app-elevated p-8 text-center font-mono text-sm text-muted">
              <div className="text-faint"># no matches</div>
              <div className="mt-1 text-[0.7rem] text-muted">try a different code, keyword, or class filter</div>
            </div>
          )}
        </div>
      </ToolShell>
    </div>
  );
}
