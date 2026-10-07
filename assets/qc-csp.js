/* CSP support: the pages no longer run inline scripts or inline on*= attributes, so event handlers are registered in
   window.QCH (see assets/js/<page>-h.js) and dispatched from here.  Also: clickjacking guard (a <meta> CSP cannot
   carry frame-ancestors) and data-href navigation. */
(function () {
  "use strict";

  // Never let another site frame the app.
  try {
    if (window.top !== window.self) {
      document.documentElement.style.display = "none";
      window.top.location = window.self.location;
    }
  } catch (e) {
    document.documentElement.style.display = "none";
  }

  var H = (window.QCH = window.QCH || {});
  ["click", "input", "keydown", "keyup", "change", "submit"].forEach(function (type) {
    var attr = "data-h-" + type;
    document.addEventListener(type, function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[" + attr + "]") : null;
      while (el) {
        var fn = H[el.getAttribute(attr)];
        if (typeof fn === "function") {
          var out;
          try { out = fn.call(el, e); } catch (err) { if (window.console) console.error(err); }
          if (out === false) e.preventDefault();
        }
        if (e.cancelBubble) break;
        el = el.parentElement ? el.parentElement.closest("[" + attr + "]") : null;
      }
    }, false);
  });

  // <button data-href="../vitals/"> navigates like a link.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented) return;
    var a = e.target && e.target.closest ? e.target.closest("[data-href]") : null;
    if (a && !(e.target.closest && e.target.closest("a[href],button,input,select,textarea") && e.target.closest("a[href],button,input,select,textarea") !== a)) {
      location.href = a.getAttribute("data-href");
    }
  }, false);

  // <a href="#" data-noop> does nothing (the "coming soon" tabs).
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("[data-noop]") : null;
    if (a) e.preventDefault();
  }, false);

  // Keyboard activation for role=button elements that carry data-href.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var a = e.target && e.target.closest ? e.target.closest("[data-href][role=button]") : null;
    if (a) { e.preventDefault(); location.href = a.getAttribute("data-href"); }
  }, false);
})();

/* "Please confirm your e-mail" strip, shown on signed-in pages until the address is verified. */
(function () {
  "use strict";
  var API = window.QC_API_BASE || "https://app.querocura.com/api";
  window.QCVerifyBanner = function (me) {
    try {
      var u = me && me.logged_in && me.user;
      if (!u || u.email_verified !== false || !u.email || document.getElementById("qc-verify-banner")) return;
      if (sessionStorage.getItem("qc-verify-dismissed")) return;
      if (!document.getElementById("qc-verify-css")) {
        var st = document.createElement("style"); st.id = "qc-verify-css";
        st.textContent = ".verify-banner{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:9px 16px;background:rgba(201,138,16,.14);color:inherit;font:700 13px Manrope,sans-serif;border-bottom:1px solid rgba(201,138,16,.3)}"
          + ".verify-banner button{border:none;background:#100e2a;color:#fff;border-radius:999px;padding:6px 14px;font:800 12px Manrope,sans-serif;cursor:pointer}.verify-banner .x{background:transparent;color:inherit;opacity:.6;padding:4px 8px;font-size:15px}"
          + ".verify-banner a{color:#0e8f83;font-weight:800}";
        document.head.appendChild(st);
      }
      var bar = document.createElement("div");
      bar.id = "qc-verify-banner"; bar.className = "verify-banner"; bar.setAttribute("role", "status");
      var t = document.createElement("span"); t.textContent = "Please confirm your e-mail (" + u.email + ") so you can always recover your account.";
      var go = document.createElement("button"); go.type = "button"; go.textContent = "Send me the link";
      var x = document.createElement("button"); x.type = "button"; x.className = "x"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
      go.addEventListener("click", function () {
        go.disabled = true; go.textContent = "Sending…";
        fetch(API + "/auth/verify/send", { method: "POST", credentials: "include" }).then(function (r) { return r.json(); }).then(function (d) {
          go.textContent = d && d.ok ? "Check your inbox" : "Try later";
          if (d && d.dev_link) { var a = document.createElement("a"); a.href = "../verify/" + d.dev_link.slice(d.dev_link.indexOf("#")); a.textContent = "(dev link)"; t.appendChild(document.createTextNode(" ")); t.appendChild(a); }
        }).catch(function () { go.textContent = "Try later"; });
      });
      x.addEventListener("click", function () { try { sessionStorage.setItem("qc-verify-dismissed", "1"); } catch (e) {} bar.remove(); });
      bar.appendChild(t); bar.appendChild(go); bar.appendChild(x);
      var top = document.querySelector(".topbar");
      if (top && top.parentNode) top.parentNode.insertBefore(bar, top.nextSibling); else document.body.insertBefore(bar, document.body.firstChild);
    } catch (e) {}
  };
})();
