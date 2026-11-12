/* The health app on a phone.
 *
 * Every page already carries the same row of tabs across the top.  On a small screen that row runs off the edge, so
 * you can neither see where you are nor what else there is.  This takes the row the page already has and moves it:
 * the chrome shrinks to one line, and the places you go sit along the bottom, where a thumb reaches.
 *
 * It reads the page's own nav, so a page with different tabs gets a different bar, and a page with none gets nothing.
 *
 * window.QCMob { sheet, close, open }
 */
(function () {
  "use strict";
  var PHONE = "(max-width: 760px)";
  /* the four a person reaches for; everything else is one tap away under More */
  var FIRST = ["Dashboard", "Symptoms", "Vitals", "CuraVault"];
  var BAR = null, SHEET = null, LAST = null;
  function $(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function on() { try { return matchMedia(PHONE).matches; } catch (e) { return false; } }

  /* these pages do not share one stylesheet, so the shell brings its own */
  function injectCss() {
    if (document.getElementById("qcm-css")) return;
    var st = document.createElement("style");
    st.id = "qcm-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  var CSS = `
  :root {
    --qcm-card: var(--card, #ffffff);
    --qcm-ink: var(--ink, #100e2a);
    --qcm-line: var(--line, rgba(16,14,42,.09));
    --qcm-muted: var(--muted, rgba(16,14,42,.58));
    --qcm-teal: var(--teal, #0e8f83);
    --qcm-teal-d: var(--teal-d, #0b6f66);
    --qcm-sand: var(--sand, #f6f5f1);
    --qcm-danger: var(--danger, #d24f28);
  }
  html[data-theme="dark"] {
    --qcm-card: var(--card, #18162e);
    --qcm-ink: var(--ink, #f2f0f8);
    --qcm-line: var(--line, rgba(255,255,255,.1));
    --qcm-muted: var(--muted, #a9a6bd);
    --qcm-teal: var(--teal, #7ee0d4);
    --qcm-teal-d: var(--teal-d, #a6efe6);
    --qcm-sand: var(--sand, #100e2a);
    --qcm-danger: var(--danger, #d24f28);
  }
/* ===================================================================================================
   The health app on a phone: one line of chrome, and the places you go along the bottom.
   =================================================================================================== */
.qcm-youbtn { display: none; }
.qcm-bar, .qcm-back { display: none; }

@media (max-width: 760px) {
  /* one line at the top: the mark, the bell, and you */
  html.qcm-on .topbar { flex-wrap: nowrap; gap: 8px; padding: 8px 14px; padding-top: max(8px, env(safe-area-inset-top)); }
  html.qcm-on .topbar .tab-nav { display: none; }
  html.qcm-on .topbar-right { gap: 8px; flex: 0 0 auto; }
  html.qcm-on .topbar-right .user-pill,
  html.qcm-on .topbar-right .signout-btn,
  html.qcm-on .topbar-right .theme-toggle,
  html.qcm-on .topbar-right .qc-lang { display: none !important; }
  html.qcm-on .logo-wrap { flex: 1 1 auto; min-width: 0; }
  html.qcm-on .logo-text { font-size: 16.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qcm-youbtn { display: grid; place-items: center; flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
    font: 800 12.5px 'Space Grotesk', sans-serif; color: #fff; background: linear-gradient(140deg, #0e8f83, #7c6fdb);
    box-shadow: 0 6px 16px -8px rgba(14,143,131,.8); }
  .qcm-youbtn:active { transform: scale(.94); }

  /* the bar */
  .qcm-bar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 140; justify-content: space-around; align-items: stretch;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom)); gap: 2px;
    background: color-mix(in srgb, var(--qcm-card) 88%, transparent); backdrop-filter: blur(16px) saturate(1.3);
    border-top: 1px solid var(--qcm-line); box-shadow: 0 -10px 30px -22px rgba(16,14,42,.5);
    transition: transform .26s cubic-bezier(.2,.9,.25,1); }
  .qcm-i { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    border: 0; background: transparent; cursor: pointer; padding: 7px 2px 5px; border-radius: 14px; min-height: 52px; text-decoration: none;
    color: var(--qcm-muted); font: 700 10.5px 'Manrope', sans-serif; position: relative; transition: color .2s ease; }
  .qcm-ic { font-size: 19px; line-height: 1; transition: transform .28s cubic-bezier(.2,.9,.25,1); }
  .qcm-l { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qcm-i.on { color: var(--qcm-teal); }
  .qcm-i.on .qcm-ic { transform: translateY(-2px) scale(1.12); }
  .qcm-i.on::before { content: ""; position: absolute; top: 2px; width: 22px; height: 3px; border-radius: 3px; background: var(--qcm-teal);
    animation: qcmIn .3s cubic-bezier(.2,.9,.25,1) both; }
  @keyframes qcmIn { from { width: 6px; opacity: 0; } to { width: 22px; opacity: 1; } }
  .qcm-i:active { background: rgba(14,143,131,.1); }

  /* room for it, and for anything that already lives at the bottom of the screen */
  html.qcm-on body { padding-bottom: calc(70px + env(safe-area-inset-bottom)); }
  html.qcm-on .qcp-toast { bottom: calc(80px + env(safe-area-inset-bottom)); }
  html.qcm-on .vp-nav { bottom: calc(66px + env(safe-area-inset-bottom)) !important; background: var(--qcm-sand) !important;
    border-top: 1px solid var(--qcm-line); margin: 0 -14px; padding: 10px 14px !important; }
  html.qcm-on .qc-dose-card, html.qcm-on .qc-toast { bottom: calc(80px + env(safe-area-inset-bottom)) !important; }

  /* sheets */
  .qcm-back { display: block; position: fixed; inset: 0; z-index: 400; background: rgba(8,7,22,0); transition: background .25s ease; }
  .qcm-back.in { background: rgba(8,7,22,.5); }
  .qcm-sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 88vh; display: flex; flex-direction: column;
    background: var(--qcm-card); color: var(--qcm-ink); border-radius: 26px 26px 0 0; border-top: 1px solid var(--qcm-line);
    box-shadow: 0 -24px 60px -30px rgba(16,14,42,.6); transform: translateY(102%);
    transition: transform .3s cubic-bezier(.2,.9,.25,1); padding-bottom: env(safe-area-inset-bottom); }
  .qcm-back.in .qcm-sheet { transform: none; }
  .qcm-grab { display: block; width: 42px; height: 4px; border-radius: 4px; background: var(--qcm-line); margin: 9px auto 2px; flex: none; }
  .qcm-head { display: flex; align-items: center; gap: 10px; padding: 6px 18px 10px; flex: none; }
  .qcm-head b { font: 700 17px 'Space Grotesk', sans-serif; flex: 1; }
  .qcm-x { border: 0; background: rgba(127,127,160,.14); color: var(--qcm-ink); width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 14px; }
  .qcm-body { overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 14px 18px; }
  .qcm-tall .qcm-sheet { height: 80vh; }

  .qcm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
  .qcm-t { display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; text-decoration: none; cursor: pointer;
    padding: 15px 7px; border-radius: 18px; background: rgba(127,127,160,.08); color: var(--qcm-ink);
    font: 700 12.5px 'Manrope', sans-serif; line-height: 1.25; border: 1.5px solid transparent; }
  .qcm-t.on { border-color: var(--qcm-teal); background: rgba(14,143,131,.1); color: var(--qcm-teal-d); }
  .qcm-t.soon { opacity: .5; cursor: default; }
  .qcm-t small { display: block; font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--qcm-muted); }
  .qcm-tic { font-size: 23px; line-height: 1; }
  .qcm-gh { font: 800 11px 'Manrope', sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--qcm-muted); padding: 18px 6px 8px; }
  .qcm-list { display: grid; gap: 2px; }
  .qcm-row { display: flex; align-items: center; gap: 13px; width: 100%; text-align: left; text-decoration: none; cursor: pointer;
    border: 0; background: transparent; color: var(--qcm-ink); padding: 12px 10px; border-radius: 15px; min-height: 54px;
    font: 600 14.5px 'Manrope', sans-serif; }
  .qcm-row:active { background: rgba(14,143,131,.1); }
  .qcm-row.act > span:first-child { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
    font-size: 18px; background: rgba(127,127,160,.12); }
  .qcm-row b { display: block; font: 700 15px 'Manrope', sans-serif; }
  .qcm-row small { display: block; font-size: 12px; color: var(--qcm-muted); font-weight: 600; line-height: 1.35; margin-top: 1px; }
  .qcm-row.danger b { color: var(--qcm-danger); }
  .qcm-you { display: flex; align-items: center; gap: 13px; padding: 4px 10px 14px; border-bottom: 1px solid var(--qcm-line); margin-bottom: 6px; }
  .qcm-av { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font: 800 16px 'Space Grotesk', sans-serif;
    color: #fff; background: linear-gradient(140deg, #0e8f83, #7c6fdb); }
  .qcm-you b { display: block; font: 700 17px 'Space Grotesk', sans-serif; }
  .qcm-you small { color: var(--qcm-muted); font-size: 12.5px; }

  /* a sheet owns the screen while it is up */
  html.qcm-on:has(.qcm-back) .qcm-bar { transform: translateY(130%); }
}
@media (max-width: 360px) { .qcm-l { font-size: 9.5px; } .qcm-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) and (orientation: landscape) and (max-height: 460px) {
  .qcm-bar { position: static; } html.qcm-on body { padding-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) { .qcm-i.on::before, .qcm-sheet, .qcm-back { animation: none !important; transition-duration: .01s !important; } }
@media print { .qcm-bar, .qcm-back, .qcm-youbtn { display: none !important; } }`;

  /* ------------------------------------------------------------------ what this page says the app contains */
  function tabs() {
    return all(".tab-nav .tab-link").map(function (a) {
      var ic = $(".tl-ic", a);
      return {
        href: a.getAttribute("href") || "#",
        icon: ic ? ic.textContent.trim() : "",
        label: a.textContent.replace(ic ? ic.textContent : "", "").replace(/soon/i, "").trim(),
        active: a.classList.contains("active"),
        soon: a.classList.contains("soon")
      };
    }).filter(function (t) { return t.label; });
  }
  function pick(list) {
    var out = [];
    FIRST.forEach(function (want) {
      var t = list.filter(function (x) { return x.label.toLowerCase() === want.toLowerCase(); })[0];
      if (t) out.push(t);
    });
    list.forEach(function (t) { if (out.length < 4 && !t.soon && out.indexOf(t) < 0) out.push(t); });
    return out.slice(0, 4);
  }
  function shortName(s) {
    return { Dashboard: "Home", CuraVault: "Vault", "Visit prep": "Visit", "Cura Chat": "Chat", Insights: "Insights" }[s] || s;
  }

  /* ------------------------------------------------------------------ the bar along the bottom */
  function build() {
    var list = tabs();
    if (!list.length || document.body.classList.contains("hp")) return;
    if (!BAR) {
      BAR = document.createElement("nav");
      BAR.className = "qcm-bar";
      BAR.id = "qcm-bar";
      BAR.setAttribute("aria-label", "Go to");
      document.body.appendChild(BAR);
      BAR.addEventListener("click", function (e) {
        var b = e.target.closest("[data-qcm]");
        if (b && b.getAttribute("data-qcm") === "__more") { e.preventDefault(); more(); }
      });
    }
    var main = pick(list);
    BAR.innerHTML = main.map(function (t) {
      return '<a class="qcm-i' + (t.active ? " on" : "") + '" href="' + esc(t.href) + '"' + (t.active ? ' aria-current="page"' : "") + '>' +
        '<span class="qcm-ic" aria-hidden="true">' + esc(t.icon) + '</span><span class="qcm-l">' + esc(shortName(t.label)) + "</span></a>";
    }).join("") +
      '<button type="button" class="qcm-i' + (main.some(function (t) { return t.active; }) ? "" : " on") + '" data-qcm="__more">' +
      '<span class="qcm-ic" aria-hidden="true">⋯</span><span class="qcm-l">More</span></button>';
    document.documentElement.classList.add("qcm-on");
  }
  function destroy() {
    if (BAR) { BAR.remove(); BAR = null; }
    document.documentElement.classList.remove("qcm-on");
  }

  /* ------------------------------------------------------------------ sheets */
  function sheet(title, html, cls) {
    close();
    var back = document.createElement("div");
    back.className = "qcm-back";
    back.innerHTML = '<div class="qcm-sheet ' + (cls || "") + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<span class="qcm-grab" aria-hidden="true"></span>' +
      '<div class="qcm-head"><b>' + esc(title) + '</b><button type="button" class="qcm-x" aria-label="Close">✕</button></div>' +
      '<div class="qcm-body">' + html + "</div></div>";
    document.body.appendChild(back);
    SHEET = back; LAST = document.activeElement;
    requestAnimationFrame(function () { back.classList.add("in"); });
    back.addEventListener("click", function (e) { if (e.target === back || e.target.closest(".qcm-x")) close(); });
    back.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    var f = back.querySelector("a, button:not(.qcm-x)");
    if (f) try { f.focus({ preventScroll: true }); } catch (x) {}
    return back;
  }
  function close() {
    var s = SHEET; SHEET = null;
    if (!s) return;
    s.classList.remove("in");
    setTimeout(function () { s.remove(); }, 250);
    if (LAST) { try { LAST.focus({ preventScroll: true }); } catch (e) {} LAST = null; }
  }

  function more() {
    var list = tabs(), main = pick(list);
    var rest = list.filter(function (t) { return main.indexOf(t) < 0; });
    var h = '<div class="qcm-grid">' + rest.map(function (t) {
      return (t.soon ? '<span class="qcm-t soon">' : '<a class="qcm-t' + (t.active ? " on" : "") + '" href="' + esc(t.href) + '">') +
        '<span class="qcm-tic" aria-hidden="true">' + esc(t.icon) + "</span>" + esc(t.label) +
        (t.soon ? '<small>Soon</small></span>' : "</a>");
    }).join("") + "</div>";
    // the quiet links a page keeps above the fold ("Your week in health", "Share with a doctor"…)
    var quick = all(".qc-ribbon a, .ribbon a, .page-links a").filter(function (a) { return a.offsetParent; });
    if (quick.length) {
      h += '<div class="qcm-gh">Also</div><div class="qcm-list">' + quick.map(function (a) {
        return '<a class="qcm-row" href="' + esc(a.getAttribute("href")) + '">' + esc(a.textContent.trim()) + "</a>";
      }).join("") + "</div>";
    }
    sheet("Everything in QueroCura", h, "qcm-tall");
  }

  function you() {
    var pill = $(".user-pill");
    var name = pill ? pill.textContent.replace(/^\s*[A-Z]{1,2}(?=[A-Z][a-z])/, "").trim() : "";
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var hi = $("#qc-lang-btn"), isHi = /^\/hi\//.test(location.pathname);
    var h = '<div class="qcm-you"><span class="qcm-av">' + esc(who()) + "</span><div><b>" + esc(name || "Your account") + "</b><small>Signed in</small></div></div><div class=\"qcm-list\">" +
      (hi ? '<button type="button" class="qcm-row act" data-act="lang"><span aria-hidden="true">🌐</span><span><b>' + (isHi ? "English" : "हिन्दी में देखें") + "</b><small>The whole app changes</small></span></button>" : "") +
      '<button type="button" class="qcm-row act" data-act="theme"><span aria-hidden="true">' + (dark ? "☀️" : "🌙") + '</span><span><b>' + (dark ? "Light" : "Dark") + ' mode</b><small>Easier at night</small></span></button>' +
      '<a class="qcm-row act" href="' + rel("profile/") + '"><span aria-hidden="true">👤</span><span><b>Profile</b><small>Everything QueroCura knows about you</small></span></a>' +
      '<a class="qcm-row act" href="' + rel("privacy/") + '"><span aria-hidden="true">🛡️</span><span><b>Privacy &amp; sharing</b><small>Who can see what, and for how long</small></span></a>' +
      '<button type="button" class="qcm-row act danger" data-act="out"><span aria-hidden="true">↩</span><span><b>Sign out</b></span></button></div>';
    var back = sheet("You", h);
    back.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var a = b.getAttribute("data-act");
      close();
      if (a === "theme") return window.toggleTheme && window.toggleTheme();
      if (a === "lang") { var l = $("#qc-lang-btn"); if (l) l.click(); return; }
      if (a === "out") { var s = $("#qc-signout-btn"); if (s) s.click(); }
    });
  }
  /* the user pill already carries the initials in its dot; fall back to the name */
  function who() {
    var dot = $(".user-pill .up-dot");
    if (dot && dot.textContent.trim()) return dot.textContent.trim().slice(0, 2).toUpperCase();
    var pill = $(".user-pill");
    return initials(pill ? pill.textContent.replace(/^\s*[A-Z]{1,2}(?=[A-Z][a-z])/, "") : "");
  }
  function initials(s) {
    var w = String(s || "").replace(/[^A-Za-zऀ-ॿ ]/g, " ").trim().split(/\s+/).filter(Boolean);
    return (w.slice(0, 2).map(function (x) { return x[0]; }).join("") || "·").toUpperCase();
  }
  /* pages sit one level down (/vitals/), so links between them are siblings */
  function rel(p) { return /\/hi\//.test(location.pathname) ? "/hi/" + p : "../" + p; }

  /* ------------------------------------------------------------------ the compact top bar */
  function chrome() {
    var right = $(".topbar-right");
    if (!right || $("#qcm-you")) return;
    var b = document.createElement("button");
    b.id = "qcm-you";
    b.className = "qcm-youbtn";
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-label", "You and your settings");
    b.textContent = who();
    b.addEventListener("click", you);
    right.appendChild(b);
  }

  function paint() {
    injectCss();
    chrome();
    if (on()) build(); else destroy();
  }
  function boot() {
    if (document.body.classList.contains("hp")) return;
    paint();
    // the tab row is built in pieces (Family and Visit prep are added after sign-in), so follow it
    var nav = $(".tab-nav");
    if (nav) new MutationObserver(function () { if (on()) build(); }).observe(nav, { childList: true });
    // the name arrives after the session check, so watch for it — but never react to our own button, or we loop
    var right = $(".topbar-right");
    if (right) new MutationObserver(function (recs) {
      if (recs.every(function (r) { return r.target === $("#qcm-you") || (r.target.parentNode && r.target.parentNode === $("#qcm-you")); })) return;
      var y = $("#qcm-you"), p = $(".user-pill");
      if (!y || !p) return;
      var v = who();
      if (v && y.textContent !== v) y.textContent = v;
    }).observe(right, { childList: true, subtree: true, characterData: true });
    try { matchMedia(PHONE).addEventListener("change", paint); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.QCMob = { sheet: sheet, close: close, you: you, more: more, open: function () { return !!SHEET; } };
})();
