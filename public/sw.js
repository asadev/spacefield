/*
 * Spacefield service worker.
 *
 * Two cache layers:
 *
 *   1. `spacefield-static-v2`  — long-lived: /_next/static, /icons, /fonts.
 *      Stale-while-revalidate. Names are content-hashed so cached entries
 *      stay valid until they fall off LRU.
 *
 *   2. `spacefield-pages-v2`   — short-lived: marketing HTML (/, /pricing,
 *      /privacy, /terms, /refund, /contact, /about). Stale-while-revalidate
 *      with a 7-day max-age. Gives signed-out / offline visitors a working
 *      "you're offline" view that mirrors what they saw last (Stripe-style).
 *
 * Bumping CACHE_VERSION invalidates both caches and re-fetches on next visit.
 *
 * Routes we deliberately DO NOT cache:
 *   - /admin/*          (must always reflect live data)
 *   - /api/*            (RPCs, dynamic JSON)
 *   - /signin/*         (auth state)
 *   - /tools/*          (signed-in shell — never reachable signed-out anyway)
 *   - Any non-GET request (POSTs to /api are passthrough)
 *   - Cross-origin requests (Supabase, Paddle, CDN) — those rely on browser
 *     HTTP cache + their own CDN headers.
 *
 * Push payload shape (server-side):
 *   { title: string, body: string, href?: string, tag?: string, icon?: string }
 */

const CACHE_VERSION = "spacefield-static-v2";
const PAGE_CACHE = "spacefield-pages-v2";

/* Paths we're willing to stale-while-revalidate. Everything else passes
 * straight through — particularly HTML, API routes, and anything under
 * /admin or /api which must reflect live data. */
const STATIC_PREFIXES = ["/icons/", "/_next/static/", "/fonts/"];

/* Marketing pages eligible for offline shell. Match by exact pathname so
 * we don't accidentally cache /pricing/somesubroute. /legal/* is matched
 * by prefix in `isMarketingPage()` below. */
const MARKETING_PATHS = new Set([
  "/",
  "/pricing",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/refund",
]);
const MARKETING_PREFIXES = ["/legal/"];

/* Hard exclusion list — never cache, never serve from cache. Order
 * matters: these win over MARKETING_PATHS. */
const NEVER_CACHE_PREFIXES = ["/api/", "/admin", "/auth/", "/tools/", "/signin", "/_next/data/"];

