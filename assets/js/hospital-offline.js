/* The portal when the internet drops.
 *
 * Writes: every POST carries an Idempotency-Key, so a request that was lost on the way can be sent again without being
 * done twice (the server remembers the answer per person).  A write that fails because the connection is down is retried
 * once; if it still can't go, and it is one of the desk's everyday steps that is safe to do later (checking a patient in,
 * marking an appointment arrived, taking a cash payment, recording vital signs), it is kept in a queue on this computer and
 * sent, in order, the moment the connection is back.  Anything else asks the person to try again when online.
 * Reads: the last copy of the screens people work from (the queue, the board, appointments, patient lists) is kept for
 * this browser session, and shown, marked as offline, when the network is down.
 * The queue lives in this browser only, belongs to the person signed in, expires after a day, and is cleared on sign-out.
 * Exposes window.QCOffline; hospital.js routes its API calls through it. */
(function () {
  "use strict";
  var P = window.QCPage;
  var QKEY = "qc-offline-queue", CKEY = "qc-offline-cache:", TTL = 24 * 3600 * 1000;
  var SAFE = [
    [/^\/hospital\/ops\/encounters$/, function (b) { return b && (b.kind === "opd" || b.kind === "er") && !b.bed_id; }, "Check-in"],   // never an admission: beds can clash
    [/^\/hospital\/ops\/encounters\/[^/]+\/obs$/, function () { return true; }, "Vital signs"],
    [/^\/hospital\/appointments\/[^/]+$/, function (b) { return b && b.action === "arrive"; }, "Arrived"],
    [/^\/hospital\/billing\/[^/]+$/, function (b) { return b && b.action === "pay" && b.mode === "cash" && !b.refund; }, "Cash payment"],
  ];
  var CACHE = [/^\/hospital\/ops\/queue/, /^\/hospital\/ops\/board/, /^\/hospital\/appointments/, /^\/hospital\/patients(\?|$)/, /^\/hospital\/ops\/inpatients/,
    /^\/hospital\/my-day/, /^\/hospital\/billing\/desk/, /^\/hospital\/me$/];
  var who = "", flushing = false, listeners = [];

  function key() { return (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8)).slice(0, 40); }
  function load() {
    try { var q = JSON.parse(localStorage.getItem(QKEY) || "[]"); return q.filter(function (x) { return x.who === who && Date.now() - x.ts < TTL; }); } catch (e) { return []; }
  }
  function save(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} notify(); }
  function notify() { listeners.forEach(function (f) { try { f(state()); } catch (e) {} }); }
  function state() { var q = load(); return { online: navigator.onLine !== false, queued: q.filter(function (x) { return !x.failed; }).length, failed: q.filter(function (x) { return x.failed; }), items: q }; }

  function send(path, body, idem) {
    return fetch(P.API + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": idem }, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; if (d.ok === undefined) d.ok = r.ok; return d; }); })
      .catch(function () { return { ok: false, status: 0, message: "We couldn’t reach QueroCura. Check your connection and try again." }; });
  }

  function post(path, opts) {
    var body = opts && opts.body, idem = key();
    return send(path, body, idem).then(function (r) {
      if (r.status !== 0) return r;
      return new Promise(function (res) { setTimeout(res, 1200); }).then(function () { return send(path, body, idem); }).then(function (r2) {
        if (r2.status !== 0) return r2;
        var rule = SAFE.filter(function (s) { return s[0].test(path) && s[1](body); })[0];
        if (!rule || !who) return r2;
        var q = load(); q.push({ id: idem, who: who, path: path, body: body, ts: Date.now(), label: rule[2] }); save(q);
        return { ok: true, queued: true, offline: true, message: rule[2] + " saved on this computer. It will be sent as soon as you’re back online.", item: null };
      });
    });
  }

  function get(path, live) {
    return live.then(function (r) {
      var cacheable = CACHE.some(function (re) { return re.test(path); });
      if (r && r.ok && cacheable) { try { sessionStorage.setItem(CKEY + who + ":" + path, JSON.stringify({ t: Date.now(), r: r })); } catch (e) {} }
      if (r && r.status === 0 && cacheable) {
        try {
          var c = JSON.parse(sessionStorage.getItem(CKEY + who + ":" + path) || "null");
          if (c) { c.r.offline = true; c.r.offline_since = c.t; return c.r; }
        } catch (e) {}
      }
      return r;
    });
  }

  function flush() {
    if (flushing || navigator.onLine === false) return Promise.resolve();
    var q = load().filter(function (x) { return !x.failed; });
    if (!q.length) return Promise.resolve();
    flushing = true;
    var sent = 0, failed = 0;
    var step = function (i) {
      if (i >= q.length) return Promise.resolve();
      var x = q[i];
      return send(x.path, x.body, x.id).then(function (r) {
        var all = load();
        if (r.status === 0) return Promise.reject("offline");               // still offline: stop and try later
        if (r.ok) { all = all.filter(function (y) { return y.id !== x.id; }); sent++; }
        else { all.forEach(function (y) { if (y.id === x.id) { y.failed = true; y.message = r.message || "Refused."; } }); failed++; }
        save(all);
        return step(i + 1);
      });
    };
    return step(0).catch(function () {}).then(function () {
      flushing = false;
      if (sent) P.toast(sent + " saved step" + (sent === 1 ? "" : "s") + " sent now that you’re back online.");
      if (failed) P.toast(failed + " saved step" + (failed === 1 ? " needs" : "s need") + " your attention.", "err");
    });
  }

  function discard(id) { save(load().filter(function (x) { return x.id !== id; })); }
  function clear() {
    try { localStorage.removeItem(QKEY); Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(CKEY) === 0) sessionStorage.removeItem(k); }); } catch (e) {}
    notify();
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    setTimeout(function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); }, 2000);   // keeps the portal page for offline use
  }
  window.addEventListener("online", function () { notify(); flush(); });
  window.addEventListener("offline", notify);
  setInterval(function () { if (load().length) flush(); }, 30000);

  window.QCOffline = {
    post: post, get: get, flush: flush, discard: discard, clear: clear, state: state,
    setUser: function (id) { who = id || ""; notify(); if (who) flush(); },
    onChange: function (f) { listeners.push(f); },
  };
})();
