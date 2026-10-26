/* QueroCura service worker.
 *  1. Web Push: shows reminders / check-ins and opens the right page when tapped; medicine doses carry Taken / Snooze
 *     buttons that work with the app closed.
 *  2. Speed: images, icons, web fonts and the site's own scripts/styles are served from cache after the first visit.
 *     Scripts and styles are only kept when their URL carries a content hash (?v=...): a changed file gets a new URL, so a
 *     release is picked up on the next page load. They are also re-checked in the background, so even a file whose hash
 *     was forgotten is fresh on the visit after.
 * API calls are NEVER cached here, so signed-in content always comes straight from the network.  The one page kept is the
 * hospital portal's empty shell (no patient data in it), so the desk can open the portal while the internet is down. */
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
const SHELL = "qc-shell-v1";
const SHELL_PAGES = ["/hospital/", "/hospital/index.html"];        // the portal's empty page: no patient data in it
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && req.mode === "navigate" && SHELL_PAGES.includes(url.pathname)) {
    // network first, so a release is picked up at once; the last copy when the internet is down
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put("/hospital/", res.clone());
        return res;
      } catch (e) {
        return (await cache.match("/hospital/")) || Response.error();
      }
    })());
    return;
  }
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
// Medicine doses arrive with Taken / Snooze buttons and a signed dose token: the button answers the dose straight from
// the notification (no page, no cookie).  If the phone is offline the answer waits in IndexedDB and is sent on the next
// chance (background sync where the browser has it, otherwise the next push or the next time a page opens).
const API = self.location.hostname.endsWith("querocura.com") ? "https://app.querocura.com/api" : self.location.origin + "/api";

function tellPages(msg) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => wins.forEach(w => { try { w.postMessage(msg); } catch (e) {} }));
}

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "QueroCura").slice(0, 80);
  const dose = data.dose && typeof data.dose.token === "string" ? { token: data.dose.token.slice(0, 600), event_id: String(data.dose.event_id || "").slice(0, 80) } : null;
  const opts = {
    body: String(data.body || "").slice(0, 200),
    icon: "/icons/android-chrome-192x192.png",
    badge: "/icons/favicon-48x48.png",
    tag: String(data.tag || "qc"),
    renotify: !!dose,
    requireInteraction: !!data.require_interaction,
    data: { url: String(data.url || "/"), dose: dose, kind: String(data.kind || "") },
  };
  if (dose && Array.isArray(data.actions)) opts.actions = data.actions.slice(0, 2).map(a => ({ action: String(a.action || ""), title: String(a.title || "").slice(0, 24) }));
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    tellPages({ type: "qc-push", kind: opts.data.kind, title: title, body: opts.body, dose: dose }),
    flushDoses(),
  ]));
});

/* a tiny IndexedDB queue for dose answers that couldn't be sent */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("qc-sw", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("doses", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function store(mode, fn) {
  return idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction("doses", mode), st = tx.objectStore("doses"), out = fn(st);
    tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error);
  }));
}
function postDose(item) {
  return fetch(API + "/push/dose", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: item.token, action: item.action, snooze_minutes: 15 }) })
    .then(r => r.json().catch(() => ({})).then(d => ({ status: r.status, data: d })));
}
function flushDoses() {
  return store("readonly", st => st.getAll()).then(items => Promise.all((items || []).map(it =>
    postDose(it).then(r => { if (r.status && r.status < 500) return store("readwrite", st => st.delete(it.id)); }).catch(() => {})
  ))).catch(() => {});
}
self.addEventListener("sync", event => { if (event.tag === "qc-doses") event.waitUntil(flushDoses()); });
self.addEventListener("message", event => { if (event.data && event.data.type === "qc-flush-doses") event.waitUntil(flushDoses()); });

function answerDose(n, action) {
  const dose = n.data.dose, item = { id: dose.event_id + ":" + action, token: dose.token, action: action, ts: Date.now() };
  const done = (title, body) => self.registration.showNotification(title, { body: body, tag: n.tag, icon: "/icons/android-chrome-192x192.png", badge: "/icons/favicon-48x48.png", silent: true, data: { url: n.data.url } });
  return postDose(item).then(r => {
    if (r.status === 200 && r.data.ok) {
      return Promise.all([
        action === "taken" ? done("Marked as taken ✓", "Well done. We've let your family know if you share medicines with them.") : done("Snoozed for 15 minutes", "We'll remind you again shortly."),
        tellPages({ type: "qc-dose-done", event_id: dose.event_id, action: action }),
      ]);
    }
    return done("Couldn't mark that dose", (r.data && (r.data.err || r.data.message)) || "Open QueroCura to mark it.");
  }, () => store("readwrite", st => st.put(item))
    .then(() => self.registration.sync ? self.registration.sync.register("qc-doses").catch(() => {}) : null)
    .then(() => done("Saved on this phone", action === "taken" ? "We'll mark it as taken as soon as you're back online." : "We'll snooze it once you're back online.")));
}

self.addEventListener("notificationclick", event => {
  const n = event.notification;
  event.notification.close();
  if (event.action && n.data && n.data.dose && (event.action === "taken" || event.action === "snooze")) {
    event.waitUntil(answerDose(n, event.action));
    return;
  }
  let target;
  try {
    target = new URL((n.data && n.data.url) || "/", self.location.origin);
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
