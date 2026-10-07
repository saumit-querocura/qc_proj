/* QueroCura service worker.
 *  1. Web Push: shows reminders / check-ins and opens the right page when tapped.
 *  2. Speed: images, icons, web fonts and the site's own scripts/styles are served from cache after the first visit.
 *     Scripts and styles are only kept when their URL carries a content hash (?v=...): a changed file gets a new URL, so a
 *     release is picked up on the next page load. They are also re-checked in the background, so even a file whose hash
 *     was forgotten is fresh on the visit after.
 * Pages and API calls are NEVER cached here, so signed-in content always comes straight from the network. */
const CACHE = "qc-static-v2";
const STATIC_HOSTS = ["fonts.gstatic.com"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("qc-static-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- caching of static media ---------- */
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isMedia = sameOrigin && /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname) && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"));
  const isVersionedCode = sameOrigin && /\.(?:js|css)$/i.test(url.pathname) && /^[0-9a-f]{6,}$/.test(url.searchParams.get("v") || "");
  if (isVersionedCode) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const refresh = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
      if (hit) { event.waitUntil(refresh.catch(() => {})); return hit; }
      return refresh;
    })());
    return;
  }
  if (!(isMedia || STATIC_HOSTS.includes(url.hostname))) return;     // everything else: untouched
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return hit || Response.error();
    }
  })());
});

/* ---------- push ---------- */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "QueroCura").slice(0, 80);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || "").slice(0, 200),
    icon: "/icons/android-chrome-192x192.png",
    badge: "/icons/favicon-48x48.png",
    tag: String(data.tag || "qc"),
    renotify: false,
    data: { url: String(data.url || "/") },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let target;
  try {
    target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);   // never navigate off-site
  } catch (e) { target = new URL("/", self.location.origin); }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin && "focus" in w) {
        try { await w.focus(); if ("navigate" in w) await w.navigate(target.href); } catch (e) { /* fall through to open */ }
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});

/* The browser rotated the subscription: tell the page so it can re-register with the server. */
self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => wins.forEach(w => w.postMessage({ type: "qc-push-resubscribe" }))));
});
