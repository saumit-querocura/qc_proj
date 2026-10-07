/* Loads first, async, and is tiny.  Two jobs:
 *  1. De-duplicate identical GET calls to the API.  Several scripts on a page ask for /auth/me or the calendar at once;
 *     they now share one request.  Any write (POST/PUT/PATCH/DELETE) forgets everything.
 *  2. Start the calls a page is known to need immediately, in parallel, instead of waiting for the page's own scripts
 *     to download and run one after another.  The page's normal fetch() then picks up the answer already on its way.
 * If this file is late or blocked nothing breaks: pages fetch for themselves exactly as before. */
(function () {
  "use strict";
  if (!window.fetch || window.__qcEarly) return;
  window.__qcEarly = true;
  var API = window.QC_API_BASE || "https://app.querocura.com/api";
  var native = window.fetch.bind(window);
  var store = {};                                   // url -> { t, p, pre }
  var TTL = { "/auth/me": 30000, "/profile": 20000 };
  var DEFAULT_TTL = 8000;

  function pathOf(url) { return url.slice(API.length).split("?")[0]; }
  function mine(url) { return typeof url === "string" && url.indexOf(API) === 0; }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url);
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (!mine(url)) return native(input, init);
    if (method !== "GET") { store = {}; return native(input, init); }
    var ent = store[url];
    var fresh = ent && (Date.now() - ent.t < (ent.pre ? 20000 : (TTL[pathOf(url)] || DEFAULT_TTL)));
    var noStore = init && init.cache === "no-store";
    if (fresh && (!noStore || ent.pre)) {
      if (ent.pre) ent.pre = false;                 // a prefetched answer is used once for callers that asked for a fresh one
      return ent.p.then(function (r) { return r.clone(); });
    }
    var p = native(input, init);
    store[url] = { t: Date.now(), p: p, pre: false };
    p.then(function (r) { if (!r.ok && store[url] && store[url].p === p) delete store[url]; }, function () { if (store[url] && store[url].p === p) delete store[url]; });
    return p.then(function (r) { return r.clone(); });
  };

  function prefetch(paths) {
    paths.forEach(function (path) {
      var url = API + path;
      if (store[url]) return;
      var p = native(url, { credentials: "include" });
      store[url] = { t: Date.now(), p: p, pre: true };
      p.then(function (r) { if (!r.ok && store[url] && store[url].p === p) delete store[url]; }, function () { if (store[url] && store[url].p === p) delete store[url]; });
    });
  }

  var ME = ["/auth/me", "/profile"];
  var PAGES = {
    "calendar": ME.concat(["/calendar/events"]),
    "curavault": ME.concat(["/curavault/status", "/curavault/records", "/curavault/medications/current", "/curavault/vitals", "/curavault/consent/requests", "/curavault/access-logs", "/insights/dashboard?days=365"]),
    "dashboard": ME.concat(["/insights/dashboard?days=30", "/calendar/events", "/vitals/latest", "/vitals/history?limit=40", "/vitals/history?limit=10", "/vitals/dashboard?days=14", "/smart-followups/due"]),
    "insights": ME.concat(["/insights/dashboard?days=30", "/insights/records", "/calendar/events"]),
    "vitals": ME.concat(["/vitals/history?limit=40", "/vitals/latest"]),
    "profile": ME,
    "family": ME,
    "privacy": ME,
    "weekly": ME,
    "care": ME.concat(["/care/overview"]),
    "visit": ME.concat(["/insights/visit-prep"])
  };
  var seg = (location.pathname.replace(/\/+$/, "").split("/").pop() || "");
  if (PAGES[seg] && !/[?&]noprefetch/.test(location.search)) prefetch(PAGES[seg]);

  // Keep the site's scripts and styles on the device (see /sw.js) so repeat visits don't wait for them.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      setTimeout(function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); }, 1500);
    });
  }
})();
