import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LEGACY_TOOL_SLUGS: Record<string, string> = {
  "what-can-i-afford": "affordability",
  "files-manager": "launchpad",
};

const TOSHARE_DOMAIN = "toshare.net";

/* Maintenance-mode bypass list — paths where we MUST NOT redirect even
 * when maintenance is active. Admins still need to flip the toggle
 * back off, the maintenance page itself can't redirect to itself, and
 * Next infra / auth flows have to keep working. */
const MAINTENANCE_BYPASS_PREFIXES = [
  "/maintenance",
  "/admin",
  "/_next",
  "/api/admin",
  "/api/auth",
  "/signin",
];

interface MaintenanceCheckResult {
  active: boolean;
}

let maintenanceCache:
  | { fetchedAt: number; result: MaintenanceCheckResult }
  | null = null;
const MAINTENANCE_TTL_MS = 30_000;

/* Direct fetch to the maintenance_active() RPC. We don't use the
 * @supabase/ssr client here because middleware runs on every request
 * and we want zero allocations for the cached-hit path. The 30s TTL
 * matches lib/runtime-maintenance.ts so admin toggles take effect
 * within ~30s site-wide. Failures (missing env, RPC error, network)
 * degrade to "site is up" — failing closed would lock everyone out. */
async function checkMaintenance(): Promise<MaintenanceCheckResult> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.fetchedAt < MAINTENANCE_TTL_MS) {
    return maintenanceCache.result;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    const result = { active: false };
    maintenanceCache = { fetchedAt: now, result };
    return result;
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/maintenance_active`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ uid: null }),
      // Edge runtime: avoid keep-alive issues from long-lived caches
      cache: "no-store",
    });
    if (!res.ok) {
      const result = { active: false };
      maintenanceCache = { fetchedAt: now, result };
      return result;
    }
    const data = (await res.json()) as boolean | null;
    const result = { active: data === true };
    maintenanceCache = { fetchedAt: now, result };
    return result;
  } catch {
    const result = { active: false };
    maintenanceCache = { fetchedAt: now, result };
    return result;
  }
}

function isMaintenanceBypassPath(pathname: string): boolean {
  return MAINTENANCE_BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
}

/* Host-router for the toshare.net link surface.
 *
 * toshare.net is hosted on the SAME Vercel project as spacefield.io. The
 * share routes live in `app/(share)/...` (a Next.js route group, so the
 * folder name doesn't affect URLs).
 *
 * URL convention on toshare.net:
 *   /p/<slug>  → share-page viewer
 *   /f/<slug>  → share-form viewer  (rewritten to /share-form/<slug>
 *                                    internally to avoid colliding with
 *                                    the legacy CRM lead-source page at
 *                                    spacefield.io/f/<slug>)
 *   /q/<slug>  → share-quote viewer
 *   /b/<slug>  → share-booking viewer
 *   /d/<slug>  → share-file viewer
 *   /r/<slug>  → share-redirect
 *
 * Host rules:
 *   - toshare.net root → rewrites to /landing
 *   - <ws>.toshare.net → adds ?ws=<sub> so viewers honor the subdomain
 *   - spacefield.io / .co → BLOCK access to share-only paths (so users
 *                           can't bypass the toshare brand). Legacy
 *                           /f/<slug> stays on spacefield.io.
 */
const SHARE_ONLY_PREFIXES = ["/p/", "/q/", "/r/", "/b/", "/d/", "/share-form/"];
const SHARE_ONLY_EXACT = new Set(["/landing", "/not-found"]);

function isShareOnlyPath(pathname: string): boolean {
  if (SHARE_ONLY_EXACT.has(pathname)) return true;
  return SHARE_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
}

function toshareRouter(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const isToshareHost = host === TOSHARE_DOMAIN || host.endsWith("." + TOSHARE_DOMAIN);
  const path = request.nextUrl.pathname;

  // Guard: spacefield.io / .co should never expose share-only paths.
  // (`/f/<slug>` is intentionally NOT blocked — it's the legacy CRM
  // lead-source viewer on the main brand domain.)
  if (!isToshareHost && isShareOnlyPath(path)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!isToshareHost) return null;

  const url = request.nextUrl.clone();
  const subdomain =
    host === TOSHARE_DOMAIN ? null : host.slice(0, -1 - TOSHARE_DOMAIN.length);

  // toshare.net root → landing page
  if (path === "/" || path === "") {
    url.pathname = "/landing";
    if (subdomain) url.searchParams.set("ws", subdomain);
    return NextResponse.rewrite(url);
  }

  // API routes pass through (form submit, mint, accept, book, etc.)
  if (path.startsWith("/api/")) return null;

  // /f/<slug> → /share-form/<slug>. The legacy CRM page at app/f/[slug]
  // would otherwise be served first since both files exist.
  const formMatch = path.match(/^\/f\/([a-z0-9-]+)\/?$/i);
  if (formMatch) {
    url.pathname = `/share-form/${formMatch[1].toLowerCase()}`;
    if (subdomain) url.searchParams.set("ws", subdomain);
    return NextResponse.rewrite(url);
  }

  // /<type>/<slug> for the other types — paths exist directly via the
  // (share) route group, just attach the subdomain hint when present.
  const m = path.match(/^\/([pqrbd])\/([a-z0-9-]+)\/?$/i);
  if (m) {
    if (subdomain) {
      url.searchParams.set("ws", subdomain);
      return NextResponse.rewrite(url);
    }
    return null;
  }

  // Anything else on toshare.net → not-found viewer
  url.pathname = "/not-found";
  return NextResponse.rewrite(url);
}

function isShellFrameRequest(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.get("frame") !== "1") return false;
  if (request.headers.get("sec-fetch-dest") !== "iframe") return false;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function shellRedirectForStandaloneTool(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  let slug: string | null = null;

  // Route-only tools still render inside OS windows as same-origin iframes.
  // Direct browser visits, crawlers, and external embeds do not get this pass.
  if (isShellFrameRequest(request)) return null;

  if (
    pathname === "/tools" ||
    pathname === "/tools/" ||
    pathname === "/solutions" ||
    pathname === "/solutions/" ||
    pathname === "/solutions/tools" ||
    pathname === "/solutions/tools/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  if (pathname.startsWith("/tools/")) {
    slug = pathname.split("/")[2] ?? null;
  } else if (pathname.startsWith("/solutions/tools/")) {
    slug = pathname.split("/")[3] ?? null;
  }

  if (!slug) return null;

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("app", LEGACY_TOOL_SLUGS[slug] ?? slug);
  return NextResponse.redirect(url, 307);
}

/* Supabase session refresh middleware.
 *
 * Runs on every request that doesn't match the matcher exclusions below.
 * It does TWO things:
 *
 *   1. Forwards the auth cookies from the incoming request into a fresh
 *      response object so route handlers downstream (and React Server
 *      Components) see the same session the browser does.
 *   2. Calls supabase.auth.getUser(), which transparently refreshes the
 *      access_token if it's expiring. The refreshed cookies are written
 *      back onto the response so the browser keeps a valid session
 *      without us having to wire a refresh anywhere else.
 *
 * Without this middleware, /api/files/upload (and every other API route)
 * sees stale cookies once the access_token expires (typically 1h after
 * sign-in) and returns 401 even though the browser thinks it's signed in.
 */
export async function middleware(request: NextRequest) {
  // Maintenance gate — runs before any host/path routing so admins can
  // take the public surface offline while keeping /admin, /signin, and
  // Next infra reachable. Bypass-path check is cheap; the RPC call is
  // TTL-cached so most requests don't hit the network.
  const path = request.nextUrl.pathname;
  if (!isMaintenanceBypassPath(path)) {
    const maint = await checkMaintenance();
    if (maint.active) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // toshare.net host routing — runs FIRST so /tools redirects don't fire
  const toshareResp = toshareRouter(request);
  if (toshareResp) return toshareResp;

  const toolRedirect = shellRedirectForStandaloneTool(request);
  if (toolRedirect) return toolRedirect;

  let response = NextResponse.next({ request });

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // This call mutates the cookie store via setAll() above when the
  // access_token gets refreshed. We don't actually need the user object
  // here — the side-effect is the point.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every path except:
     *   - _next/static, _next/image — Next assets
     *   - favicon.ico, robots.txt, sitemap*.xml — public root files
     *   - any path with a file extension (so we don't slow down img/font
     *     requests served from /public)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.*\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf|css|js|map)$).*)",
  ],
};
