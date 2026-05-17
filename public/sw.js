/*
 * Spacefield service worker — deliberately minimal.
 *
 * Bumping CACHE_VERSION invalidates the old cache and triggers re-fetch
 * of static assets. HTML and API responses are NEVER cached here — they
 * pass through so dynamic admin/runtime config stays fresh.
 *
 * Push payload shape (server-side):
 *   { title: string, body: string, href?: string, tag?: string, icon?: string }
 */

const CACHE_VERSION = "spacefield-static-v1";

/* Paths we're willing to stale-while-revalidate. Everything else passes
 * straight through — particularly HTML, API routes, and anything under
 * /admin or /api which must reflect live data. */
const STATIC_PREFIXES = ["/icons/", "/_next/static/", "/fonts/"];

self.addEventListener("install", (event) => {
  // Activate immediately so users on the next page-load get the new SW.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache that isn't the current version.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
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

  if (!isStaticAsset(url)) return; // pass-through (browser default)

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          // Only cache successful, basic/cors responses to avoid poisoning.
          if (response && response.status === 200) {
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Stale-while-revalidate: serve cache now, refresh in background.
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;
      if (fresh) return fresh;
      // Last resort: an empty 504 keeps the page from hanging on a dead network.
      return new Response("", { status: 504, statusText: "offline" });
    })(),
  );
});

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
