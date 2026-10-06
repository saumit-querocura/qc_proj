/* QueroCura web push (client).
 *
 *   QCPush.supported()            can this browser do push at all?
 *   QCPush.enable() / disable()   subscribe / unsubscribe THIS device
 *   QCPush.mountCard(el)          the Notifications settings card (Profile page)
 *   QCPush.maybePrompt()          a small, dismissible "turn on reminders?" nudge (shown once per ~2 weeks)
 *
 * Needs qc-app.js (QC.API_BASE, QC.toast, QC.esc). Quietly does nothing where push isn't possible or the
 * server hasn't been configured with VAPID keys yet.
 */
(function () {
  "use strict";
  var QCPush = window.QCPush = {};
  var API = function () { return (window.QC && QC.API_BASE) || "https://app.querocura.com/api"; };
  var DISMISS_KEY = "qc-push-dismissed";

  function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  QCPush.supported = supported;

  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function isStandalone() { return window.matchMedia && matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  // iPhones only deliver web push to apps added to the Home Screen.
  QCPush.needsInstall = function () { return isIOS() && !isStandalone(); };

  function api(path, opts) {
    opts = opts || {};
    return fetch(API() + path, { method: opts.method || "GET", credentials: "include", headers: opts.body ? { "Content-Type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); }).catch(function () { return { ok: false }; });
  }

  function b64ToUint8(b64) {
    var pad = "=".repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  var regPromise = null;
  function register() {
    if (!supported()) return Promise.reject(new Error("unsupported"));
    if (!regPromise) regPromise = navigator.serviceWorker.register("/sw.js").then(function () { return navigator.serviceWorker.ready; });
    return regPromise;
  }
  QCPush.register = register;

  QCPush.status = function () {
    var base = { supported: supported(), permission: supported() ? Notification.permission : "denied", subscribed: false, serverEnabled: false, prefs: null, devices: 0, needsInstall: QCPush.needsInstall() };
    return api("/push/config").then(function (cfg) {
      if (cfg && cfg.ok) { base.serverEnabled = !!cfg.enabled; base.prefs = cfg.prefs; base.devices = cfg.devices; base.publicKey = cfg.public_key; }
      if (!supported()) return base;
      return register().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { base.subscribed = !!sub && base.permission === "granted"; return base; }, function () { return base; });
    });
  };

  QCPush.enable = function () {
    if (!supported()) return Promise.reject(new Error("This browser can't show notifications."));
    if (QCPush.needsInstall()) return Promise.reject(new Error("On iPhone, first add QueroCura to your Home Screen (Share, then Add to Home Screen), then turn notifications on from there."));
    return api("/push/config").then(function (cfg) {
      if (!cfg.ok || !cfg.enabled || !cfg.public_key) throw new Error("Notifications aren't available yet. Please try again later.");
      return Notification.requestPermission().then(function (perm) {
        if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked for this site. You can allow them in your browser's site settings." : "Notifications weren't turned on.");
        return register();
      }).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (existing) {
          return existing || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(cfg.public_key) });
        });
      }).then(function (sub) {
        return api("/push/subscribe", { method: "POST", body: { subscription: sub.toJSON(), tz_offset_min: -new Date().getTimezoneOffset() } });
      }).then(function (res) {
        if (!res.ok) throw new Error(res.err || res.message || "Couldn't turn notifications on.");
        return res;
      });
    });
  };

  QCPush.disable = function () {
    return register().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return { ok: true };
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () { return api("/push/unsubscribe", { method: "POST", body: { endpoint: endpoint } }); });
    });
  };

  QCPush.setPrefs = function (changes) { return api("/push/prefs", { method: "POST", body: changes }); };
  QCPush.sendTest = function () { return api("/push/test", { method: "POST", body: {} }); };

  // the browser rotated our subscription: register the new one
  if (supported()) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "qc-push-resubscribe" && Notification.permission === "granted") QCPush.enable().catch(function () {});
    });
  }

  /* ---------------- settings card ---------------- */
  var CSS = '' +
    '.qcp-card{background:#fff;border:1px solid rgba(16,14,42,.08);border-radius:20px;padding:22px 24px;margin-bottom:18px}' +
    '.qcp-head{display:flex;align-items:center;gap:12px}.qcp-ic{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:17px;background:#fdf1d8;flex:0 0 auto}' +
    '.qcp-title{font:700 16.5px "Manrope",sans-serif;flex:1}.qcp-sub{font:500 13px/1.5 "Manrope",sans-serif;opacity:.65;margin:6px 0 0}' +
    '.qcp-switch{position:relative;width:48px;height:28px;flex:0 0 auto}.qcp-switch input{opacity:0;position:absolute;inset:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}' +
    '.qcp-switch i{position:absolute;inset:0;border-radius:999px;background:rgba(16,14,42,.2);transition:background .2s}.qcp-switch i:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:transform .2s}' +
    '.qcp-switch input:checked+i{background:#0e8f83}.qcp-switch input:checked+i:after{transform:translateX(20px)}.qcp-switch input:focus-visible+i{outline:2px solid #0e8f83;outline-offset:2px}.qcp-switch input:disabled{cursor:progress}' +
    '.qcp-opts{margin-top:14px;display:flex;flex-direction:column;gap:2px}.qcp-opt{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid rgba(16,14,42,.07);font:600 13.5px/1.4 "Manrope",sans-serif;cursor:pointer}' +
    '.qcp-opt input{margin-top:3px;width:17px;height:17px;accent-color:#0e8f83;flex:0 0 auto}.qcp-opt small{display:block;font-weight:500;opacity:.6;margin-top:2px}' +
    '.qcp-actions{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.qcp-btn{border:1.5px solid rgba(16,14,42,.16);background:transparent;border-radius:999px;padding:8px 16px;font:700 12.5px "Manrope",sans-serif;cursor:pointer;color:inherit}.qcp-btn:hover{border-color:#0e8f83;color:#0e8f83}.qcp-btn[disabled]{opacity:.5;cursor:progress}' +
    '.qcp-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(201,138,16,.1);border:1px solid rgba(201,138,16,.28);font:600 12.5px/1.5 "Manrope",sans-serif}' +
    '.qcp-toast{position:fixed;right:16px;bottom:16px;max-width:min(360px,calc(100vw - 32px));z-index:150;background:#fff;color:#100e2a;border:1px solid rgba(16,14,42,.1);border-radius:18px;padding:14px 16px;box-shadow:0 24px 50px -18px rgba(16,14,42,.4);font:500 13px/1.5 "Manrope",sans-serif;animation:qcpIn .3s ease}' +
    '.qcp-toast b{display:block;font:700 14px "Manrope",sans-serif;margin-bottom:2px}.qcp-toast .qcp-actions{margin-top:10px}.qcp-toast .qcp-btn.go{background:#0e8f83;border-color:#0e8f83;color:#fff}' +
    '@keyframes qcpIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    'html[data-theme="dark"] .qcp-card,html[data-theme="dark"] .qcp-toast{background:#18162e;color:#f2f0f8;border-color:rgba(255,255,255,.12)}html[data-theme="dark"] .qcp-btn{border-color:rgba(255,255,255,.22)}' +
    'html[data-theme="dark"] .qcp-ic{background:rgba(201,138,16,.2)}html[data-theme="dark"] .qcp-opt{border-color:rgba(255,255,255,.1)}@media (prefers-reduced-motion:reduce){.qcp-toast{animation:none}}';
  function injectCss() { if (document.getElementById("qcp-css")) return; var s = document.createElement("style"); s.id = "qcp-css"; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return window.QC ? QC.esc(s) : String(s); }
  function toast(msg, kind) { if (window.QC && QC.toast) QC.toast(msg, kind); }

  QCPush.mountCard = function (el) {
    injectCss();
    el.innerHTML = '<div class="qcp-card"><div class="qcp-head"><div class="qcp-ic">🔔</div><div class="qcp-title">Notifications</div></div><p class="qcp-sub">Checking…</p></div>';
    function render(st) {
      var on = st.subscribed, p = st.prefs || { calendar: true, checkin: true, details: false };
      var body;
      if (!st.supported) body = '<p class="qcp-sub">This browser can\'t show notifications. Reminders still appear inside QueroCura, under the bell.</p>';
      else if (!st.serverEnabled) body = '<p class="qcp-sub">Push notifications are being set up. They\'ll be available here soon. Reminders still appear inside QueroCura, under the bell.</p>';
      else body = '<p class="qcp-sub">Get a gentle nudge on this device for appointments and symptom check-ins, even when QueroCura is closed. Messages are kept vague by default so nothing private shows on your lock screen.</p>' +
        (st.needsInstall ? '<div class="qcp-note">📲 On iPhone, add QueroCura to your Home Screen first (Share, then Add to Home Screen), then open it from there to turn notifications on.</div>' : '') +
        (st.permission === "denied" ? '<div class="qcp-note">Notifications are blocked for this site. Allow them in your browser\'s site settings, then come back here.</div>' : '') +
        (on ? '<div class="qcp-opts">' +
          '<label class="qcp-opt"><input type="checkbox" data-p="calendar"' + (p.calendar ? " checked" : "") + '><span>Appointment reminders<small>At the reminder times you set on each calendar event.</small></span></label>' +
          '<label class="qcp-opt"><input type="checkbox" data-p="checkin"' + (p.checkin ? " checked" : "") + '><span>Symptom check-ins<small>"How are you feeling?" a day or two after a symptom check. Never at night.</small></span></label>' +
          '<label class="qcp-opt"><input type="checkbox" data-p="details"' + (p.details ? " checked" : "") + '><span>Show details in notifications<small>Include appointment titles and condition names. Visible on your lock screen.</small></span></label></div>' +
          '<div class="qcp-actions"><button type="button" class="qcp-btn" id="qcp-test">Send a test notification</button></div>' : '');
      var canToggle = st.supported && st.serverEnabled && !st.needsInstall && st.permission !== "denied";
      el.innerHTML = '<div class="qcp-card"><div class="qcp-head"><div class="qcp-ic">🔔</div><div class="qcp-title">Notifications</div>' +
        (canToggle ? '<label class="qcp-switch" title="Notifications on this device"><input type="checkbox" id="qcp-toggle" role="switch" aria-label="Notifications on this device"' + (on ? " checked" : "") + '><i></i></label>' : '') + '</div>' + body + '</div>';
      var tg = el.querySelector("#qcp-toggle");
      if (tg) tg.addEventListener("change", function () {
        tg.disabled = true;
        (tg.checked ? QCPush.enable() : QCPush.disable()).then(function () {
          toast(tg.checked ? "Notifications are on for this device 🔔" : "Notifications are off for this device.", "ok");
        }, function (e) { toast(e.message || "Couldn't change notifications.", "err"); }).then(refresh);
      });
      el.querySelectorAll("[data-p]").forEach(function (cb) {
        cb.addEventListener("change", function () { var ch = {}; ch[cb.getAttribute("data-p")] = cb.checked; QCPush.setPrefs(ch).then(function (r) { toast(r.ok ? "Saved ✓" : "Couldn't save that.", r.ok ? "ok" : "err"); }); });
      });
      var t = el.querySelector("#qcp-test");
      if (t) t.addEventListener("click", function () {
        t.disabled = true;
        QCPush.sendTest().then(function (r) { toast(r.ok ? "Test sent. It should arrive in a few seconds." : (r.err || "Couldn't send a test."), r.ok ? "ok" : "err"); t.disabled = false; });
      });
    }
    function refresh() { return QCPush.status().then(render); }
    return refresh();
  };

  /* ---------------- gentle one-time prompt ---------------- */
  QCPush.maybePrompt = function () {
    if (!supported() || QCPush.needsInstall() || Notification.permission !== "default") return;
    try { var d = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10); if (d && Date.now() - d < 14 * 864e5) return; } catch (e) {}
    QCPush.status().then(function (st) {
      if (!st.serverEnabled || st.subscribed || document.getElementById("qcp-prompt")) return;
      injectCss();
      var box = document.createElement("div");
      box.className = "qcp-toast"; box.id = "qcp-prompt"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Turn on reminders");
      box.innerHTML = '<b>🔔 Never miss a reminder</b>Get a nudge for appointments and check-ins on this device. You can turn it off any time in your profile.' +
        '<div class="qcp-actions"><button type="button" class="qcp-btn go" id="qcp-yes">Turn on</button><button type="button" class="qcp-btn" id="qcp-no">Not now</button></div>';
      document.body.appendChild(box);
      function close() { box.remove(); }
      box.querySelector("#qcp-no").addEventListener("click", function () { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {} close(); });
      box.querySelector("#qcp-yes").addEventListener("click", function () {
        QCPush.enable().then(function () { toast("Notifications are on 🔔", "ok"); close(); }, function (e) { toast(e.message || "Couldn't turn notifications on.", "err"); close(); });
      });
    });
  };

  // keep the worker registered (also speeds up repeat visits via its media cache) on every page that loads this file
  if (supported()) { if (document.readyState === "complete") register().catch(function () {}); else window.addEventListener("load", function () { register().catch(function () {}); }); }
})();