/* Max age for cached marketing HTML before we prefer the network even on
 * cache hit. 7 days keeps the offline shell fresh enough that copy/pricing
 * changes are reflected within a sane window; visitors who are online get
 * the SWR update anyway, this only bounds the truly-offline case. */
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  // Activate immediately so users on the next page-load get the new SW.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache that isn't one of the two current versions.
      const keep = new Set([CACHE_VERSION, PAGE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isExcluded(url) {
  return NEVER_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isMarketingPage(url) {
  if (url.origin !== self.location.origin) return false;
  if (isExcluded(url)) return false;
  if (MARKETING_PATHS.has(url.pathname)) return true;
  return MARKETING_PREFIXES.some((p) => url.pathname.startsWith(p));
}

/* Helper: is this request asking for an HTML document?
 * `Accept: text/html` is the canonical signal — browsers send it for
 * top-level navigations but not for JSON / image / script fetches. */
function wantsHtml(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("Accept");
  return Boolean(accept && accept.includes("text/html"));
}

/* Stamp a response with a Date header we control so we can age it out
 * later. We can't mutate the original Response.headers — clone it with
 * an augmented Headers init. */
async function stampDate(response) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cached-at", String(Date.now()));
  const body = await response.clone().blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isCacheTooOld(cached) {
  const stamp = cached.headers.get("x-sw-cached-at");
  if (!stamp) return false; // legacy entries: trust until eviction
  const cachedAt = Number(stamp);
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt > PAGE_MAX_AGE_MS;
}

self.addEventListener("fetch", (event) => {
  // Only GETs are cacheable; anything else (POST to /api, etc.) passes through.
  if (event.request.method !== "GET") return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Static assets — cache-first / stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(handleStatic(event));
    return;
  }

  // Marketing HTML — network-first with SWR fallback so the page is
  // available offline.
  if (isMarketingPage(url) && wantsHtml(event.request)) {
    event.respondWith(handleMarketingPage(event));
    return;
  }

  // Everything else (incl. /api, /admin, /tools, anything excluded) —
  // browser default. Don't event.respondWith().
});

async function handleStatic(event) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  if (fresh) return fresh;
  return new Response("", { status: 504, statusText: "offline" });
}

async function handleMarketingPage(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(event.request);
  const tooOld = cached ? isCacheTooOld(cached) : false;

  /* Network promise: we always fire it (revalidate-in-background), but
   * if the cache is stale or empty we await it instead of returning the
   * cache immediately. */
  const network = fetch(event.request)
    .then(async (response) => {
      // Only cache 200 OK same-origin HTML. Anything else (3xx redirects,
      // 4xx auth gates, opaque responses) we let pass through.
      if (
        response &&
        response.status === 200 &&
        response.type !== "opaqueredirect"
      ) {
        const stamped = await stampDate(response);
        cache.put(event.request, stamped.clone()).catch(() => {});
        return stamped;
      }
      return response;
    })
    .catch(() => null);

  // Have a fresh cache + we're online? Serve cache, refresh in background.
  if (cached && !tooOld) {
    event.waitUntil(network);
    return cached;
  }

  // Cache is stale (>7d) or absent: prefer network, fall back to cache,
  // fall back to whatever last-ditch response we can synthesize.
  const fresh = await network;
  if (fresh) return fresh;
  if (cached) return cached; // stale-but-better-than-nothing offline view

  /* Last resort: a tiny inline offline page so the user sees *something*
   * even if they hit a route we never cached. Keeps the chrome consistent
   * with the rest of spacefield — same color tokens, same font stack. */
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />`
      + `<title>Offline · Space Field</title>`
      + `<meta name="viewport" content="width=device-width,initial-scale=1" />`
      + `<style>html,body{margin:0;height:100%;background:#0a0a0a;color:#f1f2f4;`
      + `font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;`
      + `display:flex;align-items:center;justify-content:center}main{max-width:32rem;`
      + `padding:2rem;text-align:center}h1{font-size:1.5rem;font-weight:600;margin:0 0 .5rem}`
      + `p{margin:.5rem 0;color:#9aa0a6}button{margin-top:1.25rem;border:1px solid #2a2a2a;`
      + `background:#16181b;color:inherit;border-radius:.5rem;padding:.6rem 1rem;`
      + `font-size:.85rem;cursor:pointer}</style></head>`
      + `<body><main><h1>You're offline</h1>`
      + `<p>Space Field can't reach the network right now.</p>`
      + `<p>The pages you've already visited are still available. `
      + `Other pages will load again when you're back online.</p>`
      + `<button onclick="location.reload()">Try again</button>`
      + `</main></body></html>`,
    {
      status: 503,
      statusText: "offline",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

self.addEventListener("push", (event) => {
  // Server sends a JSON payload; fall back to a generic notification when
  // the payload is missing (some browsers fire empty push for delivery checks).
  let payload = null;
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { title: "Spacefield", body: event.data.text() };
      } catch {
        payload = null;
      }
    }
  }

  const title = (payload && payload.title) || "Spacefield";
  const options = {
    body: (payload && payload.body) || "",
    icon: (payload && payload.icon) || "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    tag: (payload && payload.tag) || undefined,
    data: {
      href: (payload && payload.href) || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.href) || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing tab on the same origin.
      for (const client of clientsList) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client && target) {
              try {
                await client.navigate(target);
              } catch {
                // navigate() can fail on cross-origin redirects; ignore.
              }
            }
            return;
          }
        } catch {
          // skip malformed URLs
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
