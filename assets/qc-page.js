/* Shared boot for the newer pages: theme toggle, sign-out, session check, user pill, small helpers. */
(function () {
  "use strict";
  var API = (window.QC_API_BASE || "https://app.querocura.com/api");
  var root = document.documentElement;
  var SUN = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="#f2f0f8" stroke-width="1.7"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1 5.6 5.6" stroke="#f2f0f8" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var MOON = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  function applyTheme(dark) {
    root.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("qc-theme", dark ? "dark" : "light"); } catch (e) {}
    var i = document.getElementById("theme-toggle-icon"); if (i) i.innerHTML = dark ? SUN : MOON;
  }
  window.toggleTheme = function () { applyTheme(root.getAttribute("data-theme") !== "dark"); };
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-theme-toggle]")) window.toggleTheme(); });
  try { if (localStorage.getItem("qc-theme") === "dark") root.setAttribute("data-theme", "dark"); } catch (e) {}

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /** fetch JSON with cookies; never throws. Resolves {ok:false,message} on network/parse trouble. */
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", credentials: "include", headers: {} };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(API + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d.status = r.status; if (d.ok === undefined) d.ok = r.ok; return d; });
    }).catch(function () { return { ok: false, status: 0, message: "We couldn't reach QueroCura. Check your connection and try again." }; });
  }

  function toast(msg, kind) {
    var host = document.getElementById("toast-host");
    if (!host) { host = document.createElement("div"); host.id = "toast-host"; host.className = "toast-host"; document.body.appendChild(host); }
    var t = document.createElement("div");
    t.style.cssText = "background:#100e2a;color:#fff;padding:11px 18px;border-radius:14px;font:600 13.5px Manrope,sans-serif;box-shadow:0 18px 40px -14px rgba(0,0,0,.5);border-left:4px solid " + (kind === "err" ? "#d24f28" : "#0e8f83") + ";max-width:92vw";
    t.textContent = msg; host.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 3400);
  }

  function confetti(emojis, n) {
    emojis = emojis || ["✨", "💛", "🌸", "🎉", "🌿"]; n = n || 26;
    for (var i = 0; i < n; i++) {
      (function (i) {
        var p = document.createElement("span");
        p.textContent = emojis[i % emojis.length];
        p.style.cssText = "position:fixed;top:-20px;left:" + (Math.random() * 100) + "vw;font-size:" + (16 + Math.random() * 18) + "px;z-index:300;pointer-events:none;transition:transform " + (1.6 + Math.random() * 1.4) + "s cubic-bezier(.2,.7,.4,1),opacity 2.6s";
        document.body.appendChild(p);
        requestAnimationFrame(function () { p.style.transform = "translate(" + (Math.random() * 160 - 80) + "px," + (60 + Math.random() * 90) + "vh) rotate(" + (Math.random() * 540 - 270) + "deg)"; p.style.opacity = "0"; });
        setTimeout(function () { p.remove(); }, 3200);
      })(i);
    }
  }

  function openModal(id) { var m = document.getElementById(id); if (m) { m.classList.add("open"); var f = m.querySelector("input,select,textarea,button.btn"); if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 60); } }
  function closeModal(id) { var m = document.getElementById(id); if (m) m.classList.remove("open"); }
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("modal-back")) e.target.classList.remove("open");
    var x = e.target.closest && e.target.closest("[data-close]"); if (x) closeModal(x.getAttribute("data-close"));
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".modal-back.open").forEach(function (m) { m.classList.remove("open"); }); });

  var ready = null;
  /** Check the session, fill the user pill, wire sign-out. Resolves with /auth/me data, or redirects to login. */
  function init(opts) {
    opts = opts || {};
    applyTheme(root.getAttribute("data-theme") === "dark");
    var out = document.getElementById("qc-signout-btn");
    if (out) out.addEventListener("click", function () {
      if (window.QC && QC.clearCache) QC.clearCache(true);
      try { sessionStorage.removeItem("qc-acting"); } catch (e) {}
      api("/auth/logout", { method: "POST" }).then(function () { location.href = "../"; });
    });
    ready = api("/auth/me").then(function (me) {
      if (opts.requireLogin !== false && !me.logged_in) { location.href = "../login/?next=" + encodeURIComponent(location.pathname); return me; }
      var u = me.user || {};
      var name = u.display_name || u.username || u.email || "";
      var dot = document.getElementById("qc-user-dot"), nm = document.getElementById("qc-user-name");
      if (dot) dot.textContent = name ? name.trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("") : "?";
      if (nm) nm.textContent = name ? name.split(" ")[0] : "";
      if (window.QCVerifyBanner) window.QCVerifyBanner(me);
      return me;
    });
    return ready;
  }

  window.QCPage = { api: api, init: init, esc: esc, toast: toast, confetti: confetti, openModal: openModal, closeModal: closeModal, API: API };
})();
