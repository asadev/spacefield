import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LEGACY_TOOL_SLUGS: Record<string, string> = {
  "what-can-i-afford": "affordability",
  "files-manager": "launchpad",
};

const TOSHARE_DOMAIN = "toshare.net";

/* Host-router for the toshare.net link surface.
 *
 * toshare.net is hosted on the SAME Vercel project as spacefield.io for
 * MVP simplicity. We split traffic by Host header in middleware:
 *
 *   - host = toshare.net           → rewrite to /_share/<type>/<slug>
 *   - host = <ws>.toshare.net      → rewrite to /_share/<ws>/<type>/<slug>
 *   - host = spacefield.io / .co   → existing app (no rewrite)
 *
 * Edge rewrite preserves the original URL in the browser bar; the page
 * route lives at app/_share/... internally.
 */
function toshareRewrite(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  if (host !== TOSHARE_DOMAIN && !host.endsWith("." + TOSHARE_DOMAIN)) return null;

  const url = request.nextUrl.clone();
  const subdomain = host === TOSHARE_DOMAIN ? null : host.slice(0, -1 - TOSHARE_DOMAIN.length);
  const path = url.pathname;

  // root → simple landing page
  if (path === "/" || path === "") {
    url.pathname = "/_share/landing";
    if (subdomain) url.searchParams.set("ws", subdomain);
    return NextResponse.rewrite(url);
  }

  // submit endpoint (form POSTs) — pass through to api route
  if (path.startsWith("/api/")) return null;

  // typed-slug routes: /<type>/<slug>
  const m = path.match(/^\/([a-z])\/([a-z0-9-]+)\/?$/i);
  if (m) {
    url.pathname = `/_share/${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
    if (subdomain) url.searchParams.set("ws", subdomain);
    return NextResponse.rewrite(url);
  }

  // anything else on toshare.net → 404 page
  url.pathname = "/_share/not-found";
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
  // toshare.net host routing — runs FIRST so /tools redirects don't fire
  const toshareResp = toshareRewrite(request);
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
