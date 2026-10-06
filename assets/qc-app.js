/* QueroCura shared app runtime: one place for the things every signed-in page needs.
 *
 *   QC.copy(text)            clipboard copy that works without a secure context
 *   QC.toast(msg, kind)      small non-blocking message
 *   QC.insights(days)        cached /insights/dashboard (the ONE source of the health score)
 *   QC.cal                   calendar data layer (server first, local fallback)
 *   notification centre      the bell in the top bar: alerts + appointment reminders
 */
(function () {
  "use strict";
  var API_BASE = (window.QC_API_BASE || "https://app.querocura.com/api");
  var QC = window.QC = window.QC || {};
  QC.API_BASE = API_BASE;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  QC.esc = esc;
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  QC.ls = { get: lsGet, set: lsSet };

  /* ---------- copy + toast ---------- */
  QC.copy = function (text) {
    text = String(text == null ? "" : text);
    function legacy() {
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement("textarea");
          ta.value = text; ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error("copy failed"));
        } catch (e) { reject(e); }
      });
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  };

  var toastBox;
  QC.toast = function (msg, kind, ms) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "qc-toasts";
      toastBox.setAttribute("role", "status");
      toastBox.setAttribute("aria-live", "polite");
      document.body.appendChild(toastBox);
    }
    var t = document.createElement("div");
    t.className = "qc-toast " + (kind || "ok");
    t.textContent = msg;
    toastBox.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 300); }, ms || 3200);
  };

  /* ---------- insights (single source of the score) ---------- */
  /* Stale-while-revalidate: the last good answer is kept for this browser tab (sessionStorage, never
   * shared across tabs/devices, wiped on sign-out) so a page can paint instantly and then quietly
   * refresh. Pages call QC.stale(key) for the instant paint and QC.insights()/QC.records() for fresh. */
  var SWR = "qc-swr:", SWR_MAX_AGE = 10 * 60 * 1000;
  function swrGet(k) { try { var v = JSON.parse(sessionStorage.getItem(SWR + k)); if (v && Date.now() - v.t < SWR_MAX_AGE) return v.d; } catch (e) {} return null; }
  function swrSet(k, d) { try { sessionStorage.setItem(SWR + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  QC.stale = swrGet;
  QC.clearCache = function () {
    try { Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(SWR) === 0) sessionStorage.removeItem(k); }); } catch (e) {}
    insightCache = {}; recCache = null; window.__qcPre = window.__qcPreRec = null;
  };

  function getJSON(path) {
    return fetch(API_BASE + path, { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  var insightCache = {}, recCache = null;
  QC.insights = function (days, force) {
    days = days || 30;
    var hit = insightCache[days];
    if (!force && hit && Date.now() - hit.t < 20000) return hit.p;
    // A page may have started this request before this script loaded (window.__qcPre) — use it once.
    var pre = null;
    if (!force && days === 30 && window.__qcPre) { pre = window.__qcPre; window.__qcPre = null; }
    var p = (pre || getJSON("/insights/dashboard?days=" + days)).then(function (d) {
      if (d && d.ok !== false) swrSet("insights-" + days, d);
      return d;
    }, function () { return null; });
    insightCache[days] = { t: Date.now(), p: p };
    return p;
  };
  QC.records = function (force) {
    if (!force && recCache && Date.now() - recCache.t < 20000) return recCache.p;
    var pre = null;
    if (!force && window.__qcPreRec) { pre = window.__qcPreRec; window.__qcPreRec = null; }
    var p = (pre || getJSON("/insights/records")).then(function (d) {
      if (d && d.ok !== false) swrSet("records", d);
      return d;
    }, function () { return null; });
    recCache = { t: Date.now(), p: p };
    return p;
  };
  // Drop cached health data whenever someone signs out, on any page.
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("#qc-signout-btn, [data-qc-signout]");
    if (t) QC.clearCache();
  }, true);

  /* One definition of "what the score means", shared by Dashboard + Insights. */
  QC.scoreView = function (risk) {
    var C = 2 * Math.PI * 56;
    if (!risk || !risk.has_data) {
      return { has: false, num: "—", band: "No data yet", color: "#8f8ba3", offset: C, C: C, note: "Log a reading or run a symptom check to get your score.", confidence: "" };
    }
    var conf = risk.confidence_label ? (risk.confidence_label + " confidence") : "";
    var note = risk.confidence_label === "Provisional" ? "Provisional — add vitals or a symptom check to sharpen it." : "";
    return { has: true, num: risk.score, band: risk.band || "", color: risk.color || "#0e8f83", offset: C - (risk.score / 100) * C, C: C, note: note, confidence: conf };
  };

  /* ---------- calendar data layer ---------- */
  var LOCAL_KEY = "qc-cal-events";
  QC.cal = {
    mode: null, // "server" | "local"
    types: {
      doctor: { label: "Doctor visit", icon: "🩺", color: "#0e8f83" },
      specialist: { label: "Specialist consult", icon: "👨‍⚕️", color: "#2f8fd1" },
      surgery: { label: "Surgery / procedure", icon: "🏥", color: "#d24f28" },
      test: { label: "Lab test / scan", icon: "🧪", color: "#7c6fdb" },
      followup: { label: "Follow-up", icon: "🔁", color: "#c98a10" },
      vaccine: { label: "Vaccination", icon: "💉", color: "#2f8f5e" },
      dental: { label: "Dental", icon: "🦷", color: "#4aa3c8" },
      therapy: { label: "Therapy / physio", icon: "🧘", color: "#b0629c" },
      medication: { label: "Medication / refill", icon: "📦", color: "#8a7bb5" },
      other: { label: "Other", icon: "📌", color: "#6b6885" }
    },
    defaultReminders: { surgery: [10080, 1440, 120], test: [1440, 120], specialist: [4320, 1440, 120], vaccine: [1440] },
    localEvents: function () { return lsGet(LOCAL_KEY, []); },
    saveLocal: function (list) { lsSet(LOCAL_KEY, list); },
    list: function () {
      return fetch(API_BASE + "/calendar/events", { credentials: "include" })
        .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then(function (d) { if (!d.ok) throw new Error("not ok"); QC.cal.mode = "server"; return d.events || []; })
        .catch(function () { QC.cal.mode = "local"; return QC.cal.localEvents(); });
    },
    save: function (ev) {
      var isNew = !ev.id;
      if (QC.cal.mode === "server") {
        var url = API_BASE + "/calendar/events" + (isNew ? "" : "/" + encodeURIComponent(ev.id));
        return fetch(url, { method: isNew ? "POST" : "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) })
          .then(function (r) { return r.json().then(function (d) { if (!d.ok) throw new Error(d.message || "Couldn't save."); return d.event; }); });
      }
      var list = QC.cal.localEvents();
      if (isNew) { ev = Object.assign({}, ev, { id: "local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); list.push(ev); }
      else { list = list.map(function (x) { return x.id === ev.id ? Object.assign({}, x, ev) : x; }); }
      QC.cal.saveLocal(list);
      return Promise.resolve(ev);
    },
    remove: function (id) {
      if (QC.cal.mode === "server" && String(id).indexOf("local-") !== 0) {
        return fetch(API_BASE + "/calendar/events/" + encodeURIComponent(id), { method: "DELETE", credentials: "include" }).then(function (r) { if (!r.ok) throw new Error("Couldn't delete."); });
      }
      QC.cal.saveLocal(QC.cal.localEvents().filter(function (x) { return x.id !== id; }));
      return Promise.resolve();
    },
    /* push anything saved locally (offline / older backend) up to the server */
    syncLocal: function () {
      var local = QC.cal.localEvents();
      if (QC.cal.mode !== "server" || !local.length) return Promise.resolve(0);
      return Promise.all(local.map(function (ev) {
        var body = Object.assign({}, ev); delete body.id;
        return fetch(API_BASE + "/calendar/events", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.ok; }).catch(function () { return false; });
      })).then(function (res) { if (res.every(Boolean)) QC.cal.saveLocal([]); return res.filter(Boolean).length; });
    },
    pad: function (n) { return (n < 10 ? "0" : "") + n; },
    parse: function (s) { // "YYYY-MM-DDTHH:MM" as LOCAL time
      if (!s) return null;
      var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
      return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
    },
    fmt: function (d) { var p = QC.cal.pad; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); },
    /* every occurrence of ev within [lo, hi] */
    occurrences: function (ev, lo, hi) {
      var start = QC.cal.parse(ev.start); if (!start) return [];
      var rec = ev.recurrence || "none", out = [];
      if (rec === "none") return (start >= lo && start <= hi) ? [start] : [];
      var until = ev.recurrence_until ? QC.cal.parse(ev.recurrence_until) : null;
      var end = until ? new Date(Math.min(until.getTime() + 86400000, hi.getTime())) : hi;
      for (var n = 0; n < 1500; n++) {
        var d = new Date(start);
        if (rec === "daily") d.setDate(start.getDate() + n);
        else if (rec === "weekly") d.setDate(start.getDate() + 7 * n);
        else if (rec === "monthly") { d.setDate(1); d.setMonth(start.getMonth() + n); d.setDate(Math.min(start.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
        else { d.setFullYear(start.getFullYear() + n); if (d.getMonth() !== start.getMonth()) d.setDate(0); }
        if (d > end) break;
        if (d >= lo) out.push(d);
      }
      return out;
    },
    humanWhen: function (d) {
      var now = new Date(), a = new Date(now.getFullYear(), now.getMonth(), now.getDate()), b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var diff = Math.round((b - a) / 86400000);
      var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      if (diff === 0) return "Today, " + t;
      if (diff === 1) return "Tomorrow, " + t;
      if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: "long" }) + ", " + t;
      return d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", " + t;
    },
    upcoming: function (days) {
      var lo = new Date(), hi = new Date(Date.now() + (days || 30) * 86400000), out = [];
      return QC.cal.list().then(function (events) {
        events.forEach(function (ev) {
          if (ev.status && ev.status !== "scheduled") return;
          QC.cal.occurrences(ev, lo, hi).forEach(function (d) { out.push({ ev: ev, when: d }); });
        });
        out.sort(function (a, b) { return a.when - b.when; });
        return out;
      });
    }
  };

  /* ---------- notification centre ---------- */
  var DISMISS_KEY = "qc-alert-dismissed";   // { id: untilTimestamp }
  var FIRED_KEY = "qc-cal-fired";           // { "id|when|mins": ts }
  var SEV = {
    emergency: { c: "#b3182a", l: "Emergency", i: "🚨", r: 0 },
    urgent: { c: "#d24f28", l: "Urgent", i: "⚠️", r: 1 },
    caution: { c: "#c98a10", l: "Caution", i: "🟠", r: 2 },
    watch: { c: "#2f8fd1", l: "Worth watching", i: "👀", r: 3 },
    reminder: { c: "#0e8f83", l: "Reminder", i: "📅", r: 2 },
    info: { c: "#6b6885", l: "Info", i: "💡", r: 4 }
  };
  QC.alertState = { items: [] };

  function dismissed() {
    var d = lsGet(DISMISS_KEY, {}), now = Date.now(), live = {};
    Object.keys(d).forEach(function (k) { if (d[k] > now) live[k] = d[k]; });
    return live;
  }
  function dismiss(id, hours) {
    var d = dismissed(); d[id] = Date.now() + (hours || 24) * 3600000; lsSet(DISMISS_KEY, d);
  }

  function reminderAlerts(upcoming) {
    var now = Date.now(), items = [], fired = lsGet(FIRED_KEY, {});
    upcoming.slice(0, 40).forEach(function (u) {
      var ev = u.ev, start = u.when.getTime();
      var mins = (ev.reminders && ev.reminders.length) ? ev.reminders : (QC.cal.defaultReminders[ev.type] || [1440, 60]);
      // the soonest reminder window we're already inside
      var inside = mins.filter(function (m) { return now >= start - m * 60000; }).sort(function (a, b) { return a - b; })[0];
      if (inside === undefined) return;
      var t = QC.cal.types[ev.type] || QC.cal.types.other;
      var hoursLeft = (start - now) / 3600000;
      items.push({
        id: "cal-" + ev.id + "-" + start,
        severity: hoursLeft <= 3 ? "urgent" : "reminder",
        title: (t.icon + " " + ev.title),
        message: QC.cal.humanWhen(u.when) + (ev.location ? " · " + ev.location : "") + (ev.provider ? " · " + ev.provider : ""),
        href: "../calendar/", cta: "Open calendar", kind: "calendar",
        _fireKey: ev.id + "|" + start + "|" + inside
      });
    });
    return { items: items, fired: fired };
  }

  function maybeNativeNotify(items) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var fired = lsGet(FIRED_KEY, {}), changed = false;
    items.forEach(function (a) {
      if (a.kind !== "calendar" || !a._fireKey || fired[a._fireKey]) return;
      fired[a._fireKey] = Date.now(); changed = true;
      try { new Notification(a.title.replace(/^\S+\s/, ""), { body: a.message, icon: "../icons/android-chrome-192x192.png", tag: a._fireKey }); } catch (e) {}
    });
    if (changed) {
      var keys = Object.keys(fired); if (keys.length > 300) keys.sort(function (a, b) { return fired[a] - fired[b]; }).slice(0, keys.length - 300).forEach(function (k) { delete fired[k]; });
      lsSet(FIRED_KEY, fired);
    }
  }

  function buildBell() {
    var right = $(".topbar-right"); if (!right || $("#qc-bell")) return;
    var wrap = document.createElement("div");
    wrap.className = "qc-bell-wrap";
    wrap.innerHTML =
      '<button type="button" class="qc-bell" id="qc-bell" aria-label="Alerts and reminders" aria-haspopup="true" aria-expanded="false">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '<span class="qc-bell-badge" id="qc-bell-badge" hidden>0</span>' +
      '</button>' +
      '<div class="qc-panel" id="qc-panel" role="dialog" aria-label="Alerts" hidden>' +
        '<div class="qc-panel-head"><strong>Alerts &amp; reminders</strong><span id="qc-panel-sub"></span></div>' +
        '<div class="qc-panel-body" id="qc-panel-body"></div>' +
        '<div class="qc-panel-foot"><a href="../calendar/">📅 Calendar</a><button type="button" id="qc-notify-btn">Enable desktop alerts</button></div>' +
      '</div>';
    right.insertBefore(wrap, right.firstChild);

    var bell = $("#qc-bell"), panel = $("#qc-panel");
    // Mount on <body>: the sticky top bar has backdrop-filter, which would otherwise
    // become the containing block for a position:fixed panel.
    document.body.appendChild(panel);
    // Place the panel under the bell, clamped inside the viewport (the bell can sit
    // on a wrapped row at the far left, so anchoring to its right edge pushed it off-screen).
    function place() {
      var r = bell.getBoundingClientRect(), w = Math.min(380, window.innerWidth - 24);
      var left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
      panel.style.left = left + "px";
      panel.style.top = Math.min(r.bottom + 10, window.innerHeight - 160) + "px";
      panel.style.maxHeight = Math.max(200, window.innerHeight - r.bottom - 30) + "px";
    }
    function open(v) { if (v) place(); panel.hidden = !v; bell.setAttribute("aria-expanded", v ? "true" : "false"); }
    window.addEventListener("resize", function () { if (!panel.hidden) place(); });
    window.addEventListener("scroll", function () { if (!panel.hidden) place(); }, { passive: true });
    bell.addEventListener("click", function (e) { e.stopPropagation(); open(panel.hidden); });
    document.addEventListener("click", function (e) { if (!panel.hidden && !wrap.contains(e.target) && !panel.contains(e.target)) open(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false); });
    panel.addEventListener("click", function (e) {
      var x = e.target.closest("[data-dismiss]");
      if (x) { dismiss(x.getAttribute("data-dismiss"), 24); renderAlerts(QC.alertState.items); }
    });
    var nb = $("#qc-notify-btn");
    function syncNotifyBtn() {
      if (!("Notification" in window)) { nb.style.display = "none"; return; }
      if (Notification.permission === "granted") nb.textContent = "Desktop alerts on ✓";
      else if (Notification.permission === "denied") nb.style.display = "none";
    }
    nb.addEventListener("click", function () {
      if (!("Notification" in window)) return;
      Notification.requestPermission().then(function () { syncNotifyBtn(); maybeNativeNotify(QC.alertState.items); });
    });
    syncNotifyBtn();
  }

  function renderAlerts(all) {
    var d = dismissed();
    var items = all.filter(function (a) { return !d[a.id]; }).sort(function (a, b) { return (SEV[a.severity] || SEV.info).r - (SEV[b.severity] || SEV.info).r; });
    var badge = $("#qc-bell-badge"), body = $("#qc-panel-body"), sub = $("#qc-panel-sub"), bell = $("#qc-bell");
    if (!badge || !body) return;
    var hot = items.filter(function (a) { return a.severity !== "info"; }).length;
    badge.textContent = hot > 9 ? "9+" : hot;
    badge.hidden = !hot;
    bell.classList.toggle("has-alerts", hot > 0);
    bell.classList.toggle("is-urgent", items.some(function (a) { return a.severity === "urgent" || a.severity === "emergency"; }));
    sub.textContent = items.length ? items.length + " item" + (items.length > 1 ? "s" : "") : "";
    if (!items.length) {
      body.innerHTML = '<div class="qc-empty"><div class="qc-empty-ic">✨</div><div><b>All clear</b></div><div class="qc-empty-sub">Nothing needs your attention. Weight drops, unusual vitals and upcoming appointments will show up here.</div></div>';
      return;
    }
    body.innerHTML = items.map(function (a) {
      var s = SEV[a.severity] || SEV.info;
      return '<div class="qc-alert" style="--ac:' + s.c + '"><span class="qc-alert-bar"></span><div class="qc-alert-main">' +
        '<div class="qc-alert-top"><span class="qc-alert-tag">' + s.i + " " + esc(s.l) + '</span><button type="button" class="qc-alert-x" data-dismiss="' + esc(a.id) + '" aria-label="Dismiss for today" title="Dismiss for today">✕</button></div>' +
        '<div class="qc-alert-title">' + esc(a.title) + '</div>' +
        (a.message ? '<div class="qc-alert-msg">' + esc(a.message) + '</div>' : '') +
        (a.href ? '<a class="qc-alert-cta" href="' + esc(a.href) + '">' + esc(a.cta || "Open") + ' →</a>' : '') +
        '</div></div>';
    }).join("");
  }

  var lastToastedUrgent = null;
  QC.refreshAlerts = function (opts) {
    opts = opts || {};
    return Promise.all([QC.insights(30, opts.force), QC.cal.upcoming(14).catch(function () { return []; })]).then(function (res) {
      var data = res[0], upcoming = res[1], items = [];
      if (data && data.ok) {
        if (Array.isArray(data.alerts)) {
          items = data.alerts.slice();
        } else if (data.vitals && data.vitals.analysis) { // older backend: derive from vitals flags
          (data.vitals.analysis.flags || []).forEach(function (f) {
            if (["watch", "caution", "urgent", "emergency"].indexOf(f.level) < 0) return;
            items.push({ id: "vitals-" + (f.code || f.metric), severity: f.level, title: f.metric === "weight" ? "Weight alert" : "Vitals alert", message: f.message, href: "../vitals/", cta: "Log a recheck", kind: "vitals" });
          });
        }
      }
      var rem = reminderAlerts(upcoming);
      items = items.concat(rem.items);
      QC.alertState.items = items;
      renderAlerts(items);
      maybeNativeNotify(items);
      var urgent = items.filter(function (a) { return (a.severity === "urgent" || a.severity === "emergency") && !dismissed()[a.id]; })[0];
      if (urgent && urgent.id !== lastToastedUrgent && opts.toast !== false) {
        lastToastedUrgent = urgent.id;
        QC.toast((SEV[urgent.severity] || SEV.urgent).i + " " + urgent.title + (urgent.message ? " — " + urgent.message : ""), "err", 6000);
      }
      return items;
    });
  };

  /* ---------- styles for the shared pieces ---------- */
  var css = '' +
    '.qc-bell-wrap{position:relative;flex:0 0 auto}' +
    '.qc-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;border:1.5px solid rgba(16,14,42,.14);background:#fff;color:#100e2a;cursor:pointer;padding:0;transition:transform .2s,background .2s}' +
    '.qc-bell:hover{transform:translateY(-2px)}' +
    '.qc-bell.has-alerts{border-color:#c98a10;color:#a06d08}' +
    '.qc-bell.is-urgent{border-color:#d24f28;color:#d24f28;animation:qcRing 2.4s ease-in-out infinite}' +
    '@keyframes qcRing{0%,86%,100%{transform:rotate(0)}89%{transform:rotate(14deg)}92%{transform:rotate(-12deg)}95%{transform:rotate(8deg)}98%{transform:rotate(-4deg)}}' +
    '.qc-bell-badge{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#d24f28;color:#fff;font:800 10px/17px "Manrope",sans-serif;text-align:center;box-shadow:0 0 0 2px #f6f5f1}' +
    '.qc-panel{position:fixed;left:12px;top:64px;width:min(380px,calc(100vw - 24px));max-height:min(70vh,520px);display:flex;flex-direction:column;background:#fff;border:1px solid rgba(16,14,42,.1);border-radius:18px;box-shadow:0 28px 60px -20px rgba(16,14,42,.35);z-index:60;overflow:hidden;animation:qcPop .18s ease}' +
    '.qc-panel[hidden]{display:none}' +
    '@keyframes qcPop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}' +
    '.qc-panel-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(16,14,42,.07);font:700 14px "Space Grotesk",sans-serif}' +
    '.qc-panel-head span{font:600 12px "Manrope",sans-serif;color:rgba(16,14,42,.5)}' +
    '.qc-panel-body{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px}' +
    '.qc-alert{display:flex;gap:10px;border-radius:12px;background:color-mix(in srgb,var(--ac) 8%,transparent);padding:10px 12px 11px 0;overflow:hidden}' +
    '.qc-alert-bar{flex:0 0 4px;border-radius:0 4px 4px 0;background:var(--ac)}' +
    '.qc-alert-main{flex:1;min-width:0}' +
    '.qc-alert-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}' +
    '.qc-alert-tag{font:800 10.5px "Manrope",sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--ac)}' +
    '.qc-alert-x{background:none;border:none;color:rgba(16,14,42,.4);cursor:pointer;font-size:12px;padding:2px 4px}.qc-alert-x:hover{color:#100e2a}' +
    '.qc-alert-title{font:700 13.5px "Manrope",sans-serif;color:#100e2a;margin-bottom:2px}' +
    '.qc-alert-msg{font:500 12.5px/1.45 "Manrope",sans-serif;color:rgba(16,14,42,.68)}' +
    '.qc-alert-cta{display:inline-block;margin-top:6px;font:800 12px "Manrope",sans-serif;color:var(--ac)}' +
    '.qc-empty{text-align:center;padding:26px 14px;font:500 13.5px "Manrope",sans-serif}.qc-empty-ic{font-size:26px;margin-bottom:6px}.qc-empty-sub{color:rgba(16,14,42,.5);font-size:12.5px;margin-top:4px;line-height:1.5}' +
    '.qc-panel-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid rgba(16,14,42,.07);font:700 12.5px "Manrope",sans-serif}' +
    '.qc-panel-foot button{background:none;border:1.5px solid rgba(16,14,42,.14);border-radius:999px;padding:6px 12px;font:700 12px "Manrope",sans-serif;cursor:pointer;color:inherit}' +
    '.qc-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:200;align-items:center;pointer-events:none;width:min(92vw,520px)}' +
    '.qc-toast{background:#100e2a;color:#fff;font:600 13.5px/1.4 "Manrope",sans-serif;padding:11px 18px;border-radius:14px;box-shadow:0 18px 40px -14px rgba(0,0,0,.5);opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;pointer-events:auto}' +
    '.qc-toast.in{opacity:1;transform:none}.qc-toast.ok{border-left:4px solid #0e8f83}.qc-toast.err{border-left:4px solid #d24f28}' +
    'html[data-theme="dark"] .qc-bell{background:#18162e;border-color:rgba(255,255,255,.14);color:#f2f0f8}' +
    'html[data-theme="dark"] .qc-bell-badge{box-shadow:0 0 0 2px #100e2a}' +
    'html[data-theme="dark"] .qc-panel{background:#18162e;border-color:rgba(255,255,255,.12);color:#f2f0f8}' +
    'html[data-theme="dark"] .qc-panel-head,html[data-theme="dark"] .qc-panel-foot{border-color:rgba(255,255,255,.1)}' +
    'html[data-theme="dark"] .qc-panel-head span,html[data-theme="dark"] .qc-alert-msg,html[data-theme="dark"] .qc-empty-sub{color:#a9a6bd}' +
    'html[data-theme="dark"] .qc-alert-title{color:#f2f0f8}html[data-theme="dark"] .qc-alert-x{color:#a9a6bd}' +
    'html[data-theme="dark"] .qc-panel-foot a{color:#7ee0d4}html[data-theme="dark"] .qc-panel-foot button{border-color:rgba(255,255,255,.2)}' +
    'html[data-theme="dark"] .qc-toast{background:#f2f0f8;color:#100e2a}' +
    /* top bar: one tidy row on desktop (it used to wrap and strand the bell under the logo), compact tabs as space shrinks */
    '@media (min-width:901px){.topbar{flex-wrap:nowrap!important}.tab-nav{flex:1 1 0!important;min-width:0;justify-content:safe center!important}.topbar-right{flex:0 0 auto}}' +
    '@media (min-width:901px) and (max-width:1500px){.tab-link{padding:9px 11px!important;font-size:13px!important;gap:5px!important}}' +
    '@media (min-width:901px) and (max-width:1340px){.tab-link .tl-ic{display:none}.tab-link{padding:9px 10px!important}}' +
    '@media (min-width:901px) and (max-width:1120px){.user-pill{display:none!important}}' +
    '@media (max-width:900px){.tab-nav{-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent);scroll-behavior:smooth}}' +
    '.qc-skel{display:block;border-radius:12px;background:linear-gradient(90deg,rgba(16,14,42,.06) 25%,rgba(16,14,42,.13) 37%,rgba(16,14,42,.06) 63%);background-size:400% 100%;animation:qcSkel 1.4s ease infinite}' +
    '@keyframes qcSkel{0%{background-position:100% 50%}100%{background-position:0 50%}}' +
    '.qc-skel-stack{display:flex;flex-direction:column;gap:10px;padding:4px 0}' +
    'html[data-theme="dark"] .qc-skel{background:linear-gradient(90deg,rgba(255,255,255,.06) 25%,rgba(255,255,255,.13) 37%,rgba(255,255,255,.06) 63%);background-size:400% 100%}' +
    '.qc-fresh{display:inline-flex;align-items:center;gap:6px;font:700 11px "Manrope",sans-serif;color:rgba(16,14,42,.5)}' +
    '.qc-fresh i{width:7px;height:7px;border-radius:50%;background:#c98a10;animation:qcPulse 1s ease infinite}.qc-fresh.done i{background:#0e8f83;animation:none}' +
    '@keyframes qcPulse{50%{opacity:.35}}' +
    'html[data-theme="dark"] .qc-fresh{color:#a9a6bd}' +
    '@media (prefers-reduced-motion:reduce){.qc-bell.is-urgent{animation:none}.qc-panel{animation:none}.qc-skel,.qc-fresh i{animation:none}}';
  /* A placeholder shaped like the content that is about to appear (feels faster than "Loading…"). */
  QC.skeleton = function (rows, height) {
    var out = '<div class="qc-skel-stack" aria-busy="true" aria-label="Loading">';
    for (var i = 0; i < (rows || 3); i++) out += '<span class="qc-skel" style="height:' + (height || 44) + 'px;width:' + (i === 0 ? "100%" : (92 - i * 9) + "%") + '"></span>';
    return out + '</div>';
  };
  var st = document.createElement("style"); st.id = "qc-app-css"; st.textContent = css; document.head.appendChild(st);

  /* ---------- boot ---------- */
  QC.boot = function () {
    buildBell();
    // On narrow screens the tab row scrolls sideways: bring the current page's tab into view.
    try {
      var nav = $(".tab-nav"), cur = nav && $(".tab-link.active", nav);
      if (nav && cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2);
    } catch (e) {}
    QC.refreshAlerts({});
    setInterval(function () { QC.refreshAlerts({ toast: false }); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) QC.refreshAlerts({ toast: false }); });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", QC.boot);
  else QC.boot();
})();
